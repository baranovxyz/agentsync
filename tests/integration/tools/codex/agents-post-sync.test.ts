/**
 * Codex agents post-sync hook — emits .codex/agents/<n>.toml role wrapper +
 * merges [agents.<n>] table into .codex/config.toml, preserving every other
 * key already in the config.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse, stringify } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { previewAgents, syncAgents } from "../../../../src/sync/agents.js";
import { syncManagedMCP } from "../../../../src/sync/mcp.js";
import { getToolProvider } from "../../../../src/tools/index.js";
import { ToolSettingsSchema } from "../../../../src/types/schemas.js";
import { ensureDir, outputFile, pathExists } from "../../../../src/utils/fs.js";

const CodexAgentEntriesSchema = z.record(
  z.string(),
  z
    .object({
      config_file: z.string().optional(),
      description: z.string().optional(),
      nickname_candidates: z.array(z.string()).optional(),
    })
    .loose(),
);

function parseSettings(content: string): Record<string, unknown> {
  return ToolSettingsSchema.parse(parse(content));
}

describe("Codex agentsPostHook", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-codex-agents-"));
    // Pre-seed a config.toml with unrelated keys to verify merge-preserve
    await ensureDir(path.join(tmpDir, ".codex"));
    await outputFile(
      path.join(tmpDir, ".codex", "config.toml"),
      'model = "gpt-5"\nsandbox_mode = "workspace-write"\n',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeReviewerSource(): Promise<string> {
    const sourcePath = path.join(tmpDir, ".agents", "agents", "reviewer.md");
    await outputFile(
      sourcePath,
      "---\ndescription: Managed reviewer\n---\n# Reviewer",
    );
    return sourcePath;
  }

  it("writes role-config TOML wrapper alongside the md body", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\ndescription: Careful code reviewer\n---\n# Reviewer\n\nReview the code carefully.",
    );

    await syncAgents([getToolProvider("codex")], tmpDir);

    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.md")),
    ).toBe(true);

    const tomlPath = path.join(tmpDir, ".codex", "agents", "reviewer.toml");
    expect(await pathExists(tomlPath)).toBe(true);
    const roleConfig = parseSettings(await readFile(tomlPath, "utf-8"));
    expect(roleConfig.model_instructions_file).toBe("reviewer.md");
    expect(
      path.resolve(
        path.dirname(tomlPath),
        String(roleConfig.model_instructions_file),
      ),
    ).toBe(path.join(tmpDir, ".codex", "agents", "reviewer.md"));
  });

  it("merges [agents.<n>] into .codex/config.toml and preserves unrelated keys", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      [
        "---",
        "description: Careful code reviewer",
        "codex:",
        '  nickname_candidates: ["nit", "Iris"]',
        "  max_depth: 2",
        "---",
        "# Reviewer",
      ].join("\n"),
    );

    const [result] = await syncAgents([getToolProvider("codex")], tmpDir);

    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );

    // Unrelated keys preserved
    expect(config.model).toBe("gpt-5");
    expect(config.sandbox_mode).toBe("workspace-write");

    // [agents.reviewer] table emitted with lifted metadata
    const agents = CodexAgentEntriesSchema.parse(config.agents);
    expect(agents.reviewer).toBeDefined();
    expect(agents.reviewer.config_file).toBe("agents/reviewer.toml");
    expect(agents.reviewer.description).toBe("Careful code reviewer");
    expect(agents.reviewer.nickname_candidates).toEqual(["nit", "Iris"]);
    expect(agents.reviewer.max_depth).toBeUndefined();
    expect(result.warnings).toEqual([
      expect.stringContaining("codex.max_depth dropped"),
    ]);
  });

  it("projects only supported, schema-valid codex.* role fields", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "sandbox-bound.md"),
      [
        "---",
        "description: Sandbox-bound worker",
        "codex:",
        '  sandbox_mode: "read-only"',
        "  model_reasoning_effort: ultra",
        "  model_context_window: 128000",
        "  model_verbosity: verbose",
        "  web_search: indexed",
        "  future_setting: true",
        '  nickname_candidates: ["Iris", ""]',
        "---",
        "# Sandbox-bound",
      ].join("\n"),
    );

    const [preview] = await previewAgents([getToolProvider("codex")], tmpDir);
    const [result] = await syncAgents([getToolProvider("codex")], tmpDir);

    const roleConfig = parseSettings(
      await readFile(
        path.join(tmpDir, ".codex", "agents", "sandbox-bound.toml"),
        "utf-8",
      ),
    );
    expect(roleConfig.sandbox_mode).toBe("read-only");
    expect(roleConfig.model_reasoning_effort).toBe("ultra");
    expect(roleConfig.model_context_window).toBe(128000);
    expect(roleConfig.model_verbosity).toBeUndefined();
    expect(roleConfig.web_search).toBe("indexed");
    expect(roleConfig.future_setting).toBeUndefined();
    // metadata that belongs in [agents.<n>] should NOT leak into the role TOML
    expect(roleConfig.description).toBeUndefined();
    expect(roleConfig.nickname_candidates).toBeUndefined();
    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    const agents = CodexAgentEntriesSchema.parse(config.agents);
    expect(agents["sandbox-bound"].nickname_candidates).toBeUndefined();
    expect(result.warnings).toEqual(preview.warnings);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("model_verbosity dropped"),
        expect.stringContaining("future_setting dropped"),
        expect.stringContaining("nickname_candidates dropped"),
      ]),
    );
  });

  it("preserves indexed search and granular approval while dropping invalid granular values", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await outputFile(
      path.join(agentsDir, "valid-policy.md"),
      [
        "---",
        "description: Valid policy",
        "codex:",
        "  web_search: indexed",
        "  approval_policy:",
        "    granular:",
        "      sandbox_approval: true",
        "      rules: false",
        "      mcp_elicitations: true",
        "      skill_approval: false",
        "      request_permissions: true",
        "---",
        "# Valid policy",
      ].join("\n"),
    );
    await outputFile(
      path.join(agentsDir, "invalid-policy.md"),
      [
        "---",
        "description: Invalid policy",
        "codex:",
        "  approval_policy:",
        "    granular:",
        "      sandbox_approval: sometimes",
        "      rules: false",
        "      mcp_elicitations: true",
        "---",
        "# Invalid policy",
      ].join("\n"),
    );

    const [preview] = await previewAgents([getToolProvider("codex")], tmpDir);
    const [written] = await syncAgents([getToolProvider("codex")], tmpDir);
    const valid = parseSettings(
      await readFile(
        path.join(tmpDir, ".codex", "agents", "valid-policy.toml"),
        "utf-8",
      ),
    );
    const invalid = parseSettings(
      await readFile(
        path.join(tmpDir, ".codex", "agents", "invalid-policy.toml"),
        "utf-8",
      ),
    );

    expect(valid.web_search).toBe("indexed");
    expect(
      z
        .object({
          granular: z.object({
            sandbox_approval: z.boolean(),
            rules: z.boolean(),
            mcp_elicitations: z.boolean(),
            skill_approval: z.boolean().optional(),
            request_permissions: z.boolean().optional(),
          }),
        })
        .parse(valid.approval_policy),
    ).toEqual({
      granular: {
        sandbox_approval: true,
        rules: false,
        mcp_elicitations: true,
        skill_approval: false,
        request_permissions: true,
      },
    });
    expect(invalid.approval_policy).toBeUndefined();
    expect(written.warnings).toEqual(preview.warnings);
    expect(written.warnings).toEqual([
      expect.stringContaining("approval_policy dropped"),
    ]);
  });

  it("normalizes upstream-compatible nickname candidates", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      [
        "---",
        "description: Managed reviewer",
        "codex:",
        '  nickname_candidates: ["  Iris  ", "review_bot-2", "QA Lead"]',
        "---",
        "# Reviewer",
      ].join("\n"),
    );

    const [result] = await syncAgents([getToolProvider("codex")], tmpDir);
    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    const agents = CodexAgentEntriesSchema.parse(config.agents);

    expect(agents.reviewer.nickname_candidates).toEqual([
      "Iris",
      "review_bot-2",
      "QA Lead",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it.each([
    { candidates: [], reason: "at least one" },
    { candidates: ["Iris", " Iris "], reason: "duplicates" },
    { candidates: ["Iris!"], reason: "ASCII" },
    { candidates: ["Íris"], reason: "ASCII" },
  ])("drops invalid nickname candidates %# with the upstream reason", async ({
    candidates,
    reason,
  }) => {
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      [
        "---",
        "description: Managed reviewer",
        "codex:",
        `  nickname_candidates: ${JSON.stringify(candidates)}`,
        "---",
        "# Reviewer",
      ].join("\n"),
    );

    const [preview] = await previewAgents([getToolProvider("codex")], tmpDir);
    const [written] = await syncAgents([getToolProvider("codex")], tmpDir);
    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    const agents = CodexAgentEntriesSchema.parse(config.agents);

    expect(agents.reviewer.nickname_candidates).toBeUndefined();
    expect(written.warnings).toEqual(preview.warnings);
    expect(written.warnings).toEqual([
      expect.stringContaining("nickname_candidates dropped"),
    ]);
    expect(written.warnings[0]).toContain(reason);
  });

  it("skips roles without a description in real and preview projections", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "undocumented.md"),
      "---\nname: undocumented\n---\n# Undocumented",
    );

    const [preview] = await previewAgents([getToolProvider("codex")], tmpDir);
    expect(preview.agentCount).toBe(0);
    expect(preview.warnings).toEqual([
      expect.stringContaining("description is required"),
    ]);
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", "agents", "undocumented.md"),
      ),
    ).toBe(false);

    const [result] = await syncAgents([getToolProvider("codex")], tmpDir);
    expect(result).toMatchObject({
      agentCount: preview.agentCount,
      warnings: preview.warnings,
    });
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", "agents", "undocumented.md"),
      ),
    ).toBe(false);
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", "agents", "undocumented.toml"),
      ),
    ).toBe(false);

    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    expect(config.agents).toBeUndefined();
  });

  it("preserves preset namespaces in role files and role identities", async () => {
    const companyAgents = path.join(tmpDir, "presets", "company");
    const teamAgents = path.join(tmpDir, "presets", "team");
    await outputFile(
      path.join(companyAgents, "reviewer.md"),
      "---\ndescription: Reviews company policy\n---\n# Company reviewer",
    );
    await outputFile(
      path.join(teamAgents, "reviewer.md"),
      "---\ndescription: Reviews team changes\n---\n# Team reviewer",
    );
    const presets = new Map([
      ["company", [companyAgents]],
      ["team", [teamAgents]],
    ]);

    const [preview] = await previewAgents(
      [getToolProvider("codex")],
      tmpDir,
      presets,
    );
    expect(preview.agents).toEqual([
      "company--reviewer.md",
      "team--reviewer.md",
    ]);
    expect(await pathExists(path.join(tmpDir, ".codex", "agents"))).toBe(false);

    const [result] = await syncAgents(
      [getToolProvider("codex")],
      tmpDir,
      presets,
    );
    expect(result).toMatchObject({
      agents: preview.agents,
      agentCount: preview.agentCount,
      warnings: preview.warnings,
    });

    for (const namespace of ["company", "team"]) {
      const roleConfig = parseSettings(
        await readFile(
          path.join(tmpDir, ".codex", "agents", `${namespace}--reviewer.toml`),
          "utf-8",
        ),
      );
      expect(roleConfig.model_instructions_file).toBe(
        `${namespace}--reviewer.md`,
      );
    }

    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    const agents = CodexAgentEntriesSchema.parse(config.agents);
    expect(agents["company--reviewer"]).toMatchObject({
      config_file: "agents/company--reviewer.toml",
      description: "Reviews company policy",
    });
    expect(agents["team--reviewer"]).toMatchObject({
      config_file: "agents/team--reviewer.toml",
      description: "Reviews team changes",
    });
    expect(agents.reviewer).toBeUndefined();
  });

  it("withdraws removed owned roles while preserving hand-authored siblings", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    const configPath = path.join(tmpDir, ".codex", "config.toml");
    await outputFile(
      configPath,
      [
        'model = "gpt-5"',
        "",
        "[agents.manual]",
        'config_file = "agents/manual.toml"',
        'description = "Manual role"',
      ].join("\n"),
    );
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\ndescription: Managed reviewer\n---\n# Reviewer",
    );

    await syncAgents([getToolProvider("codex")], tmpDir);
    await rm(path.join(agentsDir, "reviewer.md"));
    const [second] = await syncAgents([getToolProvider("codex")], tmpDir);

    expect(second.agents).toEqual([]);
    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.md")),
    ).toBe(false);
    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.toml")),
    ).toBe(false);
    const config = parseSettings(await readFile(configPath, "utf-8"));
    const agents = CodexAgentEntriesSchema.parse(config.agents);
    expect(agents.reviewer).toBeUndefined();
    expect(agents.manual).toMatchObject({
      config_file: "agents/manual.toml",
      description: "Manual role",
    });
  });

  it("preserves a modified stale role and relinquishes its ownership", async () => {
    const sourcePath = path.join(tmpDir, ".agents", "agents", "reviewer.md");
    const outputPath = path.join(tmpDir, ".codex", "agents", "reviewer.md");
    await outputFile(
      sourcePath,
      "---\ndescription: Managed reviewer\n---\n# Reviewer",
    );
    await syncAgents([getToolProvider("codex")], tmpDir);
    await outputFile(outputPath, "# User-maintained reviewer\n");
    await rm(sourcePath);

    const [result] = await syncAgents([getToolProvider("codex")], tmpDir);

    expect(await readFile(outputPath, "utf-8")).toBe(
      "# User-maintained reviewer\n",
    );
    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.toml")),
    ).toBe(true);
    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    expect(config.agents).toMatchObject({ reviewer: expect.any(Object) });
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", ".agentsync-ownership.json"),
      ),
    ).toBe(false);
    expect(result.warnings).toEqual([
      expect.stringContaining("ownership was relinquished"),
    ]);
  });

  it.each([
    {
      surface: "Markdown artifact",
      seed: async (cwd: string) => {
        const artifactPath = path.join(cwd, ".codex", "agents", "reviewer.md");
        const content = "# Hand-authored reviewer\n";
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
    {
      surface: "role TOML artifact",
      seed: async (cwd: string) => {
        const artifactPath = path.join(
          cwd,
          ".codex",
          "agents",
          "reviewer.toml",
        );
        const content = 'model_instructions_file = "manual.md"\n';
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
    {
      surface: "config entry",
      seed: async (cwd: string) => {
        const artifactPath = path.join(cwd, ".codex", "config.toml");
        const content = [
          'model = "gpt-5"',
          "",
          "[agents.reviewer]",
          'config_file = "agents/manual.toml"',
          'description = "Hand-authored reviewer"',
        ].join("\n");
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
  ])("fails closed on a first-sync $surface collision", async ({ seed }) => {
    await writeReviewerSource();
    const { artifactPath, content } = await seed(tmpDir);

    await expect(
      previewAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      suggestion: expect.any(String),
    });
    await expect(
      syncAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });

    expect(await readFile(artifactPath, "utf-8")).toBe(content);
  });

  it.each([
    {
      surface: "Markdown artifact",
      modify: async (cwd: string) => {
        const artifactPath = path.join(cwd, ".codex", "agents", "reviewer.md");
        const content = "# User-modified reviewer\n";
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
    {
      surface: "role TOML artifact",
      modify: async (cwd: string) => {
        const artifactPath = path.join(
          cwd,
          ".codex",
          "agents",
          "reviewer.toml",
        );
        const content = [
          'model_instructions_file = "reviewer.md"',
          'model = "user-choice"',
        ].join("\n");
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
    {
      surface: "config entry",
      modify: async (cwd: string) => {
        const artifactPath = path.join(cwd, ".codex", "config.toml");
        const config = parseSettings(await readFile(artifactPath, "utf-8"));
        const agents = CodexAgentEntriesSchema.parse(config.agents);
        agents.reviewer.description = "User-modified reviewer";
        const content = stringify({ ...config, agents });
        await outputFile(artifactPath, content);
        return { artifactPath, content };
      },
    },
  ])("fails closed before overwriting a modified desired $surface", async ({
    modify,
  }) => {
    await writeReviewerSource();
    await syncAgents([getToolProvider("codex")], tmpDir);
    const { artifactPath, content } = await modify(tmpDir);
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "fresh.md"),
      "---\ndescription: Fresh role\n---\n# Fresh",
    );

    await expect(
      previewAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    await expect(
      syncAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      suggestion: expect.any(String),
    });

    expect(await readFile(artifactPath, "utf-8")).toBe(content);
    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "fresh.md")),
    ).toBe(false);
  });

  it("deduplicates global and project agents by final destination", async () => {
    const globalDir = path.join(tmpDir, "global-agents");
    const projectDir = path.join(tmpDir, ".agents", "agents");
    await outputFile(
      path.join(globalDir, "reviewer.md"),
      "---\ndescription: Global reviewer\n---\n# Global",
    );
    await outputFile(
      path.join(projectDir, "reviewer.md"),
      "---\ndescription: Project reviewer\n---\n# Project",
    );

    const [preview] = await previewAgents(
      [getToolProvider("codex")],
      tmpDir,
      undefined,
      { globalDirs: [globalDir] },
    );
    const [result] = await syncAgents(
      [getToolProvider("codex")],
      tmpDir,
      undefined,
      { globalDirs: [globalDir] },
    );

    expect(result).toMatchObject({
      agentCount: 1,
      agents: ["reviewer.md"],
    });
    expect(preview).toMatchObject({
      agentCount: result.agentCount,
      agents: result.agents,
    });
    expect(
      await readFile(
        path.join(tmpDir, ".codex", "agents", "reviewer.md"),
        "utf-8",
      ),
    ).toContain("# Project");
    const config = parseSettings(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    );
    expect(config.agents).toMatchObject({
      reviewer: { description: "Project reviewer" },
    });
  });

  it("fails closed on malformed project TOML during preview and sync", async () => {
    const configPath = path.join(tmpDir, ".codex", "config.toml");
    await outputFile(configPath, 'model = ["unterminated"\n');

    await expect(
      previewAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath },
      suggestion: expect.stringContaining("Repair the existing TOML"),
    });
    await expect(
      syncAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    expect(await readFile(configPath, "utf-8")).toBe(
      'model = ["unterminated"\n',
    );
  });

  it("fails closed when the project TOML path is unreadable", async () => {
    const configPath = path.join(tmpDir, ".codex", "config.toml");
    await rm(configPath);
    await ensureDir(configPath);

    await expect(
      previewAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath },
    });
  });

  it("does not overwrite malformed opt-in home TOML", async () => {
    const home = path.join(tmpDir, "home");
    const homeConfig = path.join(home, ".codex", "config.toml");
    const malformed = 'model = ["unterminated"\n';
    await outputFile(homeConfig, malformed);
    const previousHome = process.env.HOME;
    const previousOptIn = process.env.AGENTSYNC_CODEX_HOME_MCP;
    process.env.HOME = home;
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    try {
      await expect(
        syncManagedMCP(
          [getToolProvider("codex")],
          {
            tracker: { command: "node", args: ["server.js"] },
          },
          tmpDir,
        ),
      ).rejects.toMatchObject({
        code: "CONFIG_ERROR",
        context: { configPath: homeConfig },
      });
      expect(await readFile(homeConfig, "utf-8")).toBe(malformed);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousOptIn === undefined) {
        delete process.env.AGENTSYNC_CODEX_HOME_MCP;
      } else {
        process.env.AGENTSYNC_CODEX_HOME_MCP = previousOptIn;
      }
    }
  });

  it("rejects flattened role collisions during preview before writing", async () => {
    const projectAgents = path.join(tmpDir, ".agents", "agents");
    await outputFile(
      path.join(projectAgents, "company--nested", "reviewer.md"),
      "---\ndescription: First reviewer\n---\n# First reviewer",
    );
    await outputFile(
      path.join(projectAgents, "company", "nested--reviewer.md"),
      "---\ndescription: Second reviewer\n---\n# Second reviewer",
    );

    await expect(
      previewAgents([getToolProvider("codex")], tmpDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      message: expect.stringContaining(
        'both project to role "company--nested--reviewer"',
      ),
      suggestion: expect.stringContaining(
        "Rename one agent or preset namespace",
      ),
    });
    expect(await pathExists(path.join(tmpDir, ".codex", "agents"))).toBe(false);
  });
});
