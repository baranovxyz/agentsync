/**
 * OpenCode MCP Format Deep Tests
 * OpenCode uses a unique format: "mcp" key, "command" as array, "environment" field
 * Ref: https://opencode.ai/docs/mcp-servers/
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile } from "../../../src/utils/fs.js";

describe("OpenCode MCP Format", () => {
  let tmpDir: string;
  const provider = getToolProvider("opencode");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-opencode-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("uses 'mcp' key instead of 'mcpServers'", async () => {
    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: ["-y", "@mcp/github"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp).toBeDefined();
    expect(content.mcpServers).toBeUndefined();
  });

  it("converts command+args into single command array", async () => {
    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: ["-y", "@mcp/test", "--port", "3000"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.server.command).toEqual([
      "npx",
      "-y",
      "@mcp/test",
      "--port",
      "3000",
    ]);
  });

  it("maps env to environment field", async () => {
    const mcps: Record<string, MCP> = {
      server: {
        command: "npx",
        args: ["-y", "@mcp/server"],
        env: {
          API_KEY: "secret-123",
          DB_URL: "postgresql://localhost/db",
        },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.server.environment).toEqual({
      API_KEY: "secret-123",
      DB_URL: "postgresql://localhost/db",
    });
    expect(content.mcp.server.env).toBeUndefined();
  });

  it("sets type to 'local' for command-based MCPs", async () => {
    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: [] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.server.type).toBe("local");
  });

  it("sets type to 'remote' for URL-based MCPs", async () => {
    const mcps: Record<string, MCP> = {
      remote: {
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer tok" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.remote.type).toBe("remote");
    expect(content.mcp.remote.url).toBe("https://api.example.com/mcp");
    expect(content.mcp.remote.headers.Authorization).toBe("Bearer tok");
  });

  it("sets enabled: true for all servers", async () => {
    const mcps: Record<string, MCP> = {
      s1: { command: "npx", args: [] },
      s2: { url: "https://remote.example.com/mcp" },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.s1.enabled).toBe(true);
    expect(content.mcp.s2.enabled).toBe(true);
  });

  it("omits environment field when env is empty/undefined", async () => {
    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: ["-y", "@mcp/server"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.server.environment).toBeUndefined();
  });

  it("preserves existing opencode.json keys on merge", async () => {
    // Pre-existing config
    await outputFile(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "claude-sonnet-4-5-20250514",
        theme: "dark",
        instructions: ["AGENTS.md"],
      }),
    );

    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: ["-y", "@mcp/github"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.$schema).toBe("https://opencode.ai/config.json");
    expect(content.model).toBe("claude-sonnet-4-5-20250514");
    expect(content.theme).toBe("dark");
    expect(content.instructions).toEqual(["AGENTS.md"]);
    expect(content.mcp.github).toBeDefined();
  });

  it("handles multiple servers correctly", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { GITHUB_TOKEN: "tok" },
      },
      postgres: {
        command: "docker",
        args: ["exec", "pg-mcp"],
        env: { DB_URL: "postgresql://localhost/db" },
      },
      remote: {
        url: "https://api.example.com/mcp",
        headers: { "X-Api-Key": "key-123" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(Object.keys(content.mcp)).toHaveLength(3);

    // Local servers
    expect(content.mcp.github.type).toBe("local");
    expect(content.mcp.github.command).toEqual(["npx", "-y", "@mcp/github"]);
    expect(content.mcp.postgres.type).toBe("local");
    expect(content.mcp.postgres.command).toEqual(["docker", "exec", "pg-mcp"]);

    // Remote server
    expect(content.mcp.remote.type).toBe("remote");
  });

  it("recovers from malformed existing opencode.json", async () => {
    await outputFile(path.join(tmpDir, "opencode.json"), "not valid json{{{");

    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: [] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(content.mcp.server).toBeDefined();
  });
});
