/**
 * MCP Error Scenarios Workflow Tests
 * Tests error handling and edge cases using the workflow harness
 * Replaces tests/e2e/error-scenarios.test.ts
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "../../src/utils/fs.js";
import { assertSuccess, runCli } from "../utils/workflow-harness.js";

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
    process.env.GITHUB_TOKEN = undefined;
    process.env.DATABASE_URL = undefined;
    await fs.remove(projectDir);
    await fs.remove(homeDir);
  });

  it("should error when enabling non-existent MCP", async () => {
    // First need to create config with mcpServers so enable command can check
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      mcpServers: {},
    });

    const result = await runCli(["mcp", "enable", "nonexistent-mcp"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not found|unknown/i);
  });

  it("should sync when tools configured in config (no pre-existing dirs)", async () => {
    // Setup MCP server definition and enable it
    await fs.ensureDir(path.join(projectDir, ".agentsync"));
    await fs.writeJson(path.join(projectDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
        },
      },
    });

    await runCli(["mcp", "enable", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    // Sync without pre-creating .cursor or .claude
    const result = await runCli(["sync"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "test" },
    });

    expect(result.exitCode).toBe(0);
  });

  it("should handle spaces in paths correctly", async () => {
    // Create directory with spaces
    const spacedDir = path.join(projectDir, "test dir with spaces");
    await fs.ensureDir(path.join(spacedDir, ".cursor"));

    // Setup MCP server definition and enable in spaced directory
    await fs.ensureDir(path.join(spacedDir, ".agentsync"));
    await fs.writeJson(path.join(spacedDir, ".agentsync", "config.json"), {
      version: "1.0",
      tools: ["cursor"],
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
        },
      },
    });

    let result = await runCli(["mcp", "enable", "github"], {
      cwd: spacedDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);
    result = await runCli(["sync"], {
      cwd: spacedDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "test" },
    });
    assertSuccess(result);

    // Verify sync worked
    const cursorMcp = (await fs.readJson(
      path.join(spacedDir, ".cursor", "mcp.json"),
    )) as { mcpServers: Record<string, unknown> };
    expect(cursorMcp.mcpServers.github).toBeDefined();
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
      path.join(projectDir, ".agentsync", "config.json"),
    );
    expect(configExists).toBe(true);

    // Verify it has empty/default structure
    const config = (await fs.readJson(
      path.join(projectDir, ".agentsync", "config.json"),
    )) as { mcpEnabled?: string[] };
    expect(config.mcpEnabled || []).toEqual([]);
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
