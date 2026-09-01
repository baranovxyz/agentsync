/**
 * E2E MCP Sync Tests
 *
 * Tests the full sync flow with MCP servers:
 * - Project config with mcp (defined = enabled)
 * - Sync command creates tool-specific configs
 * - Token substitution works correctly
 * - Disabled servers are excluded via local config mcp_disabled
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sync as mainSync } from "../../src/commands/sync.js";
import { CliResultSchema, SyncDataSchema } from "../../src/types/output.js";
import * as fs from "../../src/utils/fs.js";

// Schema for MCP config file structure
const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

const syncResultSchema = CliResultSchema.extend({
  command: z.literal("sync"),
  data: SyncDataSchema,
});

describe("MCP Sync E2E", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalGithubToken: string | undefined;
  let consoleOutput: string[];
  const originalLog = console.log;

  function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  async function runSync() {
    consoleOutput = [];
    await mainSync({ cwd: tempDir, json: true });

    expect(consoleOutput).toHaveLength(1);
    const result = fs.parseJsonValidated(consoleOutput[0], syncResultSchema);
    expect(result.status).toBe("success");
    return result;
  }

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
    originalUserProfile = process.env.USERPROFILE;
    originalGithubToken = process.env.GITHUB_TOKEN;

    if (process.platform === "win32") {
      process.env.USERPROFILE = tempHomeDir;
    }

    consoleOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };

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

    const agentsyncDir = path.join(tempHomeDir, ".agents");
    await fs.ensureDir(agentsyncDir);
    await writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    console.log = originalLog;
    restoreEnv("HOME", originalHome);
    restoreEnv("USERPROFILE", originalUserProfile);
    restoreEnv("GITHUB_TOKEN", originalGithubToken);

    await fs.remove(tempDir);
    await fs.remove(tempHomeDir);
  });

  it("should sync MCPs to Cursor and Claude configs", async () => {
    // Setup project config with MCP servers (defined = enabled)
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      `tools = ["cursor", "claude"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "test-token-123"
`,
    );

    // Run sync
    const result = await runSync();
    expect(result.data.tools).toEqual(["cursor", "claude"]);
    expect(result.data.mcpServers).toBe(1);

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

    // Setup project config with token (defined = enabled)
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      `tools = ["cursor"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
`,
    );

    // Run sync
    const result = await runSync();
    expect(result.data.mcpServers).toBe(1);

    // Verify token substitution
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "env-token-456" },
    });
  });

  it("should only sync defined MCPs (defined = enabled)", async () => {
    // Setup project config with only the MCPs we want active
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      `tools = ["cursor"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
`,
    );

    // Run sync
    const result = await runSync();
    expect(result.data.mcpServers).toBe(1);

    // Verify only github is synced
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("github");
    expect(content.mcpServers).not.toHaveProperty("postgres");
    expect(Object.keys(content.mcpServers)).toHaveLength(1);
  });

  it("should exclude disabled MCPs via local config mcp_disabled", async () => {
    // Setup project config with both servers defined (= enabled)
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      `tools = ["cursor"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.postgres]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-postgres"]
`,
    );

    // Local config disables postgres
    await fs.outputFile(
      path.join(tempDir, "agentsync.local.toml"),
      'mcp_disabled = ["postgres"]\n',
    );

    // Run sync
    const result = await runSync();
    expect(result.data.mcpServers).toBe(1);

    // Verify postgres is excluded
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    const content = await fs.readJsonValidated(cursorMcpFile, mcpConfigSchema);

    expect(content.mcpServers).toHaveProperty("github");
    expect(content.mcpServers).not.toHaveProperty("postgres");
    expect(Object.keys(content.mcpServers)).toHaveLength(1);
  });

  it("should sync empty config when no MCPs are defined", async () => {
    // Setup project config with empty mcp (no servers defined = none active)
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    // Run sync
    const result = await runSync();
    expect(result.data.mcpServers).toBe(0);

    // No MCP file is written when there are no active servers.
    const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");
    expect(await fs.pathExists(cursorMcpFile)).toBe(false);
  });

  it("should sync URL-based MCP servers", async () => {
    // Setup project config with URL-based server (defined = enabled)
    await fs.ensureDir(path.join(".agents"));
    await fs.outputFile(
      path.join(".agents", "agentsync.toml"),
      `tools = ["cursor"]

[mcp.remote-api]
url = "https://api.example.com/mcp"

[mcp.remote-api.headers]
Authorization = "Bearer secret-token"
`,
    );

    // Run sync
    const result = await runSync();
    expect(result.data.mcpServers).toBe(1);

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
