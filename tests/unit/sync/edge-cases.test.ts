/**
 * Edge Case Tests for Sync Modules
 * Tests unusual inputs, boundary conditions, and error recovery
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../src/sync/agents.js";
import { syncCommands } from "../../../src/sync/commands.js";
import { syncDocs } from "../../../src/sync/docs.js";
import { generateHeader } from "../../../src/sync/header.js";
import { syncMCP } from "../../../src/sync/mcp.js";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider, getToolProviders } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Sync Edge Cases", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-edge-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Skills with extra files", () => {
    it("copies SKILL.md and additional files in skill directory", async () => {
      const skillDir = path.join(tmpDir, ".agents", "skills", "code-review");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Review Skill");
      await outputFile(path.join(skillDir, "template.md"), "# Review Template");
      await outputFile(
        path.join(skillDir, "checklist.txt"),
        "- item 1\n- item 2",
      );

      const providers = [getToolProvider("claude")];
      await syncSkills(providers, tmpDir);

      const base = path.join(tmpDir, ".claude", "skills", "code-review");
      expect(await pathExists(path.join(base, "SKILL.md"))).toBe(true);
      expect(await pathExists(path.join(base, "template.md"))).toBe(true);
      expect(await pathExists(path.join(base, "checklist.txt"))).toBe(true);
    });
  });

  describe("Multiple skills simultaneously", () => {
    it("syncs many skills at once without interference", async () => {
      const skillNames = ["code-review", "tdd", "deploy", "commit", "refactor"];

      for (const name of skillNames) {
        const dir = path.join(tmpDir, ".agents", "skills", name);
        await ensureDir(dir);
        await outputFile(
          path.join(dir, "SKILL.md"),
          `# ${name} skill\nInstructions for ${name}.`,
        );
      }

      const providers = getToolProviders([
        "claude",
        "cursor",
        "roocode",
        "gemini",
      ]);
      const results = await syncSkills(providers, tmpDir);

      // Holdout tools (claude, cursor) get skills copied; native tools (roocode, gemini) skip
      for (const result of results) {
        const provider = providers.find((p) => p.name === result.tool)!;
        if (provider.readsAgentsDir) {
          expect(result.skillCount).toBe(0);
        } else {
          expect(result.skillCount).toBe(5);
        }
      }

      // Verify content integrity on holdout tool
      for (const name of skillNames) {
        const content = await readFile(
          path.join(tmpDir, ".claude", "skills", name, "SKILL.md"),
          "utf-8",
        );
        expect(content).toContain(`# ${name} skill`);
      }
    });
  });

  describe("Empty input handling", () => {
    it("syncSkills with no providers returns empty array", async () => {
      const results = await syncSkills([], tmpDir);
      expect(results).toHaveLength(0);
    });

    it("syncCommands with no providers returns empty array", async () => {
      const results = await syncCommands([], tmpDir);
      expect(results).toHaveLength(0);
    });

    it("syncAgents with no providers returns empty array", async () => {
      const results = await syncAgents([], tmpDir);
      expect(results).toHaveLength(0);
    });

    it("syncMCP with empty servers writes empty config", async () => {
      const providers = [getToolProvider("claude")];
      await syncMCP(providers, {}, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
      );
      expect(content.mcpServers).toEqual({});
    });

    it("syncDocs with no AGENTS.md returns created=false", async () => {
      const providers = [getToolProvider("claude")];
      const results = await syncDocs(providers, tmpDir);
      expect(results[0].created).toBe(false);
    });
  });

  describe("Large file handling", () => {
    it("handles skill files with large content", async () => {
      const largeContent = `# Skill\n${"x".repeat(100_000)}`;
      const dir = path.join(tmpDir, ".agents", "skills", "large");
      await ensureDir(dir);
      await outputFile(path.join(dir, "SKILL.md"), largeContent);

      const providers = [getToolProvider("claude")];
      await syncSkills(providers, tmpDir);

      const output = await readFile(
        path.join(tmpDir, ".claude", "skills", "large", "SKILL.md"),
        "utf-8",
      );
      const header = generateHeader(".agents/skills/large/SKILL.md");
      expect(output.length).toBe(header.length + largeContent.length);
    });
  });

  describe("MCP with multiple servers", () => {
    it("writes 10 MCP servers correctly to all tools", async () => {
      const mcps: Record<string, { command: string; args: string[] }> = {};
      for (let i = 0; i < 10; i++) {
        mcps[`server-${i}`] = {
          command: "npx",
          args: ["-y", `@mcp/server-${i}`],
        };
      }

      const providers = getToolProviders([
        "claude",
        "cursor",
        "roocode",
        "gemini",
      ]);
      const results = await syncMCP(providers, mcps, tmpDir);

      for (const result of results) {
        expect(result.serverCount).toBe(10);
      }
    });
  });

  describe("MCP URL-based servers", () => {
    it("writes URL-based MCP to Claude", async () => {
      const mcps = {
        remote: {
          url: "https://api.example.com/mcp",
          headers: { Authorization: "Bearer tok-123" },
        },
      };

      const providers = [getToolProvider("claude")];
      await syncMCP(providers, mcps, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
      );
      expect(content.mcpServers.remote.url).toBe("https://api.example.com/mcp");
      expect(content.mcpServers.remote.headers.Authorization).toBe(
        "Bearer tok-123",
      );
    });

    it("writes URL-based MCP to OpenCode as remote type", async () => {
      const mcps = {
        remote: {
          url: "https://api.example.com/mcp",
          headers: { "X-Key": "value" },
        },
      };

      const providers = [getToolProvider("opencode")];
      await syncMCP(providers, mcps, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
      );
      expect(content.mcp.remote.type).toBe("remote");
      expect(content.mcp.remote.url).toBe("https://api.example.com/mcp");
      expect(content.mcp.remote.headers["X-Key"]).toBe("value");
    });
  });

  describe("Docs overwrite behavior", () => {
    it("overwrites existing CLAUDE.md with fresh directive file", async () => {
      // Create an existing CLAUDE.md with different content
      await outputFile(path.join(tmpDir, "CLAUDE.md"), "# Old Content");
      await outputFile(path.join(tmpDir, "AGENTS.md"), "# New Content");

      const providers = [getToolProvider("claude")];
      await syncDocs(providers, tmpDir);

      const content = await readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(content).toBe("@AGENTS.md\n");
    });
  });

  describe("Special characters in content", () => {
    it("preserves special characters in skill files", async () => {
      const content =
        "---\nname: special\n---\n# Special chars: <>&\"'`[]\nCode: `const x = 1;`\n";
      const dir = path.join(tmpDir, ".agents", "skills", "special");
      await ensureDir(dir);
      await outputFile(path.join(dir, "SKILL.md"), content);

      const providers = [getToolProvider("claude")];
      await syncSkills(providers, tmpDir);

      const output = await readFile(
        path.join(tmpDir, ".claude", "skills", "special", "SKILL.md"),
        "utf-8",
      );
      const header = generateHeader(".agents/skills/special/SKILL.md");
      expect(output).toBe(header + content);
    });

    it("preserves unicode in command files", async () => {
      const content =
        "---\ndescription: 日本語テスト\n---\n# コマンド\n\n使い方の説明。";
      await ensureDir(path.join(tmpDir, ".agents", "commands"));
      await outputFile(
        path.join(tmpDir, ".agents", "commands", "unicode.md"),
        content,
      );

      const providers = [getToolProvider("claude")];
      await syncCommands(providers, tmpDir);

      const output = await readFile(
        path.join(tmpDir, ".claude", "commands", "unicode.md"),
        "utf-8",
      );
      const header = generateHeader(".agents/commands/unicode.md");
      expect(output).toBe(header + content);
    });
  });
});
