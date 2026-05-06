/**
 * Copilot MCP Format Tests
 * Deep tests for Copilot MCP at .vscode/mcp.json (VS Code native format, key "servers")
 * Multiple servers, URL-based, empty config, directory creation
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { pathExists } from "../../../src/utils/fs.js";

describe("Copilot MCP Format", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-copilot-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const provider = getToolProvider("copilot");

  it("creates .vscode directory when it does not exist", async () => {
    const mcps: Record<string, MCP> = {
      basic: { command: "npx", args: ["-y", "basic-server"] },
    };

    expect(await pathExists(path.join(tmpDir, ".vscode"))).toBe(false);
    await provider.mcpFormat!.writeMCP(mcps, tmpDir);
    expect(await pathExists(path.join(tmpDir, ".vscode"))).toBe(true);
  });

  it("writes mcp.json at correct path", async () => {
    const mcps: Record<string, MCP> = {
      test: { command: "node", args: ["server.js"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const mcpFile = path.join(tmpDir, ".vscode", "mcp.json");
    expect(await pathExists(mcpFile)).toBe(true);
    expect(provider.paths.mcpConfigPath).toBe(".vscode/mcp.json");
  });

  it("uses VS Code native 'servers' key (not 'mcpServers')", async () => {
    const mcps: Record<string, MCP> = {
      test: { command: "node", args: ["server.js"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers).toBeDefined();
    expect(content.mcpServers).toBeUndefined();
  });

  it("writes multiple command-based servers", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "github_test_abc123" },
      },
      postgres: {
        command: "docker",
        args: ["exec", "pg-mcp"],
        env: { PG_URL: "postgresql://localhost/db" },
      },
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(Object.keys(content.servers)).toHaveLength(3);
    expect(content.servers.github.command).toBe("npx");
    expect(content.servers.github.env.GITHUB_TOKEN).toBe("github_test_abc123");
    expect(content.servers.postgres.command).toBe("docker");
    expect(content.servers.filesystem.args).toContain("/home");
  });

  it("writes URL-based servers", async () => {
    const mcps: Record<string, MCP> = {
      "remote-api": {
        url: "https://mcp.example.com/v1",
        headers: {
          Authorization: "Bearer secret-token",
          "X-Custom": "value",
        },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers["remote-api"].url).toBe(
      "https://mcp.example.com/v1",
    );
    expect(content.servers["remote-api"].headers.Authorization).toBe(
      "Bearer secret-token",
    );
    expect(content.servers["remote-api"].headers["X-Custom"]).toBe("value");
  });

  it("writes mixed command and URL servers", async () => {
    const mcps: Record<string, MCP> = {
      local: { command: "npx", args: ["server"], env: { PORT: "3000" } },
      remote: { url: "https://api.example.com/mcp" },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers.local.command).toBe("npx");
    expect(content.servers.remote.url).toBe("https://api.example.com/mcp");
  });

  it("handles empty MCP config", async () => {
    await provider.mcpFormat!.writeMCP({}, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers).toEqual({});
  });

  it("overwrites existing mcp.json", async () => {
    // First write
    await provider.mcpFormat!.writeMCP(
      { old: { command: "old-cmd", args: [] } },
      tmpDir,
    );

    // Second write
    await provider.mcpFormat!.writeMCP(
      { new: { command: "new-cmd", args: ["--flag"] } },
      tmpDir,
    );

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers.old).toBeUndefined();
    expect(content.servers.new.command).toBe("new-cmd");
  });

  it("produces valid JSON with trailing newline", async () => {
    const mcps: Record<string, MCP> = {
      test: { command: "node", args: ["index.js"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const raw = await readFile(
      path.join(tmpDir, ".vscode", "mcp.json"),
      "utf-8",
    );

    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("writes servers with no env field", async () => {
    const mcps: Record<string, MCP> = {
      minimal: { command: "npx", args: ["-y", "minimal-server"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
    );

    expect(content.servers.minimal.command).toBe("npx");
    expect(content.servers.minimal.env).toBeUndefined();
  });
});
