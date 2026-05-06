import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncMCP } from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { pathExists } from "../../../src/utils/fs.js";

describe("MCP Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const testMcps = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token" },
    },
  };

  it("writes MCP to Claude .mcp.json", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncMCP(providers, testMcps, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].serverCount).toBe(1);

    const mcpFile = path.join(tmpDir, ".mcp.json");
    expect(await pathExists(mcpFile)).toBe(true);

    const content = JSON.parse(await readFile(mcpFile, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
    expect(content.mcpServers.github.command).toBe("npx");
  });

  it("writes MCP to Cursor .cursor/mcp.json", async () => {
    const providers = [getToolProvider("cursor")];
    await syncMCP(providers, testMcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".cursor", "mcp.json");
    expect(await pathExists(mcpFile)).toBe(true);
  });

  it("writes MCP to RooCode .roo/mcp.json", async () => {
    const providers = [getToolProvider("roocode")];
    await syncMCP(providers, testMcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".roo", "mcp.json");
    expect(await pathExists(mcpFile)).toBe(true);
  });

  it("merges MCP into Gemini settings.json", async () => {
    const providers = [getToolProvider("gemini")];
    await syncMCP(providers, testMcps, tmpDir);

    const settingsFile = path.join(tmpDir, ".gemini", "settings.json");
    expect(await pathExists(settingsFile)).toBe(true);

    const content = JSON.parse(await readFile(settingsFile, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes to all 17 MCP-capable tools simultaneously", async () => {
    const allProviders = [
      getToolProvider("claude"),
      getToolProvider("opencode"),
      getToolProvider("cursor"),
      getToolProvider("roocode"),
      getToolProvider("codex"),
      getToolProvider("copilot"),
      getToolProvider("gemini"),
      getToolProvider("amp"),
      getToolProvider("goose"),
      getToolProvider("amazonq"),
      getToolProvider("augment"),
      getToolProvider("kiro"),
      getToolProvider("openhands"),
      getToolProvider("junie"),
      getToolProvider("crush"),
      getToolProvider("kilocode"),
      getToolProvider("qwen"),
    ];

    const results = await syncMCP(allProviders, testMcps, tmpDir);
    expect(results).toHaveLength(17);

    // All should have 1 server
    for (const result of results) {
      expect(result.serverCount).toBe(1);
    }
  });

  it("handles empty MCP config", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncMCP(providers, {}, tmpDir);

    expect(results[0].serverCount).toBe(0);
  });
});
