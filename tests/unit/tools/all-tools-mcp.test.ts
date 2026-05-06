/**
 * Comprehensive MCP format tests for all 7 tools
 * Verifies each tool writes MCP in its expected format and location
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("MCP Format Tests - All Tools", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-all-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const commandMCP: Record<string, MCP> = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "github_test_test_token_12345" },
    },
    postgres: {
      command: "docker",
      args: ["exec", "postgres-mcp"],
      env: { POSTGRES_URL: "postgresql://localhost:5432/db" },
    },
  };

  const urlMCP: Record<string, MCP> = {
    "remote-api": {
      url: "https://api.example.com/mcp",
      headers: { Authorization: "Bearer test-token" },
    },
  };

  describe("Claude Code (.mcp.json in project root)", () => {
    it("writes command-based MCPs", async () => {
      const provider = getToolProvider("claude");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, ".mcp.json");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = JSON.parse(await readFile(mcpFile, "utf-8"));
      expect(content.mcpServers.github.command).toBe("npx");
      expect(content.mcpServers.github.args).toEqual([
        "-y",
        "@modelcontextprotocol/server-github",
      ]);
      expect(content.mcpServers.github.env.GITHUB_TOKEN).toBe(
        "github_test_test_token_12345",
      );
      expect(content.mcpServers.postgres.command).toBe("docker");
    });

    it("writes URL-based MCPs", async () => {
      const provider = getToolProvider("claude");
      await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
      );
      expect(content.mcpServers["remote-api"].url).toBe(
        "https://api.example.com/mcp",
      );
      expect(content.mcpServers["remote-api"].headers.Authorization).toBe(
        "Bearer test-token",
      );
    });
  });

  describe("OpenCode (opencode.json — mcp key, not mcpServers)", () => {
    it("writes OpenCode MCP format with type and command array", async () => {
      const provider = getToolProvider("opencode");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, "opencode.json");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = JSON.parse(await readFile(mcpFile, "utf-8"));
      expect(content.mcp).toBeDefined();
      expect(Object.keys(content.mcp)).toHaveLength(2);

      // Verify OpenCode format
      const github = content.mcp.github;
      expect(github.type).toBe("local");
      expect(github.command).toEqual([
        "npx",
        "-y",
        "@modelcontextprotocol/server-github",
      ]);
      expect(github.environment.GITHUB_TOKEN).toBe(
        "github_test_test_token_12345",
      );
      expect(github.enabled).toBe(true);
    });

    it("merges into existing opencode.json", async () => {
      await outputFile(
        path.join(tmpDir, "opencode.json"),
        JSON.stringify(
          { model: "claude-sonnet-4-5-20250514", theme: "dark" },
          null,
          2,
        ),
      );

      const provider = getToolProvider("opencode");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
      );
      // Existing settings preserved
      expect(content.model).toBe("claude-sonnet-4-5-20250514");
      expect(content.theme).toBe("dark");
      // MCP added
      expect(content.mcp.github).toBeDefined();
    });
  });

  describe("Cursor (.cursor/mcp.json)", () => {
    it("creates .cursor directory and mcp.json", async () => {
      const provider = getToolProvider("cursor");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, ".cursor", "mcp.json");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = JSON.parse(await readFile(mcpFile, "utf-8"));
      expect(content.mcpServers.github).toBeDefined();
    });
  });

  describe("RooCode (.roo/mcp.json)", () => {
    it("creates .roo directory and mcp.json", async () => {
      const provider = getToolProvider("roocode");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, ".roo", "mcp.json");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = JSON.parse(await readFile(mcpFile, "utf-8"));
      expect(content.mcpServers.github).toBeDefined();
    });
  });

  describe("Codex CLI (.codex/config.toml)", () => {
    it("creates .codex directory and config.toml in TOML format", async () => {
      const provider = getToolProvider("codex");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, ".codex", "config.toml");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = parseToml(await readFile(mcpFile, "utf-8")) as Record<
        string,
        unknown
      >;
      expect(content.mcp_servers).toBeDefined();
    });
  });

  describe("Copilot CLI (.vscode/mcp.json — VS Code native format)", () => {
    it("creates .vscode directory and mcp.json with 'servers' key", async () => {
      const provider = getToolProvider("copilot");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const mcpFile = path.join(tmpDir, ".vscode", "mcp.json");
      expect(await pathExists(mcpFile)).toBe(true);

      const content = JSON.parse(await readFile(mcpFile, "utf-8"));
      expect(content.servers.github).toBeDefined();
    });
  });

  describe("Gemini CLI (.gemini/settings.json — merge)", () => {
    it("creates settings.json with mcpServers", async () => {
      const provider = getToolProvider("gemini");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const settingsFile = path.join(tmpDir, ".gemini", "settings.json");
      expect(await pathExists(settingsFile)).toBe(true);

      const content = JSON.parse(await readFile(settingsFile, "utf-8"));
      expect(content.mcpServers.github).toBeDefined();
      expect(content.mcpServers.postgres).toBeDefined();
    });

    it("merges into existing settings without clobbering", async () => {
      // Write existing settings
      const geminiDir = path.join(tmpDir, ".gemini");
      await ensureDir(geminiDir);
      await outputFile(
        path.join(geminiDir, "settings.json"),
        JSON.stringify(
          { theme: "dark", model: "gemini-2.5-pro", mcpServers: {} },
          null,
          2,
        ),
      );

      const provider = getToolProvider("gemini");
      await provider.mcpFormat!.writeMCP(commandMCP, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
      );
      // Existing settings preserved
      expect(content.theme).toBe("dark");
      expect(content.model).toBe("gemini-2.5-pro");
      // MCP servers added
      expect(content.mcpServers.github).toBeDefined();
    });
  });

  describe("Cross-tool consistency", () => {
    function parseConfigFile(
      fullPath: string,
      raw: string,
    ): Record<string, unknown> {
      if (fullPath.endsWith(".toml"))
        return parseToml(raw) as Record<string, unknown>;
      if (fullPath.endsWith(".yaml") || fullPath.endsWith(".yml"))
        return yaml.load(raw) as Record<string, unknown>;
      return JSON.parse(raw);
    }

    function extractServers(
      content: Record<string, unknown>,
    ): Record<string, unknown> {
      const direct =
        content.mcp_servers ||
        content["amp.mcpServers"] ||
        content.mcpServers ||
        content.mcp ||
        content.servers ||
        content.extensions;
      if (direct) return direct as Record<string, unknown>;
      // OpenHands split-array format
      const merged: Record<string, unknown> = {};
      for (const entry of (content.stdio_servers as Array<{ name: string }>) ||
        [])
        merged[entry.name] = entry;
      for (const entry of (content.sse_servers as Array<{ name: string }>) ||
        [])
        merged[entry.name] = entry;
      return merged;
    }

    it("all tools produce valid parseable config files", async () => {
      for (const toolName of SUPPORTED_TOOLS) {
        const provider = getToolProvider(toolName);
        if (!(provider.mcpFormat && provider.paths.mcpConfigPath)) continue;
        await provider.mcpFormat.writeMCP(commandMCP, tmpDir);
        const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath);
        expect(await pathExists(fullPath)).toBe(true);
        const raw = await readFile(fullPath, "utf-8");
        expect(() => parseConfigFile(fullPath, raw)).not.toThrow();
      }
    });

    it("all tools include all MCP servers", async () => {
      for (const toolName of SUPPORTED_TOOLS) {
        const provider = getToolProvider(toolName);
        if (!(provider.mcpFormat && provider.paths.mcpConfigPath)) continue;
        await provider.mcpFormat.writeMCP(commandMCP, tmpDir);
        const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath);
        const raw = await readFile(fullPath, "utf-8");
        const servers = extractServers(parseConfigFile(fullPath, raw));
        expect(servers).toBeDefined();
        expect(servers.github).toBeDefined();
        expect(servers.postgres).toBeDefined();
      }
    });

    it("handles empty MCP config for all tools", async () => {
      for (const toolName of SUPPORTED_TOOLS) {
        const provider = getToolProvider(toolName);
        if (!provider.mcpFormat) continue;

        await expect(
          provider.mcpFormat.writeMCP({}, tmpDir),
        ).resolves.not.toThrow();
      }
    });
  });
});
