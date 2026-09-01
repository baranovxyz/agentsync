import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { previewAgents, syncAgents } from "../../../src/sync/agents.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { splitFrontmatter } from "../../../src/utils/frontmatter.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

/** Parse the YAML frontmatter block of a synced agent file. */
function frontmatterOf(raw: string): Record<string, unknown> {
  return splitFrontmatter(raw).fm ?? {};
}

const CursorNativeAgentSchema = z
  .object({
    name: z.string(),
    description: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    readonly: z.boolean().optional(),
    is_background: z.boolean().optional(),
  })
  .strict();

const ClaudeNativeAgentSchema = z
  .object({
    name: z.string(),
    description: z.string().min(1),
    tools: z.unknown().optional(),
    disallowedTools: z.unknown().optional(),
    model: z.string().optional(),
    permissionMode: z.unknown().optional(),
    maxTurns: z.unknown().optional(),
    skills: z.unknown().optional(),
    mcpServers: z.unknown().optional(),
    hooks: z.unknown().optional(),
    memory: z.unknown().optional(),
    background: z.unknown().optional(),
    effort: z.unknown().optional(),
    isolation: z.unknown().optional(),
    color: z.unknown().optional(),
    initialPrompt: z.unknown().optional(),
    experimental: z.unknown().optional(),
  })
  .strict();

describe("Agents Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-agents-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies agents to Claude agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews code\n---\n# Code Reviewer Agent",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].agentCount).toBe(1);

    const agentFile = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(await pathExists(agentFile)).toBe(true);
    const content = await readFile(agentFile, "utf-8");
    expect(content).toContain("# Code Reviewer Agent");
  });

  it("copies agents to Copilot agents directory with .agent.md extension", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "tester.md"), "# Test Agent");

    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".github", "agents", "tester.agent.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("copies agents to OpenCode agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "planner.md"), "# Planner");

    const providers = [getToolProvider("opencode")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".opencode", "agents", "planner.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("skips tools that do not support agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "test.md"), "# Agent");

    // RooCode and Gemini don't support agents (Cursor and Codex now do).
    const providers = [getToolProvider("roocode"), getToolProvider("gemini")];
    const results = await syncAgents(providers, tmpDir);

    for (const result of results) {
      expect(result.agentCount).toBe(0);
      expect(result.warnings).toEqual([
        `${result.tool} does not support agents; 1 agent skipped`,
      ]);
    }
  });

  it("handles multiple agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\ndescription: Reviews code\n---\n# Reviewer",
    );
    await outputFile(
      path.join(agentsDir, "tester.md"),
      "---\ndescription: Tests code\n---\n# Tester",
    );
    await outputFile(
      path.join(agentsDir, "planner.md"),
      "---\ndescription: Plans work\n---\n# Planner",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(3);
  });

  it("copies agents with namespace prefix for presets", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(
      path.join(presetDir, "auditor.md"),
      "---\ndescription: Audits changes\n---\n# Auditor",
    );

    const presetAgents = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir, presetAgents);

    expect(results[0].agentCount).toBe(1);
    expect(results[0].agents).toContain("company--auditor.md");
  });

  it("prefixes only the first segment of a nested preset agent", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    await outputFile(
      path.join(presetDir, "nested", "auditor.md"),
      "---\ndescription: Audits nested changes\n---\n# Nested auditor",
    );

    const results = await syncAgents(
      [getToolProvider("claude")],
      tmpDir,
      new Map([["company", [presetDir]]]),
    );

    const relativePath = path.posix.join("company--nested", "auditor.md");
    expect(results[0].agents).toEqual([relativePath]);
    expect(
      await readFile(
        path.join(tmpDir, ".claude", "agents", relativePath),
        "utf-8",
      ),
    ).toContain("# Nested auditor");
  });

  it("handles empty agents directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(0);
  });

  it("does not warn an unsupported tool when no agents exist", async () => {
    const providers = [getToolProvider("roocode")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].warnings).toEqual([]);
  });
});

