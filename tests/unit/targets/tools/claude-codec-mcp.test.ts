/**
 * Claude Codec MCP Sync Tests
 * Tests the syncMCP() method for Claude Code integration
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ClaudeCodec } from "../../../../src/targets/tools/claude-codec.js";
import type { MCP } from "../../../../src/types/schemas.js";
import * as fs from "../../../../src/utils/fs.js";

// Schema for MCP config file structure
const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

describe("ClaudeCodec.syncMCP", () => {
  let tempDir: string;
  let codec: ClaudeCodec;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-claude-mcp-"));
    codec = new ClaudeCodec();
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.remove(tempDir);
  });

  it("creates .mcp.json in project root with empty registry", async () => {
    const mcps: Record<string, MCP> = {};

    await codec.syncMCP(mcps, tempDir);

    // Per JSDoc: project MCP config is in .mcp.json in project root
    const mcpFile = path.join(tempDir, ".mcp.json");
    expect(await fs.pathExists(mcpFile)).toBe(true);

    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);
    expect(content).toEqual({
      mcpServers: {},
    });
  });

  it("creates .mcp.json with command-based MCP server", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "test-token",
        },
      },
    };

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".mcp.json");
    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);

    expect(content).toEqual({
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "test-token",
          },
        },
      },
    });
  });

  it("creates .mcp.json with URL-based MCP server", async () => {
    const mcps: Record<string, MCP> = {
      "remote-api": {
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    };

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".mcp.json");
    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);

    expect(content).toEqual({
      mcpServers: {
        "remote-api": {
          url: "https://api.example.com/mcp",
          headers: {
            Authorization: "Bearer token",
          },
        },
      },
    });
  });

  it("creates .mcp.json with multiple MCP servers", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: {
          POSTGRES_URL: "postgresql://localhost:5432/db",
        },
      },
      "remote-api": {
        url: "https://api.example.com/mcp",
      },
    };

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".mcp.json");
    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("github");
    expect(content.mcpServers).toHaveProperty("postgres");
    expect(content.mcpServers).toHaveProperty("remote-api");
    expect(Object.keys(content.mcpServers)).toHaveLength(3);
  });

  it("formats JSON with 2-space indentation and trailing newline", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".mcp.json");
    const rawContent = await fs.readFile(mcpFile, "utf-8");

    // Check formatting
    expect(rawContent).toMatch(/^\{\n {2}"mcpServers"/); // 2-space indent
    expect(rawContent.endsWith("\n")).toBe(true); // trailing newline
  });

  it("writes to project root, not .claude subdirectory", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await codec.syncMCP(mcps, tempDir);

    // Should be in project root
    const rootMcpFile = path.join(tempDir, ".mcp.json");
    expect(await fs.pathExists(rootMcpFile)).toBe(true);

    // Should NOT be in .claude subdirectory
    const claudeDirMcpFile = path.join(tempDir, ".claude", "mcp.json");
    expect(await fs.pathExists(claudeDirMcpFile)).toBe(false);
  });

  it("overwrites existing .mcp.json file", async () => {
    // Write initial config
    const initialMcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };
    await codec.syncMCP(initialMcps, tempDir);

    // Overwrite with new config
    const newMcps: Record<string, MCP> = {
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
      },
    };
    await codec.syncMCP(newMcps, tempDir);

    const mcpFile = path.join(tempDir, ".mcp.json");
    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);

    // Should only have postgres, not github
    expect(content.mcpServers).toHaveProperty("postgres");
    expect(content.mcpServers).not.toHaveProperty("github");
  });
});
