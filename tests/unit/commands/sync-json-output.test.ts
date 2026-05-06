/**
 * Sync Command JSON Output and CI Mode Tests
 * Verifies --json flag produces valid JSON and --ci mode behavior
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Sync JSON Output & CI Mode", () => {
  let tmpDir: string;
  let consoleOutput: string[];
  const originalLog = console.log;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-json-"));
    consoleOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    console.log = originalLog;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupProject(tools: string[]): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `tools = [${tools.map((t) => `"${t}"`).join(", ")}]\n`,
    );
  }

  describe("--json flag", () => {
    it("outputs valid JSON with status=success on successful sync", async () => {
      await setupProject(["claude"]);

      await sync({ cwd: tmpDir, json: true });

      // Find the JSON output line (CliResult envelope)
      const jsonLine = consoleOutput.find((line) => {
        try {
          const p = JSON.parse(line);
          return p.version === "1.0";
        } catch {
          return false;
        }
      });

      expect(jsonLine).toBeDefined();
      const output = JSON.parse(jsonLine!);
      expect(output.status).toBe("success");
      expect(output.command).toBe("sync");
      expect(output.data.tools).toEqual(["claude"]);
    });

    it("includes skills/commands/agents/mcpServers counts in data", async () => {
      await setupProject(["claude"]);

      // Add a skill
      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, json: true });

      const jsonLine = consoleOutput.find((line) => {
        try {
          const p = JSON.parse(line);
          return p.version === "1.0";
        } catch {
          return false;
        }
      });

      expect(jsonLine).toBeDefined();
      const output = JSON.parse(jsonLine!);
      expect(output.data).toHaveProperty("skills");
      expect(output.data).toHaveProperty("commands");
      expect(output.data).toHaveProperty("agents");
      expect(output.data).toHaveProperty("mcpServers");
    });
  });

  describe("--dry-run flag", () => {
    it("does not write any files in dry-run mode", async () => {
      await setupProject(["claude"]);

      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, dryRun: true });

      // .claude/skills/ should NOT exist
      const { pathExists } = await import("../../../src/utils/fs.js");
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        false,
      );
    });

    it("produces JSON output in dry-run + json mode", async () => {
      await setupProject(["claude"]);

      await sync({ cwd: tmpDir, dryRun: true, json: true });

      const jsonLine = consoleOutput.find((line) => {
        try {
          const p = JSON.parse(line);
          return p.version === "1.0";
        } catch {
          return false;
        }
      });

      expect(jsonLine).toBeDefined();
      const output = JSON.parse(jsonLine!);
      expect(output.status).toBe("success");
    });
  });

  describe("--tool filter", () => {
    it("syncs only to specified tool", async () => {
      await setupProject(["claude", "roocode"]);

      const skillDir = path.join(tmpDir, ".agents", "skills", "test");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

      await sync({ cwd: tmpDir, tool: "claude" });

      const { pathExists } = await import("../../../src/utils/fs.js");
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

      const jsonLine = consoleOutput.find((line) => {
        try {
          const p = JSON.parse(line);
          return p.status === "error";
        } catch {
          return false;
        }
      });

      expect(jsonLine).toBeDefined();
      const output = JSON.parse(jsonLine!);
      expect(output.status).toBe("error");
      expect(output.command).toBe("sync");
      expect(output.errors).toBeDefined();
      expect(output.errors.length).toBeGreaterThan(0);
    });
  });
});
