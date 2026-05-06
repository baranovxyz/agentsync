/**
 * OpenHands Split-Array MCP Format Tests
 * OpenHands MCP is configured via JSON at .openhands/mcp.json.
 * Unlike other tools that use a single mcpServers object, OpenHands splits
 * entries into two typed arrays:
 *   - stdio_servers: command-based MCP servers (each entry has a "name" field)
 *   - sse_servers:   URL-based MCP servers    (each entry has a "name" field)
 *
 * Ref: https://github.com/OpenHands/OpenHands
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";

describe("OpenHands Split-Array MCP Format", () => {
  let tmpDir: string;
  const provider = getToolProvider("openhands");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-openhands-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes command-based MCPs to stdio_servers array", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "server-github"],
        env: { GITHUB_TOKEN: "test" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".openhands", "mcp.json");
    const content = JSON.parse(await readFile(mcpFile, "utf-8")) as {
      stdio_servers: Array<Record<string, unknown>>;
      sse_servers: Array<Record<string, unknown>>;
    };

    expect(content.stdio_servers).toHaveLength(1);
    expect(content.sse_servers).toHaveLength(0);

    const entry = content.stdio_servers[0];
    expect(entry.name).toBe("github");
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "server-github"]);
    expect((entry.env as Record<string, string>).GITHUB_TOKEN).toBe("test");
  });

  it("writes URL-based MCPs to sse_servers array", async () => {
    const mcps: Record<string, MCP> = {
      "remote-api": {
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer tok" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".openhands", "mcp.json");
    const content = JSON.parse(await readFile(mcpFile, "utf-8")) as {
      stdio_servers: Array<Record<string, unknown>>;
      sse_servers: Array<Record<string, unknown>>;
    };

    expect(content.stdio_servers).toHaveLength(0);
    expect(content.sse_servers).toHaveLength(1);

    const entry = content.sse_servers[0];
    expect(entry.name).toBe("remote-api");
    expect(entry.url).toBe("https://api.example.com/mcp");
  });

  it("handles mixed command and URL MCPs", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "github_test_abc" },
      },
      "remote-api": {
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer tok" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".openhands", "mcp.json");
    const content = JSON.parse(await readFile(mcpFile, "utf-8")) as {
      stdio_servers: Array<Record<string, unknown>>;
      sse_servers: Array<Record<string, unknown>>;
    };

    expect(content.stdio_servers).toHaveLength(1);
    expect(content.sse_servers).toHaveLength(1);

    const stdioEntry = content.stdio_servers[0];
    expect(stdioEntry.name).toBe("github");
    expect(stdioEntry.command).toBe("npx");

    const sseEntry = content.sse_servers[0];
    expect(sseEntry.name).toBe("remote-api");
    expect(sseEntry.url).toBe("https://api.example.com/mcp");
  });

  it("empty MCPs produce empty arrays", async () => {
    const mcps: Record<string, MCP> = {};

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".openhands", "mcp.json");
    const content = JSON.parse(await readFile(mcpFile, "utf-8")) as {
      stdio_servers: Array<Record<string, unknown>>;
      sse_servers: Array<Record<string, unknown>>;
    };

    expect(content).toEqual({ stdio_servers: [], sse_servers: [] });
  });
});
