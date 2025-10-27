/**
 * MCP Error Scenarios Workflow Tests
 * Tests error handling and edge cases using the workflow harness
 * Replaces tests/e2e/error-scenarios.test.ts
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, assertSuccess } from "../utils/workflow-harness.js";
import * as fs from "../../src/utils/fs.js";

describe("MCP Error Scenarios (Workflow)", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-err-"));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));

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

    const agentsyncDir = path.join(homeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);
  });

  afterEach(async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.DATABASE_URL;
    await fs.remove(projectDir);
    await fs.remove(homeDir);
  });

  it("should error when adding non-existent MCP", async () => {
    const result = await runCli(["mcp", "add", "nonexistent-mcp"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not found|unknown/i);
  });

  it("should handle duplicate MCP addition gracefully", async () => {
    // Add once
    let result = await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Add again - should still succeed
    result = await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify no duplicate
    const config = await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json")
    );
    const count = config.mcpServers.filter(
      (s: string) => s === "github"
    ).length;
    expect(count).toBe(1);
  });

  it("should handle removing non-existent MCP gracefully", async () => {
    // Add one
    await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Remove non-existent - should succeed (no-op)
    const result = await runCli(["mcp", "remove", "nonexistent"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify github still there
    const config = await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json")
    );
    expect(config.mcpServers).toContain("github");
  });

  it("should allow removing last MCP", async () => {
    // Add MCP
    await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Remove it
    const result = await runCli(["mcp", "remove", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify empty
    const config = await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json")
    );
    expect(config.mcpServers).toEqual([]);

    // Should be able to add again
    const result2 = await runCli(["mcp", "add", "postgres"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result2);

    const config2 = await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json")
    );
    expect(config2.mcpServers).toContain("postgres");
  });

  it("should error when syncing without environment variables", async () => {
    // Setup
    await fs.ensureDir(path.join(projectDir, ".cursor"));
    await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Sync without GITHUB_TOKEN
    const result = await runCli(["mcp", "sync"], {
      cwd: projectDir,
      env: { HOME: homeDir }, // No GITHUB_TOKEN
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/GITHUB_TOKEN|environment/i);
  });

  it("should error when no target directories exist", async () => {
    // Add MCP but don't create .cursor or .claude
    await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Sync without targets
    const result = await runCli(["mcp", "sync"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "test" },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/target|directory/i);
  });

  it("should handle spaces in paths correctly", async () => {
    // Create directory with spaces
    const spacedDir = path.join(projectDir, "test dir with spaces");
    await fs.ensureDir(path.join(spacedDir, ".cursor"));

    // Add and sync in spaced directory
    let result = await runCli(["mcp", "add", "github"], {
      cwd: spacedDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    result = await runCli(["mcp", "sync"], {
      cwd: spacedDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "test" },
    });
    assertSuccess(result);

    // Verify sync worked
    const cursorMcp = await fs.readJson(
      path.join(spacedDir, ".cursor", "mcp.json")
    );
    expect(cursorMcp.mcpServers.github).toBeDefined();
  });

  it("should handle invalid JSON in project config gracefully", async () => {
    // Write invalid JSON
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeFile(
      path.join(projectDir, ".agentsync", "config.json"),
      "{invalid json}"
    );

    // List should fail with parse error
    const result = await runCli(["mcp", "list"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/parse|JSON|invalid/i);
  });

  it("should auto-create empty config when missing", async () => {
    // List without config
    const result = await runCli(["mcp", "list"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify config was created
    const configExists = await fs.pathExists(
      path.join(projectDir, ".agentsync", "config.json")
    );
    expect(configExists).toBe(true);

    // Verify it's empty
    const config = await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json")
    );
    expect(config.mcpServers).toEqual([]);
  });

  it("should error helpfully when global registry is empty", async () => {
    // Overwrite registry with empty object
    await fs.writeJson(path.join(homeDir, ".agentsync", "mcp.json"), {});

    // List should error
    const result = await runCli(["mcp", "list"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/empty|registry|configuration/i);
  });
});