describe("Claude native agent projection", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(
      path.join(tmpdir(), "agentsync-claude-agents-test-"),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("projects the complete nested destination identity and only native fields", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    const body = "# Reviewer\r\nKeep this body byte-for-byte.\r\n";
    const source = [
      "---",
      "name: source-name",
      "description: Reviews release changes",
      "tools: Read, Grep",
      "disallowedTools: Write",
      "model: gpt-5",
      "permissionMode: plan",
      "maxTurns: 12",
      "skills: [release-review]",
      "mcpServers: [github]",
      "hooks:",
      "  PreToolUse: []",
      "memory: project",
      "background: true",
      "effort: high",
      "isolation: worktree",
      "color: blue",
      "initialPrompt: Start with the release diff",
      "experimental:",
      "  cacheTtl: 5m",
      "codex:",
      "  sandbox_mode: read-only",
      "capability: review",
      "skill_tags: [release]",
      "readonly: true",
      "mode: subagent",
      "---",
    ].join("\r\n");
    await outputFile(
      path.join(presetDir, "nested", "reviewer.md"),
      `${source}\r\n${body}`,
    );

    const presetAgents = new Map([["company", [presetDir]]]);
    const [preview] = await previewAgents(
      [getToolProvider("claude")],
      tmpDir,
      presetAgents,
    );
    const [written] = await syncAgents(
      [getToolProvider("claude")],
      tmpDir,
      presetAgents,
    );

    expect(written).toEqual(preview);
    expect(written.agents).toEqual([
      path.posix.join("company--nested", "reviewer.md"),
    ]);
    const raw = await readFile(
      path.join(tmpDir, ".claude", "agents", "company--nested", "reviewer.md"),
      "utf-8",
    );
    const parsed = splitFrontmatter(raw);
    const frontmatter = ClaudeNativeAgentSchema.parse(parsed.fm);
    expect(frontmatter).toEqual({
      name: "company--nested--reviewer",
      description: "Reviews release changes",
      tools: "Read, Grep",
      disallowedTools: "Write",
      permissionMode: "plan",
      maxTurns: 12,
      skills: ["release-review"],
      mcpServers: ["github"],
      hooks: { PreToolUse: [] },
      memory: "project",
      background: true,
      effort: "high",
      isolation: "worktree",
      color: "blue",
      initialPrompt: "Start with the release diff",
      experimental: { cacheTtl: "5m" },
    });
    expect(parsed.body).toBe(body);
    expect(parsed.eol).toBe("\r\n");
    expect(raw.replaceAll("\r\n", "")).not.toContain("\n");
    expect(written.warnings).toEqual([
      expect.stringContaining("dropped invalid model 'gpt-5'"),
      expect.stringContaining(
        "dropped unsupported frontmatter fields: capability, codex, mode, readonly, skill_tags",
      ),
    ]);
  });

  it("accepts current Claude aliases and full model IDs while dropping other aliases", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    const models = new Map([
      ["sonnet-agent", "sonnet"],
      ["opus-agent", "opus"],
      ["haiku-agent", "haiku"],
      ["fable-agent", "fable"],
      ["inherit-agent", "inherit"],
      ["full-model-agent", "claude-opus-5"],
      ["unsupported-alias", "fast"],
    ]);
    await Promise.all(
      [...models].map(([name, model]) =>
        outputFile(
          path.join(agentsDir, `${name}.md`),
          `---\ndescription: Tests ${model}\nmodel: ${model}\n---\nRun the task.`,
        ),
      ),
    );

    const [result] = await syncAgents([getToolProvider("claude")], tmpDir);

    for (const [name, model] of models) {
      const raw = await readFile(
        path.join(tmpDir, ".claude", "agents", `${name}.md`),
        "utf-8",
      );
      const frontmatter = ClaudeNativeAgentSchema.parse(frontmatterOf(raw));
      if (name === "unsupported-alias") {
        expect(frontmatter.model).toBeUndefined();
      } else {
        expect(frontmatter.model).toBe(model);
      }
    }
    expect(result.warnings).toEqual([
      expect.stringContaining("dropped invalid model 'fast'"),
    ]);
  });

  it("drops malformed optional fields instead of emitting an invalid native declaration", async () => {
    const agentPath = path.join(tmpDir, ".agents", "agents", "reviewer.md");
    await outputFile(
      agentPath,
      [
        "---",
        "description: Reviews changes",
        "model: sonnet",
        "permissionMode: unrestricted",
        "maxTurns: 0",
        "background: foreground",
        "skills: [valid, '']",
        "experimental:",
        "  cacheTtl: forever",
        "---",
        "Review changes.",
      ].join("\n"),
    );

    const [preview] = await previewAgents([getToolProvider("claude")], tmpDir);
    const [written] = await syncAgents([getToolProvider("claude")], tmpDir);
    const raw = await readFile(
      path.join(tmpDir, ".claude", "agents", "reviewer.md"),
      "utf-8",
    );

    expect(written).toEqual(preview);
    expect(ClaudeNativeAgentSchema.parse(frontmatterOf(raw))).toEqual({
      name: "reviewer",
      description: "Reviews changes",
      model: "sonnet",
    });
    for (const field of [
      "permissionMode",
      "maxTurns",
      "background",
      "skills",
      "experimental",
    ]) {
      expect(written.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`dropped invalid '${field}'`),
        ]),
      );
    }
  });

  it("skips declarations without an honest description or valid destination name", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await Promise.all([
      outputFile(
        path.join(agentsDir, "missing-description.md"),
        "---\nname: ignored\n---\nReview changes.",
      ),
      outputFile(
        path.join(agentsDir, "blank-description.md"),
        "---\ndescription: '   '\n---\nReview changes.",
      ),
      outputFile(
        path.join(agentsDir, "invalid_name.md"),
        "---\ndescription: Reviews changes\n---\nReview changes.",
      ),
    ]);

    const [preview] = await previewAgents([getToolProvider("claude")], tmpDir);
    const [written] = await syncAgents([getToolProvider("claude")], tmpDir);

    expect(written).toEqual(preview);
    expect(written.agentCount).toBe(0);
    expect(written.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("blank-description"),
        expect.stringContaining("missing-description"),
        expect.stringContaining("invalid_name"),
      ]),
    );
    expect(await pathExists(path.join(tmpDir, ".claude", "agents"))).toBe(
      false,
    );
  });
});

