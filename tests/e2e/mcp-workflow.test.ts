/**
 * E2E MCP Workflow Test
 * Tests the complete MCP workflow: setup → add → sync → list → remove
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { addMCP } from "../../src/commands/mcp/add.js";
import { removeMCP } from "../../src/commands/mcp/remove.js";
import { syncMCP } from "../../src/commands/mcp/sync.js";
import { listMCP } from "../../src/commands/mcp/list.js";
import * as fs from "../../src/utils/fs.js";
import * as path from "path";
import * as os from "os";

describe("MCP E2E Workflow", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  /**
   * Helper to write JSON files (replacement for fs.writeJson which doesn't exist in fs-extra v11)
   */
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(
      filePath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
  }

  beforeEach(async () => {
    // Setup temp directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-e2e-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHomeDir;

    // On Windows, also set USERPROFILE (os.homedir() uses this on Windows)
    if (process.platform === "win32") {
      originalUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tempHomeDir;
    }

    // Setup global registry with 3 MCPs
    const globalRegistry = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "{GITHUB_TOKEN}",
        },
      },
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: {
          POSTGRES_URL: "{DATABASE_URL}",
        },
      },
      linear: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-linear"],
        env: {
          LINEAR_API_KEY: "{LINEAR_API_KEY}",
        },
      },
    };

    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);

    // Setup environment variables
    process.env.GITHUB_TOKEN = "ghp_e2e_test_token";
    process.env.DATABASE_URL = "postgresql://localhost:5432/e2e_db";
    process.env.LINEAR_API_KEY = "lin_e2e_key";

    // Create target directories
    await fs.ensureDir(".cursor");
    await fs.ensureDir(".claude");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Restore USERPROFILE on Windows
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    }

    await fs.remove(tempDir);
    await fs.remove(tempHomeDir);
  });

  it("completes full workflow: add → sync → list → remove", async () => {
    // Step 1: Add first MCP
    const addResult1 = await addMCP("github");
    expect(addResult1.added).toBe(true);
    expect(addResult1.requiredEnv).toContain("GITHUB_TOKEN");

    // Verify config created
    const config1 = await fs.readJson(".agentsync/config.json");
    expect(config1.mcpServers).toEqual(["github"]);

    // Step 2: Add second MCP
    const addResult2 = await addMCP("postgres");
    expect(addResult2.added).toBe(true);

    // Verify config updated
    const config2 = await fs.readJson(".agentsync/config.json");
    expect(config2.mcpServers).toEqual(["github", "postgres"]);

    // Step 3: List MCPs
    const listResult1 = await listMCP();
    expect(listResult1.total).toBe(3);
    expect(listResult1.active).toEqual(["github", "postgres"]);
    expect(listResult1.inactive).toEqual(["linear"]);

    // Step 4: Sync to targets
    await syncMCP();

    // Verify Cursor synced
    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp.mcpServers.github).toBeDefined();
    expect(cursorMcp.mcpServers.postgres).toBeDefined();
    expect(cursorMcp.mcpServers.linear).toBeUndefined();
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe(
      "ghp_e2e_test_token"
    );

    // Verify Claude synced
    const claudeMcp = await fs.readJson(".claude/mcp.json");
    expect(claudeMcp.github).toBeDefined();
    expect(claudeMcp.postgres).toBeDefined();
    expect(claudeMcp.linear).toBeUndefined();
    expect(claudeMcp.postgres.env.POSTGRES_URL).toBe(
      "postgresql://localhost:5432/e2e_db"
    );

    // Step 5: Remove one MCP
    const removeResult = await removeMCP("github");
    expect(removeResult.removed).toBe(true);

    // Verify config updated
    const config3 = await fs.readJson(".agentsync/config.json");
    expect(config3.mcpServers).toEqual(["postgres"]);

    // Step 6: Sync again to update targets
    await syncMCP();

    // Verify github removed from targets
    const cursorMcp2 = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp2.mcpServers.github).toBeUndefined();
    expect(cursorMcp2.mcpServers.postgres).toBeDefined();

    // Step 7: List MCPs again
    const listResult2 = await listMCP();
    expect(listResult2.active).toEqual(["postgres"]);
    expect(listResult2.inactive).toEqual(["github", "linear"]);
  });

  it("handles adding duplicate MCP gracefully", async () => {
    await addMCP("github");

    const result = await addMCP("github");
    expect(result.added).toBe(false);

    const config = await fs.readJson(".agentsync/config.json");
    expect(config.mcpServers).toEqual(["github"]); // No duplicate
  });

  it("syncs only to specified target with --tool flag", async () => {
    await addMCP("github");

    // Sync only to cursor
    await syncMCP({ tool: "cursor" });

    // Verify cursor synced
    const cursorExists = await fs.pathExists(".cursor/mcp.json");
    expect(cursorExists).toBe(true);

    // Verify claude NOT synced
    const claudeExists = await fs.pathExists(".claude/mcp.json");
    expect(claudeExists).toBe(false);
  });

  it("supports dry-run mode", async () => {
    await addMCP("github");

    // Dry run should not write files
    await syncMCP({ dryRun: true });

    const cursorExists = await fs.pathExists(".cursor/mcp.json");
    expect(cursorExists).toBe(false);
  });

  it("loads environment from .env file", async () => {
    // Clear process.env.GITHUB_TOKEN so .env takes effect
    delete process.env.GITHUB_TOKEN;

    // Create .env file
    await fs.writeFile(".env", "GITHUB_TOKEN=ghp_from_env_file\n");

    await addMCP("github");
    await syncMCP();

    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe(
      "ghp_from_env_file"
    );
  });
});
