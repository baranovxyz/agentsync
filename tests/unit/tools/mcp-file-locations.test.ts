/**
 * MCP File Locations Test
 * For each of the 7 tools, verifies the MCP file is written to the correct path
 * and that parent directories are auto-created.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { syncMCP } from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { pathExists } from "../../../src/utils/fs.js";

describe("MCP File Locations", () => {
  let tmpDir: string;

  const testMcps: Record<string, MCP> = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token" },
    },
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-locations-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes Claude MCP to .mcp.json", async () => {
    const provider = getToolProvider("claude");
    expect(provider.paths.mcpConfigPath).toBe(".mcp.json");

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes OpenCode MCP to opencode.json under 'mcp' key", async () => {
    const provider = getToolProvider("opencode");
    expect(provider.paths.mcpConfigPath).toBe("opencode.json");

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, "opencode.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcp).toBeDefined();
    expect(content.mcp.github).toBeDefined();
  });

  it("writes Cursor MCP to .cursor/mcp.json and creates .cursor/ dir", async () => {
    const provider = getToolProvider("cursor");
    expect(provider.paths.mcpConfigPath).toBe(".cursor/mcp.json");

    // .cursor/ should not exist yet
    expect(await pathExists(path.join(tmpDir, ".cursor"))).toBe(false);

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".cursor", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes RooCode MCP to .roo/mcp.json and creates .roo/ dir", async () => {
    const provider = getToolProvider("roocode");
    expect(provider.paths.mcpConfigPath).toBe(".roo/mcp.json");

    expect(await pathExists(path.join(tmpDir, ".roo"))).toBe(false);

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".roo", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes Codex MCP to .codex/config.toml and creates .codex/ dir", async () => {
    const provider = getToolProvider("codex");
    expect(provider.paths.mcpConfigPath).toBe(".codex/config.toml");

    expect(await pathExists(path.join(tmpDir, ".codex"))).toBe(false);

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".codex", "config.toml");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = parseToml(await readFile(mcpPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const servers = content.mcp_servers as Record<string, unknown>;
    expect(servers.github).toBeDefined();
  });

  it("writes Copilot MCP to .vscode/mcp.json and creates .vscode/ dir", async () => {
    const provider = getToolProvider("copilot");
    expect(provider.paths.mcpConfigPath).toBe(".vscode/mcp.json");

    expect(await pathExists(path.join(tmpDir, ".vscode"))).toBe(false);

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".vscode", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    // VS Code native format uses "servers" key
    expect(content.servers.github).toBeDefined();
  });

  it("writes Gemini MCP to .gemini/settings.json and creates .gemini/ dir", async () => {
    const provider = getToolProvider("gemini");
    expect(provider.paths.mcpConfigPath).toBe(".gemini/settings.json");

    expect(await pathExists(path.join(tmpDir, ".gemini"))).toBe(false);

    await syncMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".gemini", "settings.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes MCP to all 17 MCP-capable tools in one call", async () => {
    const allTools = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
      "amp",
      "goose",
      "amazonq",
      "augment",
      "kiro",
      "openhands",
      "junie",
      "crush",
      "kilocode",
      "qwen",
    ] as const;
    const providers = allTools.map(getToolProvider);
    const results = await syncMCP(providers, testMcps, tmpDir);

    expect(results).toHaveLength(17);
    for (const result of results) {
      expect(result.serverCount).toBe(1);
      expect(result.servers).toContain("github");
    }

    // Verify all files created
    const expectedPaths = [
      ".mcp.json",
      "opencode.json",
      ".cursor/mcp.json",
      ".roo/mcp.json",
      ".codex/config.toml",
      ".vscode/mcp.json",
      ".gemini/settings.json",
      ".amp/settings.json",
      ".goose/config.yaml",
      ".amazonq/mcp.json",
      ".augment/settings.json",
      ".kiro/settings/mcp.json",
      ".openhands/mcp.json",
      ".junie/mcp/mcp.json",
      "crush.json",
      ".kilocode/mcp.json",
      ".qwen/.mcp.json",
    ];

    for (const expected of expectedPaths) {
      expect(
        await pathExists(path.join(tmpDir, expected)),
        `${expected} should exist`,
      ).toBe(true);
    }
  });

  it("writes multiple MCP servers to each tool", async () => {
    const multiMcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "token1" },
      },
      postgres: {
        command: "docker",
        args: ["exec", "postgres-mcp"],
        env: { POSTGRES_URL: "postgres://localhost" },
      },
    };

    const provider = getToolProvider("claude");
    await syncMCP([provider], multiMcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(Object.keys(content.mcpServers)).toHaveLength(2);
    expect(content.mcpServers.github).toBeDefined();
    expect(content.mcpServers.postgres).toBeDefined();
  });
});
