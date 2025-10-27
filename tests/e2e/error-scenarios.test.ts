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

import { chmod, mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addMCP } from "../../src/commands/mcp/add.js";
import { listMCP } from "../../src/commands/mcp/list.js";
import { removeMCP } from "../../src/commands/mcp/remove.js";
import { sync as mainSync } from "../../src/commands/sync.js";
import * as fs from "../../src/utils/fs.js";

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
    await fs.outputFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
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

  // Removed: covered by BATS shell tests (invalid add, duplicate add, remove)

  it("should allow removing last MCP (empty config is valid)", async () => {
    await addMCP("github");

    // Removing last MCP should succeed
    const result = await removeMCP("github");
    expect(result.removed).toBe(true);

    // Config should have empty array
    const config = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8"),
    );
    expect(config.mcpServers).toEqual([]);

    // Should still be able to add MCPs after
    await addMCP("postgres");
    const configAfter = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8"),
    );
    expect(configAfter.mcpServers).toEqual(["postgres"]);
  });

  // Removed: covered by BATS shell tests (missing env vars)

  it("should succeed when no target directories exist (creates them)", async () => {
    // Don't create .cursor or .claude directories
    await addMCP("github");
    process.env.GITHUB_TOKEN = "test_token";

    // Provide tools via config
    await fs.ensureDir(path.join(".agentsync"));
    await writeJson(path.join(".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    });

    // Should succeed and create target files via converters (via main sync)
    await expect(mainSync()).resolves.toBeUndefined();

    const cursorExists = await fs.pathExists(".cursor/mcp.json");
    const claudeExists = await fs.pathExists(".claude/mcp.json");
    expect(cursorExists || claudeExists).toBe(true);
  });

  // Removed: covered by BATS shell tests (spaces in paths)

  // Removed: covered by BATS shell tests (invalid JSON)

  it("should auto-create empty config when missing", async () => {
    // Don't create .agentsync/config.json
    expect(await fs.pathExists(".agentsync/config.json")).toBe(false);

    // List should auto-create empty config
    const result = await listMCP();

    // Config should now exist with empty array
    expect(await fs.pathExists(".agentsync/config.json")).toBe(true);
    const config = JSON.parse(
      await fs.readFile(".agentsync/config.json", "utf-8"),
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

  // Removed: covered by BATS shell tests (permission errors on Unix)
});
