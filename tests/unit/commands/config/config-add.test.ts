/**
 * Config Add Command Tests
 * Verifies that agentsync config add correctly adds tools, MCP servers,
 * presets, skills, and commands to the configuration.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configAdd } from "../../../../src/commands/config/add.js";
import { ensureDir, outputFile, pathExists } from "../../../../src/utils/fs.js";

describe("Config Add Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-add-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("invalid type", () => {
    it("throws on invalid type", async () => {
      await expect(
        configAdd("invalid", "foo", { cwd: tmpDir }),
      ).rejects.toThrow("Unknown config type");
    });
  });

  describe("add tool", () => {
    it("validates tool name against SUPPORTED_TOOLS", async () => {
      await expect(
        configAdd("tool", "unknown-tool", { cwd: tmpDir }),
      ).rejects.toThrow("Unknown tool");
    });

    it("adds tool to new config file", async () => {
      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("added");
      expect(result.type).toBe("tool");
      expect(result.name).toBe("cursor");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"cursor"');
    });

    it("adds tool to existing config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"claude"');
      expect(content).toContain('"cursor"');
    });

    it("is idempotent (no duplicate)", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["cursor"]\n',
      );

      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("already_exists");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      // Should still have only one "cursor" entry
      const matches = content.match(/"cursor"/g);
      expect(matches).toHaveLength(1);
    });

    it("appends tools line when missing from existing config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[agentsync]\nversion = "1.0"\n',
      );

      const result = await configAdd("tool", "claude", { cwd: tmpDir });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('tools = ["claude"]');
    });
  });

  describe("add mcp", () => {
    it("requires --mcp-config flag", async () => {
      await expect(configAdd("mcp", "github", { cwd: tmpDir })).rejects.toThrow(
        "--mcp-config flag",
      );
    });

    it("validates JSON structure with Zod", async () => {
      await expect(
        configAdd("mcp", "github", {
          cwd: tmpDir,
          mcpConfig: '{"invalid": true}',
        }),
      ).rejects.toThrow("Invalid MCP server config");
    });

    it("rejects malformed JSON", async () => {
      await expect(
        configAdd("mcp", "github", { cwd: tmpDir, mcpConfig: "{not json}" }),
      ).rejects.toThrow("Invalid JSON");
    });

    it("adds command-based MCP server to new config", async () => {
      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":["-y","@org/server"]}',
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("mcp");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.github]");
      expect(content).toContain('command = "npx"');
      expect(content).toContain('"-y", "@org/server"');
    });

    it("adds URL-based MCP server", async () => {
      const result = await configAdd("mcp", "remote", {
        cwd: tmpDir,
        mcpConfig: '{"url":"https://mcp.example.com"}',
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.remote]");
      expect(content).toContain('url = "https://mcp.example.com"');
    });

    it("adds MCP with env vars", async () => {
      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":[],"env":{"TOKEN":"abc"}}',
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.github.env]");
      expect(content).toContain('TOKEN = "abc"');
    });

    it("writes to existing config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":["-y","@org/server"]}',
      });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('tools = ["claude"]');
      expect(content).toContain("[mcp.github]");
    });

    it("is idempotent (no duplicate MCP section)", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[mcp.github]\ncommand = "npx"\n',
      );

      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":[]}',
      });

      expect(result.action).toBe("already_exists");
    });
  });

  describe("add preset", () => {
    it("validates preset source format", async () => {
      await expect(
        configAdd("preset", "http://bad-source", { cwd: tmpDir }),
      ).rejects.toThrow("Invalid preset source");
    });

    it("adds github preset to new config", async () => {
      const result = await configAdd("preset", "github:company/standards", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("preset");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"github:company/standards"');
    });

    it("adds filesystem preset", async () => {
      const result = await configAdd("preset", "fs:./local-rules", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"fs:./local-rules"');
    });

    it("adds preset to existing extends array", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      await configAdd("preset", "github:org/extra", { cwd: tmpDir });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"github:org/base"');
      expect(content).toContain('"github:org/extra"');
    });

    it("is idempotent", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      const result = await configAdd("preset", "github:org/base", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("already_exists");
    });
  });

  describe("add skill", () => {
    it("creates skill directory and SKILL.md", async () => {
      const result = await configAdd("skill", "typescript", {
        cwd: tmpDir,
        description: "TypeScript coding standards",
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("skill");

      const skillPath = path.join(
        tmpDir,
        ".agents",
        "skills",
        "typescript",
        "SKILL.md",
      );
      expect(await pathExists(skillPath)).toBe(true);

      const content = await readFile(skillPath, "utf-8");
      expect(content).toContain("description: TypeScript coding standards");
      expect(content).toContain("# typescript");
    });

    it("uses default description when not provided", async () => {
      await configAdd("skill", "testing", { cwd: tmpDir });

      const skillPath = path.join(
        tmpDir,
        ".agents",
        "skills",
        "testing",
        "SKILL.md",
      );
      const content = await readFile(skillPath, "utf-8");
      expect(content).toContain("description: testing skill");
    });

    it("is idempotent", async () => {
      await configAdd("skill", "typescript", { cwd: tmpDir });
      const result = await configAdd("skill", "typescript", { cwd: tmpDir });
      expect(result.action).toBe("already_exists");
    });
  });

  describe("add command", () => {
    it("creates command markdown file", async () => {
      const result = await configAdd("command", "deploy", {
        cwd: tmpDir,
        description: "Deploy to production",
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("command");

      const cmdPath = path.join(tmpDir, ".agents", "commands", "deploy.md");
      expect(await pathExists(cmdPath)).toBe(true);

      const content = await readFile(cmdPath, "utf-8");
      expect(content).toContain("description: Deploy to production");
      expect(content).toContain("# deploy");
    });

    it("uses default description when not provided", async () => {
      await configAdd("command", "test-all", { cwd: tmpDir });

      const cmdPath = path.join(tmpDir, ".agents", "commands", "test-all.md");
      const content = await readFile(cmdPath, "utf-8");
      expect(content).toContain("description: test-all command");
    });

    it("is idempotent", async () => {
      await configAdd("command", "deploy", { cwd: tmpDir });
      const result = await configAdd("command", "deploy", { cwd: tmpDir });
      expect(result.action).toBe("already_exists");
    });
  });
});