describe("Cursor agent validation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(
      path.join(tmpdir(), "agentsync-cursor-agents-test-"),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips malformed declarations and reports identical preview results", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await Promise.all([
      outputFile(
        path.join(agentsDir, "valid-agent.md"),
        [
          "---",
          "description: Reviews changes",
          "readonly: true",
          "capability: review",
          "---",
          "Review the proposed changes carefully.",
        ].join("\n"),
      ),
      outputFile(
        path.join(agentsDir, "missing-frontmatter.md"),
        "Review changes.",
      ),
      outputFile(
        path.join(agentsDir, "malformed-frontmatter.md"),
        "---\nname: [unterminated\n---\nReview changes.",
      ),
      outputFile(
        path.join(agentsDir, "empty-body.md"),
        "---\nname: empty-body\ndescription: Empty\n---\n   \n",
      ),
      outputFile(
        path.join(agentsDir, "missing-description.md"),
        "---\nname: ignored-source-name\n---\nReview changes.",
      ),
      outputFile(
        path.join(agentsDir, "invalid-metadata.md"),
        "---\ndescription: Invalid\nreadonly: yes\n---\nReview changes.",
      ),
    ]);

    const [preview] = await previewAgents([getToolProvider("cursor")], tmpDir);
    expect(preview.agentCount).toBe(2);
    expect(preview.agents).toEqual([
      "missing-description.md",
      "valid-agent.md",
    ]);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing-frontmatter"),
        expect.stringContaining("malformed-frontmatter"),
        expect.stringContaining("empty-body"),
        expect.stringContaining("invalid-metadata"),
      ]),
    );
    expect(await pathExists(path.join(tmpDir, ".cursor", "agents"))).toBe(
      false,
    );

    const [written] = await syncAgents([getToolProvider("cursor")], tmpDir);
    expect(written).toEqual(preview);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "agents", "valid-agent.md"),
      ),
    ).toBe(true);
    const projected = await readFile(
      path.join(tmpDir, ".cursor", "agents", "valid-agent.md"),
      "utf-8",
    );
    expect(CursorNativeAgentSchema.parse(frontmatterOf(projected))).toEqual({
      name: "valid-agent",
      description: "Reviews changes",
      readonly: true,
    });
    expect(written.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "dropped unsupported frontmatter fields: capability",
        ),
      ]),
    );
    const withoutDescription = await readFile(
      path.join(tmpDir, ".cursor", "agents", "missing-description.md"),
      "utf-8",
    );
    expect(
      CursorNativeAgentSchema.parse(frontmatterOf(withoutDescription)),
    ).toEqual({ name: "missing-description" });
    for (const skipped of [
      "missing-frontmatter.md",
      "malformed-frontmatter.md",
      "empty-body.md",
      "invalid-metadata.md",
    ]) {
      expect(
        await pathExists(path.join(tmpDir, ".cursor", "agents", skipped)),
      ).toBe(false);
    }
  });

  it("derives distinct flat names from complete nested preset destinations", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    const content = "---\ndescription: Reviews changes\n---\nReview changes.";
    await Promise.all([
      outputFile(path.join(presetDir, "api", "reviewer.md"), content),
      outputFile(path.join(presetDir, "web", "reviewer.md"), content),
    ]);

    const presetAgents = new Map([["company", [presetDir]]]);
    const [preview] = await previewAgents(
      [getToolProvider("cursor")],
      tmpDir,
      presetAgents,
    );
    const [written] = await syncAgents(
      [getToolProvider("cursor")],
      tmpDir,
      presetAgents,
    );

    expect(written).toEqual(preview);
    const identities = await Promise.all(
      ["api", "web"].map(async (directory) => {
        const raw = await readFile(
          path.join(
            tmpDir,
            ".cursor",
            "agents",
            `company--${directory}`,
            "reviewer.md",
          ),
          "utf-8",
        );
        return CursorNativeAgentSchema.parse(frontmatterOf(raw)).name;
      }),
    );
    expect(identities).toEqual([
      "company--api--reviewer",
      "company--web--reviewer",
    ]);
    expect(new Set(identities).size).toBe(2);
  });
});

