/**
 * Clean Command Tests
 * Verifies that agentsync clean removes generated files from holdout tools
 * without touching .agents/ source content or native tool files.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanCommand } from "../../../src/commands/clean.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Clean Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-clean-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: set up a minimal project config with given tools
   */
  async function setupProject(tools: string[]): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `tools = [${tools.map((t) => `"${t}"`).join(", ")}]\n`,
    );
  }

  /**
   * Helper: create generated files for a tool to simulate a previous sync
   */
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
    if (opts.skills) {
      const skillsDir = path.join(tmpDir, toolDir, "skills");
      await ensureDir(skillsDir);
      await outputFile(
        path.join(skillsDir, "test", "SKILL.md"),
        "# Test Skill",
      );
    }
    if (opts.commands) {
      const cmdsDir = path.join(tmpDir, toolDir, "commands");
      await ensureDir(cmdsDir);
      await outputFile(
        path.join(cmdsDir, "test-cmd.md"),
        "---\ndescription: Test\n---\n# Test",
      );
    }
    if (opts.agents) {
      const agentsDir = path.join(tmpDir, toolDir, "agents");
      await ensureDir(agentsDir);
      await outputFile(path.join(agentsDir, "test-agent.md"), "# Test Agent");
    }
    if (opts.mcpFile) {
      await outputFile(
        path.join(tmpDir, opts.mcpFile),
        JSON.stringify({ mcpServers: {} }, null, 2),
      );
    }
    if (opts.docsFile) {
      await outputFile(path.join(tmpDir, opts.docsFile), "@AGENTS.md\n");
    }
  }

  describe("removes generated files from holdout tools", () => {
    it("removes Claude generated files (skills, commands, agents, MCP, docs)", async () => {
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
      expect(results[0].removedFiles.length).toBeGreaterThanOrEqual(1);
      expect(results[0].removedDirs.length).toBeGreaterThanOrEqual(1);

      // Verify files are actually gone
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".claude", "commands"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".claude", "agents"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(false);
      expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    });

    it("removes Cursor generated files (skills, MCP)", async () => {
      await setupProject(["cursor"]);
      await createGeneratedFiles(".cursor", {
        skills: true,
        mcpFile: ".cursor/mcp.json",
      });

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("cursor");

      expect(await pathExists(path.join(tmpDir, ".cursor", "skills"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".cursor", "mcp.json"))).toBe(
        false,
      );
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

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(2);
      const claudeResult = results.find((r) => r.tool === "claude");
      const cursorResult = results.find((r) => r.tool === "cursor");
      expect(claudeResult).toBeDefined();
      expect(cursorResult).toBeDefined();

      // Both tools cleaned
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".cursor", "skills"))).toBe(
        false,
      );
    });
  });

  describe("does NOT remove .agents/ content", () => {
    it("preserves .agents/ source directory after clean", async () => {
      await setupProject(["claude"]);

      // Add source skills in .agents/
      const sourceSkillDir = path.join(tmpDir, ".agents", "skills", "myskill");
      await ensureDir(sourceSkillDir);
      await outputFile(
        path.join(sourceSkillDir, "SKILL.md"),
        "# My Source Skill",
      );

      // Create generated files
      await createGeneratedFiles(".claude", {
        skills: true,
        docsFile: "CLAUDE.md",
      });

      await cleanCommand({ cwd: tmpDir });

      // .agents/ should be untouched
      expect(
        await pathExists(
          path.join(tmpDir, ".agents", "skills", "myskill", "SKILL.md"),
        ),
      ).toBe(true);
      expect(
        await pathExists(path.join(tmpDir, ".agents", "agentsync.toml")),
      ).toBe(true);

      // Generated files should be gone
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        false,
      );
    });
  });

  describe("does NOT remove native tool files", () => {
    it("preserves AGENTS.md when tool reads it natively", async () => {
      await setupProject(["cursor"]);
      await outputFile(
        path.join(tmpDir, "AGENTS.md"),
        "# AGENTS.md\nProject instructions.",
      );
      await createGeneratedFiles(".cursor", {
        skills: true,
      });

      await cleanCommand({ cwd: tmpDir });

      // AGENTS.md should remain since cursor reads it natively
      expect(await pathExists(path.join(tmpDir, "AGENTS.md"))).toBe(true);
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

      // Should report what would be removed
      expect(results).toHaveLength(1);
      expect(results[0].removedFiles.length).toBeGreaterThanOrEqual(1);
      expect(results[0].removedDirs.length).toBeGreaterThanOrEqual(1);

      // But files should still exist
      expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
        true,
      );
      expect(await pathExists(path.join(tmpDir, ".claude", "commands"))).toBe(
        true,
      );
      expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(true);
      expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
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
      // .mcp.json and CLAUDE.md are files; .claude/skills is a dir
      expect(claudeResult.removedFiles).toContain(
        path.join(tmpDir, ".mcp.json"),
      );
      expect(claudeResult.removedFiles).toContain(
        path.join(tmpDir, "CLAUDE.md"),
      );
      expect(claudeResult.removedDirs).toContain(
        path.join(tmpDir, ".claude", "skills"),
      );
    });
  });

  describe("handles missing directories gracefully", () => {
    it("returns empty results when no generated files exist", async () => {
      await setupProject(["claude"]);
      // No generated files created

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("claude");
      expect(results[0].removedFiles).toEqual([]);
      expect(results[0].removedDirs).toEqual([]);
    });

    it("returns empty results when no tools are configured", async () => {
      await setupProject([]);

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toEqual([]);
    });

    it("handles partial generated content (only some dirs exist)", async () => {
      await setupProject(["claude"]);
      // Only create MCP file, no skills/commands/agents dirs
      await outputFile(
        path.join(tmpDir, ".mcp.json"),
        JSON.stringify({ mcpServers: {} }),
      );

      const results = await cleanCommand({ cwd: tmpDir });

      expect(results).toHaveLength(1);
      expect(results[0].removedFiles).toContain(path.join(tmpDir, ".mcp.json"));
      expect(results[0].removedDirs).toEqual([]);
    });

    it("throws when no config file exists", async () => {
      // No config setup at all
      await expect(cleanCommand({ cwd: tmpDir })).rejects.toThrow(
        "Cannot clean",
      );
    });
  });

  describe("native-reading tools", () => {
    it("does not remove skills dir for tools that read .agents/ directly", async () => {
      await setupProject(["roocode"]);
      // roocode.readsAgentsDir === true, so its skillsDir (.roo/skills) is NOT
      // treated as generated output (the tool reads .agents/ natively for skills)
      const rooSkills = path.join(tmpDir, ".roo", "skills");
      await ensureDir(rooSkills);
      await outputFile(path.join(rooSkills, "test", "SKILL.md"), "# Test");

      const results = await cleanCommand({ cwd: tmpDir });

      // .roo/skills should NOT be removed — roocode reads .agents/ natively
      expect(await pathExists(rooSkills)).toBe(true);
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
