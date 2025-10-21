/**
 * E2E Error Scenarios Tests
 *
 * Tests error handling and edge cases that were previously covered by manual tests:
 * - Invalid MCP names
 * - Missing environment variables
 * - Permission errors
 * - Spaces in paths
 * - No target directories
 * - Invalid JSON
 *
 * These tests replace manual-tests/04-scenario-error-handling.md
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { addMCP } from "../../src/commands/mcp/add.js";
import { removeMCP } from "../../src/commands/mcp/remove.js";
import { syncMCP } from "../../src/commands/mcp/sync.js";
import { listMCP } from "../../src/commands/mcp/list.js";
import * as fs from "../../src/utils/fs.js";
import * as path from "path";
import * as os from "os";
import { mkdtemp, chmod } from "node:fs/promises";

describe("MCP Error Scenarios E2E", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  /**
   * Helper to write JSON files
   */
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(filePath, JSON.stringify(data, null, 2) + "\n", {
      encoding: "utf-8",
    });
  }

  beforeEach(async () => {
    // Setup temp directories
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-errors-"));
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

  it("should error when adding non-existent MCP", async () => {
    await expect(addMCP("nonexistent-mcp")).rejects.toThrow(
      /not found in global registry/
    );
  });

  it("should handle duplicate MCP addition gracefully", async () => {
    await addMCP("github");

    // Adding again should not error, just not add duplicate
    const result = await addMCP("github");
    expect(result.added).toBe(false);

    const config = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8")
    );
    expect(config.mcpServers).toEqual(["github"]); // No duplicate
  });

  it("should handle removing non-existent MCP gracefully", async () => {
    await addMCP("github");

    // Removing non-existent MCP should not throw, just return removed: false
    const result = await removeMCP("nonexistent");
    expect(result.removed).toBe(false);
  });

  it("should allow removing last MCP (empty config is valid)", async () => {
    await addMCP("github");

    // Removing last MCP should succeed
    const result = await removeMCP("github");
    expect(result.removed).toBe(true);

    // Config should have empty array
    const config = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8")
    );
    expect(config.mcpServers).toEqual([]);

    // Should still be able to add MCPs after
    await addMCP("postgres");
    const configAfter = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8")
    );
    expect(configAfter.mcpServers).toEqual(["postgres"]);
  });

  it("should error when syncing without environment variables", async () => {
    // Clear env vars
    delete process.env.GITHUB_TOKEN;

    await fs.ensureDir(".cursor");
    await addMCP("github");

    // Should error about missing GITHUB_TOKEN
    await expect(syncMCP()).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it("should error when no target directories exist", async () => {
    // Don't create .cursor or .claude directories
    await addMCP("github");
    process.env.GITHUB_TOKEN = "test_token";

    // Should error about missing targets
    await expect(syncMCP()).rejects.toThrow(/target/i);
  });

  it("should handle spaces in paths correctly", async () => {
    // Create directory with spaces
    const spacedDir = path.join(tempDir, "test dir with spaces");
    await fs.ensureDir(spacedDir);
    await fs.ensureDir(path.join(spacedDir, ".cursor"));
    process.chdir(spacedDir);

    process.env.GITHUB_TOKEN = "test_token";
    await addMCP("github");
    await syncMCP();

    // Should work without errors
    const cursorMcp = JSON.parse(
      await fs.readFile(path.join(spacedDir, ".cursor/mcp.json"), "utf-8")
    );
    expect(cursorMcp.mcpServers.github).toBeDefined();
  });

  it("should handle invalid JSON in project config gracefully", async () => {
    // Ensure .agentsync directory exists
    await fs.ensureDir(".agentsync");
    // Write invalid JSON
    await fs.writeFile(".agentsync/config.json", "{invalid json}");

    // Should error with helpful message (not crash)
    await expect(listMCP()).rejects.toThrow(/parse/i);
  });

  it("should auto-create empty config when missing", async () => {
    // Don't create .agentsync/config.json
    expect(await fs.pathExists(".agentsync/config.json")).toBe(false);

    // List should auto-create empty config
    const result = await listMCP();

    // Config should now exist with empty array
    expect(await fs.pathExists(".agentsync/config.json")).toBe(true);
    const config = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8")
    );
    expect(config.mcpServers).toEqual([]);

    // Should show all as inactive
    expect(result.active).toEqual([]);
    expect(result.inactive.length).toBeGreaterThan(0);
  });

  it("should error helpfully when global registry is empty", async () => {
    // Overwrite with empty registry
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await writeJson(path.join(agentsyncDir, "mcp.json"), {});

    // Should error with helpful message about empty registry
    await expect(listMCP()).rejects.toThrow(/empty|configuration/i);
  });

  // Skip permission tests on Windows (permissions work differently)
  if (process.platform !== "win32") {
    it("should handle permission errors gracefully", async () => {
      await fs.ensureDir(".cursor");
      // Make directory read-only
      await chmod(".cursor", 0o444);

      process.env.GITHUB_TOKEN = "test_token";
      await addMCP("github");

      // Should error with permission message
      await expect(syncMCP()).rejects.toThrow(/permission|EACCES/i);

      // Restore permissions for cleanup
      await chmod(".cursor", 0o755);
    });
  }
});
