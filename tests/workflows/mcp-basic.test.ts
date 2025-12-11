/**
 * MCP Basic Workflow Test
 * Tests the complete MCP workflow: enable → sync → list → disable
 * Using in-process CLI harness instead of spawn
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "../../src/utils/fs.js";
import { assertSuccess, runCli } from "../utils/workflow-harness.js";

describe("MCP Basic Workflow (In-Process)", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentsync-workflow-"),
    );
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));

    // Setup global registry
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
          DATABASE_URL: "{DATABASE_URL}",
        },
      },
    };

    const agentsyncDir = path.join(homeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);
  });

  afterEach(async () => {
    await fs.remove(projectDir);
    await fs.remove(homeDir);
  });

  it("should complete full MCP workflow: enable → sync → disable", async () => {
    // Create .cursor directory
    await fs.ensureDir(path.join(projectDir, ".cursor"));

    // Step 1: Setup MCP server definition and enable it
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor"],
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "{GITHUB_TOKEN}",
          },
        },
      },
    });

    let result = await runCli(["mcp", "enable", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify config was updated
    const config1 = (await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json"),
    )) as { mcpEnabled?: string[] };
    expect(config1.mcpEnabled).toContain("github");

    // Step 2: Sync MCP (via main sync)
    result = await runCli(["sync"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "ghp_test123" },
    });
    assertSuccess(result);

    // Verify sync created MCP config
    const cursorMcp = (await fs.readJson(
      path.join(projectDir, ".cursor", "mcp.json"),
    )) as { mcpServers: Record<string, { env: Record<string, string> }> };
    expect(cursorMcp.mcpServers.github).toBeDefined();
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe("ghp_test123");

    // Step 3: List MCPs
    result = await runCli(["mcp", "list"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Step 4: Disable MCP
    result = await runCli(["mcp", "disable", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);

    // Verify github is now in mcpDisabled
    const localConfig = (await fs.readJson(
      path.join(projectDir, ".agentsync", "agentsync.local.json"),
    )) as { mcpDisabled?: string[] };
    expect(localConfig.mcpDisabled).toContain("github");
  });

  it("should sync only to specified tool with --tool flag", async () => {
    // Create both target directories
    await fs.ensureDir(path.join(projectDir, ".cursor"));
    await fs.ensureDir(path.join(projectDir, ".claude"));

    // Setup MCP server definition and enable it
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "{GITHUB_TOKEN}",
          },
        },
      },
    });

    await runCli(["mcp", "enable", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Sync only to cursor
    const result = await runCli(["sync", "--tool", "cursor"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "ghp_test" },
    });
    assertSuccess(result);

    // Verify only cursor was synced
    const cursorExists = await fs.pathExists(
      path.join(projectDir, ".cursor", "mcp.json"),
    );
    const claudeExists = await fs.pathExists(
      path.join(projectDir, ".claude", "mcp.json"),
    );

    expect(cursorExists).toBe(true);
    expect(claudeExists).toBe(false);
  });

  it("should support dry-run mode", async () => {
    await fs.ensureDir(path.join(projectDir, ".cursor"));

    // Setup MCP server definition with mcpEnabled (without calling mcp enable)
    // This tests that sync --dry-run doesn't write files even when MCPs are enabled
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor"],
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "{GITHUB_TOKEN}",
          },
        },
      },
      mcpEnabled: ["github"],
    });

    // Dry run should not write files
    const result = await runCli(["sync", "--dry-run"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "ghp_test" },
    });
    assertSuccess(result);

    // Verify no MCP config was written
    const mcpExists = await fs.pathExists(
      path.join(projectDir, ".cursor", "mcp.json"),
    );
    expect(mcpExists).toBe(false);
  });

  it("should handle multiple MCPs", async () => {
    await fs.ensureDir(path.join(projectDir, ".cursor"));

    // Setup MCP server definitions
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor"],
      mcpServers: {
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
            DATABASE_URL: "{DATABASE_URL}",
          },
        },
      },
    });

    // Enable multiple MCPs
    await runCli(["mcp", "enable", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    await runCli(["mcp", "enable", "postgres"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Sync with both via main sync
    const result = await runCli(["sync"], {
      cwd: projectDir,
      env: {
        HOME: homeDir,
        GITHUB_TOKEN: "ghp_test",
        DATABASE_URL: "postgresql://localhost/db",
      },
    });
    assertSuccess(result);

    // Verify both MCPs are synced
    const cursorMcp = (await fs.readJson(
      path.join(projectDir, ".cursor", "mcp.json"),
    )) as { mcpServers: Record<string, { env: Record<string, string> }> };
    expect(cursorMcp.mcpServers.github).toBeDefined();
    expect(cursorMcp.mcpServers.postgres).toBeDefined();
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe("ghp_test");
    expect(cursorMcp.mcpServers.postgres.env.DATABASE_URL).toBe(
      "postgresql://localhost/db",
    );
  });
});
