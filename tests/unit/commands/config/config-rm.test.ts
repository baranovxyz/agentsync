/**
 * Config Remove Command Tests
 * Verifies that agentsync config rm correctly removes tools, MCP servers,
 * presets, skills, and commands from the configuration.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configRm } from "../../../../src/commands/config/rm.js";
import { ensureDir, outputFile, pathExists } from "../../../../src/utils/fs.js";

describe("Config Remove Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-rm-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("invalid type", () => {
    it("throws on invalid type", async () => {
      await expect(configRm("invalid", "foo", { cwd: tmpDir })).rejects.toThrow(
        "Unknown config type",
      );
    });
  });

  describe("rm tool", () => {
    it("removes tool from config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude", "cursor"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"claude"');
      expect(content).not.toContain('"cursor"');
    });

    it("returns not_found when tool not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });

    it("returns not_found when no config exists", async () => {
      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });

    it("handles removing the only tool", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["cursor"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("tools = []");
    });
  });

  describe("rm mcp", () => {
    it("removes MCP section from config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n\n[mcp.github]\ncommand = "npx"\nargs = ["-y", "@org/server"]\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain("[mcp.github]");
      expect(content).not.toContain("npx");
      expect(content).toContain('tools = ["claude"]');
    });

    it("removes MCP section with env sub-section", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[mcp.github]\ncommand = "npx"\n\n[mcp.github.env]\nTOKEN = "abc"\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain("[mcp.github]");
      expect(content).not.toContain("[mcp.github.env]");
      expect(content).not.toContain("TOKEN");
    });

    it("returns not_found when MCP not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });
  });

  describe("rm preset", () => {
    it("removes preset from extends array", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base", "github:org/extra"]\n',
      );

      const result = await configRm("preset", "github:org/base", {
        cwd: tmpDir,
      });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain('"github:org/base"');
      expect(content).toContain('"github:org/extra"');
    });

    it("returns not_found when preset not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      const result = await configRm("preset", "github:org/other", {
        cwd: tmpDir,
      });
      expect(result.action).toBe("not_found");
    });
  });

  describe("rm skill", () => {
    it("removes skill directory", async () => {
      const skillDir = path.join(tmpDir, ".agents", "skills", "typescript");
      await ensureDir(skillDir);
      await outputFile(
        path.join(skillDir, "SKILL.md"),
        "---\ndescription: TypeScript\n---\n\n# typescript\n",
      );

      const result = await configRm("skill", "typescript", { cwd: tmpDir });
      expect(result.action).toBe("removed");
      expect(await pathExists(skillDir)).toBe(false);
    });

    it("returns not_found when skill does not exist", async () => {
      const result = await configRm("skill", "missing", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });
  });

  describe("rm command", () => {
    it("removes command file", async () => {
      const cmdPath = path.join(tmpDir, ".agents", "commands", "deploy.md");
      await ensureDir(path.dirname(cmdPath));
      await outputFile(cmdPath, "---\ndescription: Deploy\n---\n\n# deploy\n");

      const result = await configRm("command", "deploy", { cwd: tmpDir });
      expect(result.action).toBe("removed");
      expect(await pathExists(cmdPath)).toBe(false);
    });

    it("returns not_found when command does not exist", async () => {
      const result = await configRm("command", "missing", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });
  });
});
