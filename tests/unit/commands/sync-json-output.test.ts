/**
 * Sync Command JSON Output and CI Mode Tests
 * Verifies --json flag produces valid JSON and --ci mode behavior
 */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sync } from "../../../src/commands/sync.js";
import { ConfigError } from "../../../src/core/errors.js";
import { CliResultSchema, SyncDataSchema } from "../../../src/types/output.js";
import {
  ensureDir,
  outputFile,
  parseJsonValidated,
  pathExists,
} from "../../../src/utils/fs.js";

describe("Sync JSON Output & CI Mode", () => {
  let tmpDir: string;
  let consoleOutput: string[];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-json-"));
    consoleOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    process.exitCode = undefined;
  });

  afterEach(async () => {
    console.log = originalLog;
    process.exitCode = originalExitCode;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupProject(tools: string[]): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `tools = [${tools.map((t) => `"${t}"`).join(", ")}]\n`,
    );
  }

  function findSyncOutput() {
    for (const line of consoleOutput) {
      let parsed: unknown;
      try {
        parsed = parseJsonValidated(line, z.unknown());
      } catch {
        continue;
      }
      const result = CliResultSchema.safeParse(parsed);
      if (result.success && result.data.command === "sync") return result.data;
    }
    throw new Error("No valid sync JSON envelope was emitted");
  }

  describe("--json flag", () => {
    it("outputs valid JSON with status=success on successful sync", async () => {
      await setupProject(["claude"]);

      await sync({ cwd: tmpDir, json: true });

      const output = findSyncOutput();
      const data = SyncDataSchema.parse(output.data);
      expect(output.status).toBe("success");
      expect(output.command).toBe("sync");
      expect(data.tools).toEqual(["claude"]);
    });

    it("includes every projected-surface count in data", async () => {
      await setupProject(["claude"]);

      // Add a skill
      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, json: true });

      const data = SyncDataSchema.parse(findSyncOutput().data);
      expect(data).toHaveProperty("skills");
      expect(data).toHaveProperty("commands");
      expect(data).toHaveProperty("agents");
      expect(data).toHaveProperty("rules");
      expect(data).toHaveProperty("mcpServers");
    });
  });

  it("refuses to update a managed gitignore through an escaping symlink", async () => {
    const externalDir = await mkdtemp(
      path.join(tmpdir(), "agentsync-gitignore-external-"),
    );
    const externalGitignore = path.join(externalDir, "gitignore");
    const content = "# AgentSync managed start\nold\n# AgentSync managed end\n";
    try {
      await setupProject(["claude"]);
      await outputFile(externalGitignore, content);
      await symlink(externalGitignore, path.join(tmpDir, ".gitignore"));

      await expect(sync({ cwd: tmpDir })).rejects.toThrow(
        /outside the project/,
      );

      expect(await readFile(externalGitignore, "utf-8")).toBe(content);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "refuses a dangling gitignore symlink that targets outside the project",
    async () => {
      const externalDir = await mkdtemp(
        path.join(tmpdir(), "agentsync-gitignore-dangling-"),
      );
      const externalGitignore = path.join(externalDir, "missing-gitignore");
      try {
        await setupProject(["claude"]);
        await symlink(externalGitignore, path.join(tmpDir, ".gitignore"));

        await expect(sync({ cwd: tmpDir })).rejects.toBeInstanceOf(ConfigError);
        expect(await pathExists(externalGitignore)).toBe(false);
      } finally {
        await rm(externalDir, { recursive: true, force: true });
      }
    },
  );

  describe("--dry-run flag", () => {
    it("does not write any files in dry-run mode", async () => {
      await setupProject(["claude"]);

      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, dryRun: true });

      // .claude/skills/ should NOT exist
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        false,
      );
    });

    it("produces JSON output in dry-run + json mode", async () => {
      await setupProject(["claude"]);

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const output = findSyncOutput();
      expect(output.status).toBe("success");
    });

    it("projects each dry-run surface according to provider capabilities", async () => {
      await setupProject(["claude", "opencode", "codex", "cursor"]);

      await outputFile(
        path.join(tmpDir, ".agents", "skills", "review", "SKILL.md"),
        "# Review",
      );
      await outputFile(
        path.join(tmpDir, ".agents", "commands", "commit.md"),
        "# Commit",
      );
      await outputFile(
        path.join(tmpDir, ".agents", "agents", "reviewer.md"),
        "---\nname: reviewer\ndescription: Reviews changes\n---\n# Reviewer",
      );

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const output = findSyncOutput();
      const data = SyncDataSchema.parse(output.data);
      const details = new Map(
        data.details.map((detail) => [detail.tool, detail]),
      );

      expect(details.get("claude")?.skills).toEqual(["review"]);
      expect(details.get("claude")?.commands).toEqual(["commit.md"]);
      expect(details.get("claude")?.agents).toEqual(["reviewer.md"]);

      expect(details.get("opencode")?.skills).toEqual([]);
      expect(details.get("opencode")?.commands).toEqual(["commit.md"]);
      expect(details.get("opencode")?.agents).toEqual(["reviewer.md"]);

      expect(details.get("codex")?.skills).toEqual([]);
      expect(details.get("codex")?.commands).toEqual([]);
      expect(details.get("codex")?.agents).toEqual(["reviewer.md"]);

      expect(details.get("cursor")?.skills).toEqual([]);
      expect(details.get("cursor")?.commands).toEqual(["commit.md"]);
      expect(details.get("cursor")?.agents).toEqual(["reviewer.md"]);

      expect(data.skills).toBe(1);
      expect(data.commands).toBe(3);
      expect(data.agents).toBe(4);
      expect(output.warnings).toContain(
        "codex does not support commands; 1 command skipped",
      );
    });

    it("does not warn for unsupported surfaces when no canonical content exists", async () => {
      await setupProject(["codex"]);

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const output = findSyncOutput();
      expect(output.warnings).toBeUndefined();
    });

    it("uses the real agent transforms, file names, and skill validation in previews", async () => {
      await setupProject(["claude", "opencode", "copilot"]);
      await outputFile(
        path.join(tmpDir, ".agents", "agents", "researcher.md"),
        [
          "---",
          "description: Research",
          "tools: Read, Write",
          "model: sonnet",
          "---",
          "# Researcher",
        ].join("\n"),
      );
      await outputFile(
        path.join(tmpDir, ".agents", "skills", "wrong-layout.md"),
        "# Not a skill directory",
      );

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const output = findSyncOutput();
      const data = SyncDataSchema.parse(output.data);
      const details = new Map(
        data.details.map((detail) => [detail.tool, detail]),
      );
      expect(details.get("copilot")?.agents).toEqual(["researcher.agent.md"]);
      expect(details.get("opencode")?.agents).toEqual(["researcher.md"]);
      expect(output.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("dropped 'tools' allowlist"),
          expect.stringContaining("dropped unqualified model"),
          expect.stringContaining("wrong-layout.md"),
        ]),
      );
      expect(await pathExists(path.join(tmpDir, ".github", "agents"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".opencode", "agents"))).toBe(
        false,
      );
    });

    it("does not count an invalid Cursor agent during dry-run", async () => {
      await setupProject(["cursor"]);
      await outputFile(
        path.join(tmpDir, ".agents", "agents", "invalid.md"),
        "# Missing frontmatter",
      );

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const output = findSyncOutput();
      const data = SyncDataSchema.parse(output.data);
      expect(data.agents).toBe(0);
      expect(data.details).toEqual([
        expect.objectContaining({ tool: "cursor", agents: [] }),
      ]);
      expect(output.warnings).toEqual([
        expect.stringContaining("[cursor] agent 'invalid' skipped"),
      ]);
      expect(await pathExists(path.join(tmpDir, ".cursor", "agents"))).toBe(
        false,
      );
    });
  });

  it.each([
    ["sync", {}],
    ["dry run", { dryRun: true }],
  ])(
    "sets a partial exit code for human %s preset failures",
    async (_, mode) => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\nextends = ["fs:./missing-preset"]\n',
      );

      await sync({ cwd: tmpDir, ...mode });

      expect(process.exitCode).toBe(1);
    },
  );

  describe("--tool filter", () => {
    it("syncs only to specified tool", async () => {
      await setupProject(["claude", "roocode"]);

      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, tool: "claude" });

      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "skills", "test", "SKILL.md"),
        ),
      ).toBe(true);
      // .roo should NOT have skills (we only synced to claude)
      expect(
        await pathExists(
          path.join(tmpDir, ".roo", "skills", "test", "SKILL.md"),
        ),
      ).toBe(false);
    });

    it("rejects invalid tool names", async () => {
      await setupProject(["claude"]);

      await expect(sync({ cwd: tmpDir, tool: "invalid" })).rejects.toThrow(
        "Unknown tool",
      );
    });
  });

  describe("Error handling", () => {
    it("throws when config is missing", async () => {
      await expect(sync({ cwd: tmpDir })).rejects.toThrow();
    });

    it("outputs JSON error when config is missing with --json", async () => {
      await sync({ cwd: tmpDir, json: true });

      const output = findSyncOutput();
      expect(output.status).toBe("error");
      expect(output.command).toBe("sync");
      expect(output.errors).toBeDefined();
      expect(output.errors?.length).toBeGreaterThan(0);
    });

    it("preserves typed config recovery details in JSON errors", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(
        configPath,
        'tools = ["claude"]\nunsupported_field = true\n',
      );

      await sync({ cwd: tmpDir, json: true });

      expect(findSyncOutput().errors).toEqual([
        expect.objectContaining({
          code: "CONFIG_ERROR",
          message: expect.stringContaining('"unsupported_field"'),
          suggestion: expect.stringContaining("Use current top-level"),
          context: { configPath },
        }),
      ]);
    });
  });
});
