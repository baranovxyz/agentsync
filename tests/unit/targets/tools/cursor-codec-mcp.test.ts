/**
 * Cursor Codec MCP Sync Tests
 * Tests the syncMCP() method for Cursor tool integration
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CursorCodec } from "../../../../src/targets/tools/cursor-codec.js";
import type { MCP } from "../../../../src/types/schemas.js";
import * as fs from "../../../../src/utils/fs.js";

// Schema for MCP config file structure
const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

describe("CursorCodec.syncMCP", () => {
  let tempDir: string;
  let codec: CursorCodec;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-cursor-mcp-"));
    codec = new CursorCodec();
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.remove(tempDir);
  });

  it("creates .cursor/mcp.json with empty registry", async () => {
    const mcps: Record<string, MCP> = {};

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
    expect(await fs.pathExists(mcpFile)).toBe(true);

    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);
    expect(content).toEqual({
      mcpServers: {},
    });
  });

  it("creates .cursor/mcp.json with command-based MCP server", async () => {
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

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
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

  it("creates .cursor/mcp.json with URL-based MCP server", async () => {
    const mcps: Record<string, MCP> = {
      "remote-api": {
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    };

    await codec.syncMCP(mcps, tempDir);

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
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

  it("creates .cursor/mcp.json with multiple MCP servers", async () => {
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

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
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

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const rawContent = await fs.readFile(mcpFile, "utf-8");

    // Check formatting
    expect(rawContent).toMatch(/^\{\n {2}"mcpServers"/); // 2-space indent
    expect(rawContent.endsWith("\n")).toBe(true); // trailing newline
  });

  it("creates .cursor directory if it doesn't exist", async () => {
    const mcps: Record<string, MCP> = {};
    const cursorDir = path.join(tempDir, ".cursor");

    // Verify directory doesn't exist
    expect(await fs.pathExists(cursorDir)).toBe(false);

    await codec.syncMCP(mcps, tempDir);

    // Verify directory was created
    expect(await fs.pathExists(cursorDir)).toBe(true);
  });

  it("overwrites existing .cursor/mcp.json file", async () => {
    const cursorDir = path.join(tempDir, ".cursor");
    await fs.ensureDir(cursorDir);

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

    const mcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(mcpFile, mcpConfigSchema);

    // Should only have postgres, not github
    expect(content.mcpServers).toHaveProperty("postgres");
    expect(content.mcpServers).not.toHaveProperty("github");
  });
});
