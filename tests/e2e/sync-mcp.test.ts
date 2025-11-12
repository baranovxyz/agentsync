/**
 * E2E MCP Sync Tests
 *
 * Tests the full sync flow with MCP servers:
 * - Project config with mcpServers and mcpEnabled
 * - Sync command creates tool-specific configs
 * - Token substitution works correctly
 * - Disabled servers are excluded
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sync as mainSync } from "../../src/commands/sync.js";
import * as fs from "../../src/utils/fs.js";

// Schema for MCP config file structure
const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

describe("MCP Sync E2E", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  /**
   * Helper to write JSON files
   */
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }

  beforeEach(async () => {
    // Setup temp directories
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-sync-mcp-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    tempHomeDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHomeDir;

    if (process.platform === "win32") {
      originalUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tempHomeDir;
    }

    // Setup global registry
    const globalRegistry = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
      },
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { DATABASE_URL: "{DATABASE_URL}" },
      },
    };

    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    }

    await fs.remove(tempDir);
    await fs.remove(tempHomeDir);
  });

  it("should sync MCPs to Cursor and Claude configs", async () => {
    // Setup project config with MCP servers
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "test-token-123" },
        },
      },
      mcpEnabled: ["github"],
      tools: ["cursor", "claude"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify Cursor MCP config
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    expect(await fs.pathExists(cursorMcpFile)).toBe(true);

    const cursorContent = await fs.readJsonValidated(
      cursorMcpFile,
      mcpConfigSchema,
    );
    expect(cursorContent.mcpServers).toHaveProperty("github");
    expect(cursorContent.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token-123" },
    });

    // Verify Claude MCP config (in project root as .mcp.json)
    const claudeMcpFile = path.join(tempDir, ".mcp.json");
    expect(await fs.pathExists(claudeMcpFile)).toBe(true);

    const claudeContent = await fs.readJsonValidated(
      claudeMcpFile,
      mcpConfigSchema,
    );
    expect(claudeContent.mcpServers).toHaveProperty("github");
    expect(claudeContent.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token-123" },
    });
  });

  it("should substitute environment variable tokens in MCP configs", async () => {
    // Set environment variable
    process.env.GITHUB_TOKEN = "env-token-456";

    // Setup project config with token
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
        },
      },
      mcpEnabled: ["github"],
      tools: ["cursor"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify token substitution
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "env-token-456" },
    });

    // Cleanup
    process.env.GITHUB_TOKEN = undefined;
  });

  it("should only sync enabled MCPs, not all registry servers", async () => {
    // Setup project config with multiple servers but only one enabled
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
        postgres: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        },
      },
      mcpEnabled: ["github"], // Only github enabled
      tools: ["cursor"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify only github is synced
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("github");
    expect(content.mcpServers).not.toHaveProperty("postgres");
    expect(Object.keys(content.mcpServers)).toHaveLength(1);
  });

  it("should exclude disabled MCPs even if they're in enabled list", async () => {
    // Setup project config with enabled and disabled
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
        postgres: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
        },
      },
      mcpEnabled: ["github", "postgres"],
      mcpDisabled: ["postgres"], // Disabled wins
      tools: ["cursor"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify postgres is excluded
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("github");
    expect(content.mcpServers).not.toHaveProperty("postgres");
    expect(Object.keys(content.mcpServers)).toHaveLength(1);
  });

  it("should sync empty config when no MCPs are enabled", async () => {
    // Setup project config with servers but none enabled
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      },
      mcpEnabled: [], // Empty - no servers enabled
      tools: ["cursor"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify empty config is written
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toEqual({});
    expect(Object.keys(content.mcpServers)).toHaveLength(0);
  });

  it("should sync URL-based MCP servers", async () => {
    // Setup project config with URL-based server
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {
        "remote-api": {
          url: "https://api.example.com/mcp",
          headers: {
            Authorization: "Bearer secret-token",
          },
        },
      },
      mcpEnabled: ["remote-api"],
      tools: ["cursor"],
    });

    // Run sync
    await mainSync(tempDir, {
      verbose: false,
      dryRun: false,
      confirm: false,
    });

    // Verify URL-based server
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("remote-api");
    expect(content.mcpServers["remote-api"]).toEqual({
      url: "https://api.example.com/mcp",
      headers: {
        Authorization: "Bearer secret-token",
      },
    });
  });
});