describe("OpenCode agent frontmatter translation", () => {
  let tmpDir: string;

  // A canonical agentsync agent file (matches .agents/agents/*.md authored shape):
  // `tools` is a YAML scalar (comma list), `model` is a bare alias, plus the
  // AgentSync-only `capability`/`skill_tags`. OpenCode fatal-boots on the
  // bad-typed `tools` field; the rest is opencode-meaningless noise.
  const CANONICAL_AGENT = [
    "---",
    "name: researcher",
    "description: A generic research role.",
    "capability: research",
    "skill_tags: [research]",
    "tools: Read, Write, WebSearch, WebFetch, Bash",
    "model: sonnet",
    "---",
    "# Researcher",
    "You research things.",
  ].join("\n");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-oc-agents-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function syncOne(content: string): Promise<{
    fm: Record<string, unknown>;
    body: string;
    warnings: string[];
  }> {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "researcher.md"), content);

    const results = await syncAgents([getToolProvider("opencode")], tmpDir);
    const raw = await readFile(
      path.join(tmpDir, ".opencode", "agents", "researcher.md"),
      "utf-8",
    );
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return {
      fm: frontmatterOf(raw),
      body: bodyMatch ? bodyMatch[1] : raw,
      warnings: results[0].warnings,
    };
  }

  it("drops the agentsync `tools` allowlist so OpenCode boots", async () => {
    const { fm, warnings } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("tools");
    expect(warnings.join("\n")).toMatch(/tools/i);
  });

  it("drops a bare (unqualified) `model` alias and warns", async () => {
    const { fm, warnings } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("model");
    expect(warnings.join("\n")).toMatch(/model/i);
  });

  it("keeps a provider-qualified `model` untouched", async () => {
    const content = CANONICAL_AGENT.replace(
      "model: sonnet",
      "model: anthropic/claude-sonnet-4-20250514",
    );
    const { fm } = await syncOne(content);

    expect(fm.model).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("drops AgentSync-only `capability` and `skill_tags`", async () => {
    const { fm } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("capability");
    expect(fm).not.toHaveProperty("skill_tags");
  });

  it("defaults `mode` to subagent when absent", async () => {
    const { fm } = await syncOne(CANONICAL_AGENT);

    expect(fm.mode).toBe("subagent");
  });

  it("preserves an explicit opencode `mode`", async () => {
    const content = CANONICAL_AGENT.replace(
      "name: researcher",
      "name: researcher\nmode: primary",
    );
    const { fm } = await syncOne(content);

    expect(fm.mode).toBe("primary");
  });

  it("preserves description and body", async () => {
    const { fm, body } = await syncOne(CANONICAL_AGENT);

    expect(fm.description).toBe("A generic research role.");
    expect(body).toContain("# Researcher");
    expect(body).toContain("You research things.");
  });

  it("leaves an already-valid opencode `tools` record untouched", async () => {
    const content = [
      "---",
      "description: native opencode agent",
      "mode: subagent",
      "tools:",
      "  read: true",
      "  edit: false",
      "---",
      "# Native",
    ].join("\n");
    const { fm } = await syncOne(content);

    expect(fm.tools).toEqual({ read: true, edit: false });
  });

  it("accepts the stable agent schema and preserves provider options", async () => {
    const content = [
      "---",
      "description: native opencode agent",
      "model: anthropic/claude-sonnet-4-20250514",
      "variant: high",
      "temperature: 0.2",
      "top_p: 0.9",
      "prompt: overridden by the markdown body",
      "disable: false",
      "mode: all",
      "hidden: true",
      "color: '#12abEF'",
      "steps: 4",
      "maxSteps: 5",
      "options:",
      "  reasoningEffort: high",
      "permission:",
      "  read: allow",
      "  bash:",
      "    '*': ask",
      "    npm test: allow",
      "  todowrite: deny",
      "  custom_tool:",
      "    '*': ask",
      "custom_option: retained",
      "---",
      "Run the task.",
    ].join("\n");

    const { fm, warnings } = await syncOne(content);

    expect(fm).toMatchObject({
      model: "anthropic/claude-sonnet-4-20250514",
      variant: "high",
      temperature: 0.2,
      top_p: 0.9,
      prompt: "overridden by the markdown body",
      disable: false,
      mode: "all",
      hidden: true,
      color: "#12abEF",
      steps: 4,
      maxSteps: 5,
      options: { reasoningEffort: "high" },
      permission: {
        read: "allow",
        bash: { "*": "ask", "npm test": "allow" },
        todowrite: "deny",
        custom_tool: { "*": "ask" },
      },
      custom_option: "retained",
    });
    expect(warnings).toEqual([]);
  });

  it("accepts OpenCode's scalar permission shorthand", async () => {
    const { fm, warnings } = await syncOne(
      "---\ndescription: restricted\npermission: deny\n---\nRun safely.",
    );

    expect(fm.permission).toBe("deny");
    expect(warnings).toEqual([]);
  });

  it("skips invalid stable fields with preview/write parity", async () => {
    const source = [
      "---",
      "description: [invalid]",
      "model: [invalid]",
      "variant: [invalid]",
      "temperature: hot",
      "top_p: hot",
      "prompt: false",
      "disable: sometimes",
      "mode: worker",
      "hidden: sometimes",
      "options: []",
      "color: purple",
      "steps: 0",
      "maxSteps: -1",
      "permission:",
      "  todowrite:",
      "    '*': allow",
      "---",
      "Invalid declaration.",
    ].join("\n");
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "invalid.md"),
      source,
    );

    const [preview] = await previewAgents(
      [getToolProvider("opencode")],
      tmpDir,
    );
    const [written] = await syncAgents([getToolProvider("opencode")], tmpDir);

    expect(written).toEqual(preview);
    expect(written.agentCount).toBe(0);
    expect(written.agents).toEqual([]);
    const warning = written.warnings.join("\n");
    for (const field of [
      "color",
      "description",
      "disable",
      "hidden",
      "maxSteps",
      "mode",
      "model",
      "options",
      "permission",
      "prompt",
      "steps",
      "temperature",
      "top_p",
      "variant",
    ]) {
      expect(warning).toContain(`'${field}'`);
    }
    expect(warning).toContain("skipped");
    expect(
      await pathExists(path.join(tmpDir, ".opencode", "agents", "invalid.md")),
    ).toBe(false);
  });

  it("translates CRLF frontmatter and preserves CRLF output", async () => {
    const { fm, warnings } = await syncOne(
      CANONICAL_AGENT.replaceAll("\n", "\r\n"),
    );
    const raw = await readFile(
      path.join(tmpDir, ".opencode", "agents", "researcher.md"),
      "utf-8",
    );

    expect(fm).not.toHaveProperty("tools");
    expect(fm).not.toHaveProperty("model");
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("tools"),
        expect.stringContaining("model"),
      ]),
    );
    expect(raw).toContain("---\r\n");
    expect(raw.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("keeps Claude-native fields and strips provider-private metadata", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "researcher.md"), CANONICAL_AGENT);

    await syncAgents([getToolProvider("claude")], tmpDir);
    const raw = await readFile(
      path.join(tmpDir, ".claude", "agents", "researcher.md"),
      "utf-8",
    );

    const frontmatter = ClaudeNativeAgentSchema.parse(frontmatterOf(raw));
    expect(frontmatter.tools).toBe("Read, Write, WebSearch, WebFetch, Bash");
    expect(frontmatter.model).toBe("sonnet");
    expect(frontmatter).not.toHaveProperty("capability");
    expect(frontmatter).not.toHaveProperty("skill_tags");
  });
});
