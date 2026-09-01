/**
 * Clean Command Tests
 * Verifies that agentsync clean removes generated files from holdout tools
 * without touching .agents/ source content or native tool files.
 */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type CleanResult, cleanCommand } from "../../../src/commands/clean.js";
import { SUPPORTED_TOOLS, type ToolName } from "../../../src/constants.js";
import { ConfigError } from "../../../src/core/errors.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { syncAgents } from "../../../src/sync/agents.js";
import { syncExtensions } from "../../../src/sync/extensions.js";
import {
  getManifestPath,
  hashFile,
  readManifest,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import { syncManagedMCP } from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  ensureDir,
  outputFile,
  pathExists,
  readJsonValidated,
} from "../../../src/utils/fs.js";

const CodexCleanAgentsSchema = z.record(
  z.string(),
  z
    .object({
      config_file: z.string(),
      description: z.string(),
    })
    .loose(),
);

describe("Clean Command", () => {
  let tmpDir: string;

  function projectPath(...segments: string[]): string {
    return path.join(tmpDir, ...segments);
  }

  async function expectPathsExist(...filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      expect(await pathExists(filePath), `${filePath} should exist`).toBe(true);
    }
  }

  async function expectPathsMissing(...filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      expect(await pathExists(filePath), `${filePath} should not exist`).toBe(
        false,
      );
    }
  }

  async function readText(filePath: string): Promise<string> {
    return readFile(filePath, "utf-8");
  }

  async function readTexts(filePaths: readonly string[]): Promise<string[]> {
    return Promise.all(filePaths.map(readText));
  }

  async function readToolSettings(filePath: string) {
    return ToolSettingsSchema.parse(parseToml(await readText(filePath)));
  }

  async function readJsonSettings(filePath: string) {
    return readJsonValidated(filePath, ToolSettingsSchema);
  }

  function codexReceiptPath(): string {
    return projectPath(".codex", ".agentsync-ownership.json");
  }

  async function writeFiles(files: ReadonlyMap<string, string>): Promise<void> {
    await Promise.all(
      [...files].map(([filePath, content]) => outputFile(filePath, content)),
    );
  }

  async function writeTextToPaths(
    content: string,
    ...filePaths: string[]
  ): Promise<void> {
    await Promise.all(
      filePaths.map((filePath) => outputFile(filePath, content)),
    );
  }

  function expectNoRemovals(result: CleanResult): void {
    expect(result.removedFiles).toEqual([]);
    expect(result.removedDirs).toEqual([]);
  }

  function restoreEnvironment(
    name: "HOME" | "AGENTSYNC_CODEX_HOME_MCP",
    previousValue: string | undefined,
  ): void {
    if (previousValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previousValue;
    }
  }

  async function withCodexHomeMcp<T>(
    homeName: string,
    run: (homeConfig: string) => Promise<T>,
  ): Promise<T> {
    const previousHome = process.env.HOME;
    const previousOptIn = process.env.AGENTSYNC_CODEX_HOME_MCP;
    const home = projectPath(homeName);
    process.env.HOME = home;
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    try {
      return await run(path.join(home, ".codex", "config.toml"));
    } finally {
      restoreEnvironment("HOME", previousHome);
      restoreEnvironment("AGENTSYNC_CODEX_HOME_MCP", previousOptIn);
    }
  }

  async function withTemporaryDirectory<T>(
    prefix: string,
    run: (directory: string) => Promise<T>,
  ): Promise<T> {
    const directory = await mkdtemp(path.join(tmpdir(), prefix));
    try {
      return await run(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-clean-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupProject(
    tools: readonly ToolName[],
    opts: { mcp?: boolean } = {},
  ): Promise<void> {
    await ensureDir(projectPath(".agents"));
    const mcp = opts.mcp
      ? '\n[mcp.tracker]\ncommand = "npx"\nargs = ["-y", "@org/tracker"]\n'
      : "";
    await outputFile(
      projectPath(".agents", "agentsync.toml"),
      `tools = [${tools.map((t) => `"${t}"`).join(", ")}]\n${mcp}`,
    );
  }

  async function createGeneratedFiles(
    toolDir: string,
    opts: {
      skills?: boolean;
      commands?: boolean;
      agents?: boolean;
      mcpFile?: string;
      docsFile?: string;
    },
  ): Promise<void> {
    const fixtures: Array<readonly [string | undefined, string]> = [
      [
        opts.skills
          ? projectPath(toolDir, "skills", "test", "SKILL.md")
          : undefined,
        "# Test Skill",
      ],
      [
        opts.commands
          ? projectPath(toolDir, "commands", "test-cmd.md")
          : undefined,
        "---\ndescription: Test\n---\n# Test",
      ],
      [
        opts.agents
          ? projectPath(toolDir, "agents", "test-agent.md")
          : undefined,
        "# Test Agent",
      ],
      [
        opts.mcpFile ? projectPath(opts.mcpFile) : undefined,
        JSON.stringify({ mcpServers: {} }, null, 2),
      ],
      [opts.docsFile ? projectPath(opts.docsFile) : undefined, "@AGENTS.md\n"],
    ];
    const files = new Map<string, string>();
    for (const [filePath, content] of fixtures) {
      if (filePath) files.set(filePath, content);
    }
    await writeFiles(files);
  }

  async function ownFiles(tool: ToolName, files: string[]): Promise<void> {
    await writeOwnedManifest(tmpDir, new Map([[tool, files]]), {
      preserveUnselected: false,
    });
  }

  const trackerMcp: Record<string, MCP> = {
    tracker: { command: "node", args: ["tracker.js"] },
  };

  async function syncAndOwnMcp(tools: readonly ToolName[]): Promise<void> {
    const providers = tools.map(getToolProvider);
    const synced = await syncManagedMCP(providers, trackerMcp, tmpDir);
    await writeOwnedManifest(tmpDir, new Map(), {
      preserveUnselected: false,
      replaceTools: [...tools],
      mcpOwners: synced.owners,
    });
  }

  describe("removes generated files from holdout tools", () => {
    it("preserves all unowned Claude content, MCP, and docs", async () => {
      await setupProject(["claude"]);
      await createGeneratedFiles(".claude", {
        skills: true,
        commands: true,
        agents: true,
        mcpFile: ".mcp.json",
        docsFile: "CLAUDE.md",
      });

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("claude");
      expectNoRemovals(results[0]);

      await expectPathsExist(
        projectPath(".claude", "skills"),
        projectPath(".claude", "commands"),
        projectPath(".claude", "agents"),
        projectPath(".mcp.json"),
        projectPath("CLAUDE.md"),
      );
    });

    it("removes manifest-owned Cursor skills but preserves unowned MCP", async () => {
      await setupProject(["cursor"], { mcp: true });
      await createGeneratedFiles(".cursor", {
        skills: true,
        mcpFile: ".cursor/mcp.json",
      });
      const generatedSkill = projectPath(
        ".cursor",
        "skills",
        "test",
        "SKILL.md",
      );
      await ownFiles("cursor", [generatedSkill]);

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("cursor");

      await expectPathsMissing(generatedSkill);
      await expectPathsExist(projectPath(".cursor", "mcp.json"));
    });

    it("handles multiple tools", async () => {
      await setupProject(["claude", "cursor"]);
      await createGeneratedFiles(".claude", {
        skills: true,
        commands: true,
        agents: true,
        mcpFile: ".mcp.json",
        docsFile: "CLAUDE.md",
      });
      await createGeneratedFiles(".cursor", {
        skills: true,
        mcpFile: ".cursor/mcp.json",
      });
      const cursorSkill = projectPath(".cursor", "skills", "test", "SKILL.md");
      await ownFiles("cursor", [cursorSkill]);

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(2);
      const claudeResult = results.find((r) => r.tool === "claude");
      const cursorResult = results.find((r) => r.tool === "cursor");
      expect(claudeResult).toBeDefined();
      expect(cursorResult).toBeDefined();

      // Only exact Cursor ownership is cleaned; unowned Claude state survives.
      await expectPathsExist(projectPath(".claude", "skills"));
      await expectPathsMissing(cursorSkill);
    });

    it("cleans exact Claude/OpenCode files while preserving manual siblings and CLAUDE.md", async () => {
      await setupProject(["claude", "opencode"]);
      await createGeneratedFiles(".claude", {
        skills: true,
        commands: true,
        agents: true,
      });
      await createGeneratedFiles(".opencode", {
        commands: true,
        agents: true,
      });
      const generated = new Map<string, string[]>([
        [
          "claude",
          [
            projectPath(".claude", "skills", "test", "SKILL.md"),
            projectPath(".claude", "commands", "test-cmd.md"),
            projectPath(".claude", "agents", "test-agent.md"),
          ],
        ],
        [
          "opencode",
          [
            projectPath(".opencode", "commands", "test-cmd.md"),
            projectPath(".opencode", "agents", "test-agent.md"),
          ],
        ],
      ]);
      const manual = [
        projectPath(".claude", "skills", "manual", "SKILL.md"),
        projectPath(".claude", "commands", "manual.md"),
        projectPath(".claude", "agents", "manual.md"),
        projectPath(".opencode", "commands", "manual.md"),
        projectPath(".opencode", "agents", "manual.md"),
      ];
      await writeTextToPaths("# Manual\n", ...manual);
      const claudeMd = projectPath("CLAUDE.md");
      await outputFile(claudeMd, "# Hand-authored Claude instructions\n");
      await writeOwnedManifest(tmpDir, generated, {
        preserveUnselected: false,
      });

      await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(...[...generated.values()].flat());
      await expectPathsExist(...manual);
      expect(await readText(claudeMd)).toBe(
        "# Hand-authored Claude instructions\n",
      );
    });

    it("preserves hand-authored Cursor siblings while cleaning manifest-owned content", async () => {
      await setupProject(["cursor"]);
      await createGeneratedFiles(".cursor", {
        skills: true,
        commands: true,
        agents: true,
      });
      const generated = [
        projectPath(".cursor", "skills", "test", "SKILL.md"),
        projectPath(".cursor", "commands", "test-cmd.md"),
        projectPath(".cursor", "agents", "test-agent.md"),
      ];
      const manual = [
        projectPath(".cursor", "skills", "manual", "SKILL.md"),
        projectPath(".cursor", "commands", "manual.md"),
        projectPath(".cursor", "agents", "manual.md"),
      ];
      await writeTextToPaths("# manual", ...manual);
      await ownFiles("cursor", generated);

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(...generated);
      await expectPathsExist(...manual);
      expect(result.removedFiles).toEqual(
        expect.arrayContaining(generated.slice(1)),
      );
      expect(result.removedDirs).toContain(path.dirname(generated[0]));
    });

    it("preserves unmanifested Cursor content", async () => {
      await setupProject(["cursor"]);
      await createGeneratedFiles(".cursor", {
        skills: true,
        commands: true,
        agents: true,
      });

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(
        projectPath(".cursor", "skills"),
        projectPath(".cursor", "commands"),
        projectPath(".cursor", "agents"),
      );
      expect(result.removedFiles).toEqual([]);
      expect(result.removedDirs).toEqual([]);
    });

    it("cleans only manifest-owned Codex preset skills", async () => {
      await setupProject(["codex"]);
      const generated = projectPath(
        ".codex",
        "skills",
        "org--review",
        "SKILL.md",
      );
      const manual = projectPath(".codex", "skills", "manual", "SKILL.md");
      await writeFiles(
        new Map([
          [generated, "# generated"],
          [manual, "# manual"],
        ]),
      );
      await ownFiles("codex", [generated]);

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(generated);
      await expectPathsExist(manual);
      expect(result.removedDirs).toContain(path.dirname(generated));
    });

    it("cleans only exact receipt-owned Codex roles and shared keys", async () => {
      await setupProject(["codex"]);
      const provider = getToolProvider("codex");
      const configPath = projectPath(".codex", "config.toml");
      const receiptPath = codexReceiptPath();
      const rolePath = (role: string, extension: "md" | "toml") =>
        projectPath(".codex", "agents", `${role}.${extension}`);
      const exactMarkdown = rolePath("auditor", "md");
      const exactToml = rolePath("auditor", "toml");
      const modifiedMarkdown = rolePath("reviewer", "md");
      const modifiedToml = rolePath("reviewer", "toml");
      const manualMarkdown = rolePath("manual", "md");
      const manualToml = rolePath("manual", "toml");

      await writeFiles(
        new Map([
          [
            configPath,
            [
              'model = "gpt-5"',
              "",
              "[tui]",
              'theme = "dark"',
              "",
              "[agents.manual]",
              'config_file = "agents/manual.toml"',
              'description = "Manual role"',
            ].join("\n"),
          ],
          [manualMarkdown, "# Manual role\n"],
          [manualToml, 'model_instructions_file = "agents/manual.md"\n'],
          [
            projectPath(".agents", "agents", "auditor.md"),
            "---\ndescription: Managed auditor\n---\n# Auditor",
          ],
          [
            projectPath(".agents", "agents", "reviewer.md"),
            "---\ndescription: Managed reviewer\n---\n# Reviewer",
          ],
        ]),
      );
      await syncAgents([provider], tmpDir);
      await syncExtensions(
        [provider],
        {
          permissions: { default: "ask" },
          statusline: { items: ["model"] },
          outputStyle: { tone: "pragmatic" },
        },
        tmpDir,
      );
      await ownFiles("codex", [exactMarkdown, modifiedMarkdown]);
      await outputFile(modifiedMarkdown, "# User-maintained reviewer\n");

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(exactMarkdown, exactToml, receiptPath);
      expect(await readText(modifiedMarkdown)).toBe(
        "# User-maintained reviewer\n",
      );
      await expectPathsExist(modifiedToml, manualMarkdown, manualToml);

      const config = await readToolSettings(configPath);
      const agents = CodexCleanAgentsSchema.parse(config.agents);
      expect(agents.auditor).toBeUndefined();
      expect(agents.reviewer).toBeDefined();
      expect(agents.manual).toBeDefined();
      expect(config.default_permissions).toBeUndefined();
      expect(config.personality).toBeUndefined();
      expect(config.tui).toEqual({ theme: "dark" });

      expect(result.removedFiles).toEqual(
        expect.arrayContaining([exactMarkdown, exactToml, receiptPath]),
      );
      expect(result.removedFiles).not.toContain(modifiedMarkdown);
      expect(result.modifiedFiles).toContain(configPath);
      expect(result.warnings).toEqual([
        expect.stringContaining("codex agent reviewer preserved"),
      ]);
      const manifest = await readManifest(tmpDir);
      expect(manifest?.owners?.codex).toBeUndefined();
    });

    it("warns for every modified Codex extension value preserved during clean", async () => {
      await setupProject(["codex"]);
      const provider = getToolProvider("codex");
      const configPath = projectPath(".codex", "config.toml");
      const receiptPath = codexReceiptPath();
      await syncExtensions(
        [provider],
        {
          permissions: { default: "ask" },
          statusline: { items: ["model"] },
          outputStyle: { tone: "pragmatic" },
        },
        tmpDir,
      );
      await outputFile(
        configPath,
        [
          'default_permissions = ":danger-full-access"',
          'personality = "friendly"',
          "",
          "[tui]",
          'status_line = ["git-branch"]',
          "",
        ].join("\n"),
      );

      const [result] = await cleanCommand({ cwd: tmpDir });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("codex default_permissions preserved"),
          expect.stringContaining("codex tui.status_line preserved"),
          expect.stringContaining("codex personality preserved"),
        ]),
      );
      expect(result.warnings).toHaveLength(3);
      expect(result.modifiedFiles).not.toContain(configPath);
      expect(await readToolSettings(configPath)).toEqual({
        default_permissions: ":danger-full-access",
        personality: "friendly",
        tui: { status_line: ["git-branch"] },
      });
      await expectPathsMissing(receiptPath);
    });

    it("previews receipt-owned Codex cleanup without changing state", async () => {
      await setupProject(["codex"]);
      const provider = getToolProvider("codex");
      const markdownPath = projectPath(".codex", "agents", "reviewer.md");
      const tomlPath = projectPath(".codex", "agents", "reviewer.toml");
      const configPath = projectPath(".codex", "config.toml");
      const receiptPath = codexReceiptPath();
      await outputFile(
        projectPath(".agents", "agents", "reviewer.md"),
        "---\ndescription: Managed reviewer\n---\n# Reviewer",
      );
      await syncAgents([provider], tmpDir);
      await ownFiles("codex", [markdownPath]);
      const tracked = [markdownPath, tomlPath, configPath, receiptPath];
      const before = await readTexts(tracked);

      const [result] = await cleanCommand({ cwd: tmpDir, dryRun: true });

      expect(result.removedFiles).toEqual(
        expect.arrayContaining([markdownPath, tomlPath, receiptPath]),
      );
      expect(result.modifiedFiles).toContain(configPath);
      await expect(readTexts(tracked)).resolves.toEqual(before);
    });

    it("preserves a modified owned file with a warning and relinquishes its receipt", async () => {
      await setupProject(["cursor"]);
      const generated = projectPath(".cursor", "commands", "review.md");
      await outputFile(generated, "# generated");
      await ownFiles("cursor", [generated]);
      await outputFile(generated, "# edited by user");

      const [result] = await cleanCommand({ cwd: tmpDir });

      expect(result.removedFiles).not.toContain(generated);
      expect(await readText(generated)).toBe("# edited by user");
      expect(result.modifiedFiles).not.toContain(generated);
      expect(result.warnings).toEqual([
        expect.stringContaining(".cursor/commands/review.md is modified"),
      ]);
      expect((await readManifest(tmpDir))?.owners?.cursor).toBeUndefined();
    });

    it("removes exact skill support files without deleting manual siblings", async () => {
      await setupProject(["cursor"]);
      const skillDir = projectPath(".cursor", "skills", "company--review");
      const generated = [
        path.join(skillDir, "SKILL.md"),
        path.join(skillDir, "references", "checklist.md"),
      ];
      const manual = path.join(skillDir, "notes.md");
      await writeTextToPaths("generated", ...generated);
      await outputFile(manual, "manual");
      await ownFiles("cursor", generated);

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(...generated);
      await expectPathsExist(manual, skillDir);
      expect(result.removedFiles).toEqual(expect.arrayContaining(generated));
    });

    it("does not delete a manual replacement on a second clean", async () => {
      await setupProject(["cursor"]);
      const generated = projectPath(".cursor", "commands", "review.md");
      await outputFile(generated, "# generated");
      await ownFiles("cursor", [generated]);
      await cleanCommand({ cwd: tmpDir });
      await outputFile(generated, "# manual replacement");

      await cleanCommand({ cwd: tmpDir });

      expect(await readText(generated)).toBe("# manual replacement");
      expect((await readManifest(tmpDir))?.files).not.toHaveProperty(
        ".cursor/commands/review.md",
      );
    });

    it("ignores malformed manifest paths inside shared roots", async () => {
      await setupProject(["cursor"]);
      const rootLevelSkill = projectPath(".cursor", "skills", "SKILL.md");
      await outputFile(rootLevelSkill, "# manual");
      const relativePath = ".cursor/skills/SKILL.md";
      await outputFile(
        getManifestPath(tmpDir),
        JSON.stringify({
          files: { [relativePath]: await hashFile(rootLevelSkill) },
          symlink_targets: {},
          owners: { cursor: [relativePath] },
          timestamp: new Date().toISOString(),
        }),
      );

      const [result] = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(rootLevelSkill);
      expect(result.removedFiles).toEqual([]);
      expect((await readManifest(tmpDir))?.owners?.cursor).toBeUndefined();
    });

    it("does not follow a symlinked shared root during clean", async () => {
      await withTemporaryDirectory(
        "agentsync-clean-external-",
        async (externalDir) => {
          await setupProject(["cursor"]);
          const externalFile = path.join(
            externalDir,
            "company--review",
            "SKILL.md",
          );
          await outputFile(externalFile, "# external");
          await ensureDir(projectPath(".cursor"));
          await symlink(externalDir, projectPath(".cursor", "skills"));
          const linkedPath = projectPath(
            ".cursor",
            "skills",
            "company--review",
            "SKILL.md",
          );
          await ownFiles("cursor", [linkedPath]);

          const [result] = await cleanCommand({ cwd: tmpDir });

          await expectPathsExist(externalFile);
          expect(result.removedFiles).toEqual([]);
        },
      );
    });
  });

  describe("does NOT remove .agents/ content", () => {
    it("preserves .agents/ source directory after clean", async () => {
      await setupProject(["claude"]);

      const sourceSkillDir = projectPath(".agents", "skills", "myskill");
      await outputFile(
        path.join(sourceSkillDir, "SKILL.md"),
        "# My Source Skill",
      );

      await createGeneratedFiles(".claude", {
        skills: true,
        docsFile: "CLAUDE.md",
      });

      await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(
        projectPath(".agents", "skills", "myskill", "SKILL.md"),
        projectPath(".agents", "agentsync.toml"),
        projectPath(".claude", "skills"),
      );
    });

    it("preserves canonical .agents/commands", async () => {
      await setupProject(["amp", "augment"]);

      const sourceCommand = projectPath(".agents", "commands", "bar.md");
      await outputFile(sourceCommand, "---\ndescription: Bar\n---\n# Bar");

      await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(sourceCommand, projectPath(".agents", "commands"));
    });

    it("never nominates canonical source for any supported tool", async () => {
      // Future-proofing: a new provider that points any path field at
      // `.agents/` (or at the root AGENTS.md) must not turn `clean` into a
      // source-destroying command.
      await setupProject([...SUPPORTED_TOOLS]);

      const sourceFiles = [
        projectPath(".agents", "skills", "myskill", "SKILL.md"),
        projectPath(".agents", "commands", "bar.md"),
        projectPath(".agents", "agents", "reviewer.md"),
        projectPath("AGENTS.md"),
      ];
      await writeTextToPaths("# canonical source", ...sourceFiles);

      const results = await cleanCommand({ cwd: tmpDir });

      const nominated = results.flatMap((r) => [
        ...r.removedFiles,
        ...r.removedDirs,
      ]);
      const offenders = nominated.filter(
        (p) =>
          p.split(path.sep).includes(".agents") ||
          path.basename(p) === "AGENTS.md",
      );
      expect(offenders).toEqual([]);

      await expectPathsExist(...sourceFiles);
    });
  });

  describe("managed MCP cleanup", () => {
    const releaseTools = ["claude", "cursor", "opencode", "codex"] as const;

    async function seedReleaseMcp(): Promise<void> {
      await setupProject(releaseTools, { mcp: true });
      await outputFile(projectPath("opencode.json"), '{"model":"keep"}\n');
      await outputFile(
        projectPath(".codex", "config.toml"),
        'model = "keep"\n',
      );
      await syncAndOwnMcp(releaseTools);
    }

    it("removes only exact receipt-owned cc/cx/oc/ca MCP state", async () => {
      await seedReleaseMcp();

      const results = await cleanCommand({ cwd: tmpDir });

      await expectPathsMissing(
        projectPath(".mcp.json"),
        projectPath(".cursor", "mcp.json"),
      );
      expect(await readJsonSettings(projectPath("opencode.json"))).toEqual({
        model: "keep",
      });
      expect(
        await readToolSettings(projectPath(".codex", "config.toml")),
      ).toEqual({ model: "keep" });
      expect(results.flatMap((result) => result.warnings)).toEqual([]);
      expect((await readManifest(tmpDir))?.mcp_owners).toBeUndefined();
    });

    it("preserves modified cc/cx/oc/ca MCP state and relinquishes receipts", async () => {
      await seedReleaseMcp();
      const modified = new Map([
        [projectPath(".mcp.json"), '{"mcpServers":{"manual":{}}}\n'],
        [projectPath(".cursor", "mcp.json"), '{"mcpServers":{"manual":{}}}\n'],
        [
          projectPath("opencode.json"),
          '{"model":"keep","mcp":{"manual":{}}}\n',
        ],
        [
          projectPath(".codex", "config.toml"),
          'model = "keep"\n\n[mcp_servers.manual]\ncommand = "manual"\n',
        ],
      ]);
      await writeFiles(modified);

      const results = await cleanCommand({ cwd: tmpDir });

      for (const [filePath, content] of modified) {
        expect(await readText(filePath)).toBe(content);
      }
      for (const result of results) {
        expect(result.warnings).toHaveLength(1);
      }
      expect(results.flatMap((result) => result.modifiedFiles)).toEqual([]);
      expect((await readManifest(tmpDir))?.mcp_owners).toBeUndefined();
    });

    it("previews exact MCP cleanup without changing files or receipts", async () => {
      await seedReleaseMcp();
      const tracked = [
        projectPath(".mcp.json"),
        projectPath(".cursor", "mcp.json"),
        projectPath("opencode.json"),
        projectPath(".codex", "config.toml"),
        getManifestPath(tmpDir),
      ];
      const before = await readTexts(tracked);

      const results = await cleanCommand({ cwd: tmpDir, dryRun: true });

      expect(results.flatMap((result) => result.warnings)).toEqual([]);
      expect(results.flatMap((result) => result.removedFiles)).toEqual(
        expect.arrayContaining([
          projectPath(".mcp.json"),
          projectPath(".cursor", "mcp.json"),
        ]),
      );
      expect(await readTexts(tracked)).toEqual(before);
    });

    it("cleans exact unchanged opt-in Codex home MCP and keeps siblings", async () => {
      await withCodexHomeMcp("home", async (homeConfig) => {
        await setupProject(["codex"], { mcp: true });
        await outputFile(
          homeConfig,
          'model = "keep"\n\n[mcp_servers.manual]\ncommand = "manual"\n',
        );
        await syncAndOwnMcp(["codex"]);

        const [result] = await cleanCommand({ cwd: tmpDir });

        expect(await readToolSettings(homeConfig)).toEqual({
          model: "keep",
          mcp_servers: { manual: { command: "manual" } },
        });
        expect(result.modifiedFiles).toContain(homeConfig);
        expect(result.warnings).toEqual([]);
        await expectPathsMissing(codexReceiptPath());
      });
    });

    it("does not read or clean Codex home MCP after opt-in is removed", async () => {
      await withCodexHomeMcp("home-no-opt-in", async (homeConfig) => {
        await setupProject(["codex"], { mcp: true });
        await syncAndOwnMcp(["codex"]);
        const malformed = "[mcp_servers.tracker\n";
        await outputFile(homeConfig, malformed);
        delete process.env.AGENTSYNC_CODEX_HOME_MCP;

        const [result] = await cleanCommand({ cwd: tmpDir });

        expect(await readText(homeConfig)).toBe(malformed);
        await expectPathsExist(codexReceiptPath());
        expect(result.warnings).toEqual([]);
      });
    });
  });

  describe("requires exact prior MCP ownership", () => {
    it("preserves a shared JSON key without a receipt", async () => {
      await setupProject(["amp"], { mcp: true });
      const settings = projectPath(".amp", "settings.json");
      await outputFile(
        settings,
        JSON.stringify({
          "amp.mcpServers": { tracker: { command: "npx", args: [] } },
          "amp.theme": "dark",
          "amp.notifications.enabled": true,
        }),
      );

      const results = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(settings);
      const after = await readJsonSettings(settings);
      // Amp's key really is the dotted top-level string, not a nested path.
      expect(after["amp.mcpServers"]).toEqual({
        tracker: { command: "npx", args: [] },
      });
      expect(after["amp.theme"]).toBe("dark");
      expect(after["amp.notifications.enabled"]).toBe(true);

      expect(results[0].modifiedFiles).toEqual([]);
      expect(results[0].removedFiles).toEqual([]);
    });

    it("preserves TOML and YAML MCP keys without receipts", async () => {
      await setupProject(["codex", "goose"], { mcp: true });

      const codexConfig = projectPath(".codex", "config.toml");
      await outputFile(
        codexConfig,
        'model = "gpt-5"\nsandbox_mode = "workspace-write"\ndefault_permissions = "read-only"\n\n[tui]\nstatus_line = ["model"]\n\n[agents.reviewer]\nconfig_file = ".codex/agents/reviewer.toml"\n\n[mcp_servers.tracker]\ncommand = "npx"\nargs = []\n',
      );
      // Even an over-broad flat ownership record must not promote a shared
      // config into exact-file deletion. Its writer still owns MCP keys only.
      await ownFiles("codex", [codexConfig]);
      const gooseConfig = projectPath(".goose", "config.yaml");
      await outputFile(
        gooseConfig,
        "GOOSE_PROVIDER: anthropic\nextensions:\n  tracker:\n    type: stdio\n    cmd: npx\n",
      );

      await cleanCommand({ cwd: tmpDir });

      const codexAfter = parseToml(await readText(codexConfig));
      expect(codexAfter).toEqual({
        model: "gpt-5",
        sandbox_mode: "workspace-write",
        default_permissions: "read-only",
        tui: { status_line: ["model"] },
        agents: {
          reviewer: { config_file: ".codex/agents/reviewer.toml" },
        },
        mcp_servers: {
          tracker: { command: "npx", args: [] },
        },
      });

      const gooseAfter = yaml.load(await readText(gooseConfig));
      expect(gooseAfter).toEqual({
        GOOSE_PROVIDER: "anthropic",
        extensions: { tracker: { type: "stdio", cmd: "npx" } },
      });
    });

    it("preserves a whole-file target without a receipt", async () => {
      await setupProject(["gemini"], { mcp: true });
      const settings = projectPath(".gemini", "settings.json");
      await outputFile(settings, JSON.stringify({ mcpServers: {} }));

      const results = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(settings);
      expect(results[0].removedFiles).toEqual([]);
      expect(results[0].modifiedFiles).toEqual([]);
    });

    it("leaves an unparseable config untouched rather than guessing", async () => {
      await setupProject(["crush"], { mcp: true });
      const config = projectPath("crush.json");
      await outputFile(config, "{ this is not json");

      const results = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(config);
      expect(await readText(config)).toBe("{ this is not json");
      expect(results[0].removedFiles).toEqual([]);
      expect(results[0].modifiedFiles).toEqual([]);
    });

    it("preserves whole-file state whose authorship is unknown", async () => {
      await setupProject(["cursor"], { mcp: true });
      const config = projectPath(".cursor", "mcp.json");
      await outputFile(config, JSON.stringify({ mcpServers: {}, other: 1 }));

      await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(config);
    });

    it("leaves shared configs alone when the project syncs no MCP", async () => {
      // A project that syncs skills but not MCP never had its `mcp` key
      // written by AgentSync — stripping one would delete the user's own.
      await setupProject(["opencode"]);
      const config = projectPath("opencode.json");
      await outputFile(
        config,
        JSON.stringify({ mcp: { mine: {} }, model: "claude" }),
      );

      const results = await cleanCommand({ cwd: tmpDir });

      const after = await readJsonSettings(config);
      expect(after.mcp).toEqual({ mine: {} });
      expect(after.model).toBe("claude");
      expect(results[0].modifiedFiles).toEqual([]);
    });

    it("does not preview key removal without a receipt", async () => {
      await setupProject(["amp"], { mcp: true });
      const settings = projectPath(".amp", "settings.json");
      const original = JSON.stringify({
        "amp.mcpServers": { tracker: {} },
        "amp.theme": "dark",
      });
      await outputFile(settings, original);

      const results = await cleanCommand({ cwd: tmpDir, dryRun: true });

      expect(results[0].modifiedFiles).toEqual([]);
      expect(await readText(settings)).toBe(original);
    });

    it.runIf(process.platform !== "win32")(
      "does not inspect an unowned shared-config leaf symlink",
      async () => {
        await withTemporaryDirectory(
          "agentsync-clean-config-external-",
          async (externalDir) => {
            const externalConfig = path.join(externalDir, "opencode.json");
            const original = JSON.stringify({
              mcp: { tracker: {} },
              model: "x",
            });
            await setupProject(["opencode"], { mcp: true });
            await outputFile(externalConfig, original);
            await symlink(externalConfig, projectPath("opencode.json"));

            const [result] = await cleanCommand({ cwd: tmpDir });
            expect(result.warnings).toEqual([]);
            expect(await readText(externalConfig)).toBe(original);
          },
        );
      },
    );

    it.runIf(process.platform !== "win32")(
      "refuses a shared-config ancestor symlink that escapes the project",
      async () => {
        await withTemporaryDirectory(
          "agentsync-clean-config-root-",
          async (externalDir) => {
            const externalConfig = path.join(externalDir, "config.toml");
            const original =
              'model = "gpt-5"\n\n[mcp_servers.tracker]\ncommand = "npx"\n';
            await setupProject(["codex"], { mcp: true });
            await outputFile(externalConfig, original);
            await symlink(externalDir, projectPath(".codex"), "dir");

            await expect(cleanCommand({ cwd: tmpDir })).rejects.toBeInstanceOf(
              ConfigError,
            );
            expect(await readText(externalConfig)).toBe(original);
          },
        );
      },
    );
  });

  describe("does NOT remove native tool files", () => {
    it("preserves AGENTS.md when tool reads it natively", async () => {
      await setupProject(["cursor"], { mcp: true });
      await outputFile(
        projectPath("AGENTS.md"),
        "# AGENTS.md\nProject instructions.",
      );
      await createGeneratedFiles(".cursor", {
        skills: true,
      });

      await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(projectPath("AGENTS.md"));
    });
  });

  describe("dry-run mode", () => {
    it("does not delete anything in dry-run mode", async () => {
      await setupProject(["claude"]);
      await createGeneratedFiles(".claude", {
        skills: true,
        commands: true,
        mcpFile: ".mcp.json",
        docsFile: "CLAUDE.md",
      });

      const results = await cleanCommand({ cwd: tmpDir, dryRun: true });

      expect(results).toHaveLength(1);
      expectNoRemovals(results[0]);

      await expectPathsExist(
        projectPath(".claude", "skills"),
        projectPath(".claude", "commands"),
        projectPath(".mcp.json"),
        projectPath("CLAUDE.md"),
      );
    });

    it("returns accurate counts in dry-run", async () => {
      await setupProject(["claude"]);
      await createGeneratedFiles(".claude", {
        skills: true,
        mcpFile: ".mcp.json",
        docsFile: "CLAUDE.md",
      });

      const results = await cleanCommand({ cwd: tmpDir, dryRun: true });

      const claudeResult = results[0];
      // Every unowned path survives and is omitted from the cleanup preview.
      expect(claudeResult.removedFiles).not.toContain(projectPath(".mcp.json"));
      expect(claudeResult.removedFiles).not.toContain(projectPath("CLAUDE.md"));
      expect(claudeResult.removedDirs).not.toContain(
        projectPath(".claude", "skills"),
      );
    });
  });

  describe("handles missing directories gracefully", () => {
    it("returns empty results when no generated files exist", async () => {
      await setupProject(["claude"]);
      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("claude");
      expectNoRemovals(results[0]);
    });

    it("returns empty results when no tools are configured", async () => {
      await setupProject([]);

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toEqual([]);
    });

    it("cleans exact manifest-owned command and MCP state after the last tool is removed", async () => {
      await setupProject(["cursor"]);
      const commandPath = projectPath(".cursor", "commands", "review.md");
      await outputFile(commandPath, "# Generated review\n");
      const managedMcp = await syncManagedMCP(
        [getToolProvider("cursor")],
        trackerMcp,
        tmpDir,
      );
      await writeOwnedManifest(tmpDir, new Map([["cursor", [commandPath]]]), {
        preserveUnselected: false,
        replaceTools: ["cursor"],
        mcpOwners: managedMcp.owners,
      });
      await setupProject([]);

      const [result] = await cleanCommand({ cwd: tmpDir });

      expect(result.tool).toBe("cursor");
      await expectPathsMissing(commandPath, projectPath(".cursor", "mcp.json"));
      expect((await readManifest(tmpDir))?.owners).toEqual({});
      expect((await readManifest(tmpDir))?.mcp_owners).toBeUndefined();
    });

    it("preserves lone MCP content without a receipt", async () => {
      await setupProject(["claude"]);
      await outputFile(
        projectPath(".mcp.json"),
        JSON.stringify({ mcpServers: {} }),
      );

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expectNoRemovals(results[0]);
      await expectPathsExist(projectPath(".mcp.json"));
    });

    it("throws when no config file exists", async () => {
      await expect(cleanCommand({ cwd: tmpDir })).rejects.toThrow(
        "Project config not found",
      );
    });

    it("preserves strict config recovery when the config is invalid", async () => {
      const configPath = projectPath(".agents", "agentsync.toml");
      await outputFile(configPath, 'tools = ["claude"]\nunexpected = true\n');

      await expect(cleanCommand({ cwd: tmpDir })).rejects.toThrow(
        "Unrecognized key",
      );
    });
  });

  describe("native-reading tools", () => {
    it("does not remove skills dir for tools that read .agents/ directly", async () => {
      await setupProject(["roocode"]);
      // roocode.capabilities.nativeSkillsDiscovery is true, so its skillsDir (.roo/skills) is NOT
      // treated as generated output (the tool reads .agents/ natively for skills)
      const rooSkills = projectPath(".roo", "skills");
      await outputFile(path.join(rooSkills, "test", "SKILL.md"), "# Test");

      const results = await cleanCommand({ cwd: tmpDir });

      await expectPathsExist(rooSkills);
      const rooResult = results.find((r) => r.tool === "roocode");
      expect(rooResult).toBeDefined();
      // Roocode has commands dir (.roo/commands) but no skills removal
      const removedDirNames = (rooResult?.removedDirs ?? []).map((d) =>
        path.basename(d),
      );
      expect(removedDirNames).not.toContain("skills");
    });
  });
});
