/**
 * Claude Code Target Integration Tests
 * Tests Claude Code MCP target implementation
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { ClaudeTarget } from "../../../src/targets/claude.js";
import * as fs from "../../../src/utils/fs.js";

describe("ClaudeTarget", () => {
  let tempDir: string;
  let originalCwd: string;
  let target: ClaudeTarget;

  /**
   * Cleanup helper with retry logic for Windows file locking issues
   */
  async function cleanupTestEnvironment(): Promise<void> {
    try {
      // Restore working directory first
      if (originalCwd && process.cwd() !== originalCwd) {
        process.chdir(originalCwd);
      }

      // Remove temp directory with retry logic
      const cleanup = async (dir: string, retries = 3): Promise<void> => {
        for (let i = 0; i < retries; i++) {
          try {
            if (await fs.pathExists(dir)) {
              await fs.remove(dir);
              return;
            }
          } catch (error) {
            if (i === retries - 1) {
              console.error(`Failed to cleanup ${dir}:`, error);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      };

      if (tempDir) {
        await cleanup(tempDir);
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }

  beforeEach(async () => {
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-claude-"));
      originalCwd = process.cwd();
      process.chdir(tempDir);
      target = new ClaudeTarget();
    } catch (error) {
      await cleanupTestEnvironment();
      throw error;
    }
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  it('has name "claude"', () => {
    expect(target.name).toBe("claude");
  });

  it("detect() returns false when .claude directory does not exist", async () => {
    const detected = await target.detect();
    expect(detected).toBe(false);
  });

  it("detect() returns true when .claude directory exists", async () => {
    await fs.ensureDir(".claude");

    const detected = await target.detect();
    expect(detected).toBe(true);
  });

  it("syncMCP() creates .claude directory if not exists", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "ghp_test123",
        },
      },
    };

    await target.syncMCP(mcps);

    const dirExists = await fs.pathExists(".claude");
    expect(dirExists).toBe(true);
  });

  it("syncMCP() writes mcp.json WITHOUT mcpServers wrapper", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "ghp_test123",
        },
      },
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: {
          POSTGRES_URL: "postgresql://localhost/db",
        },
      },
    };

    await target.syncMCP(mcps);

    const mcpPath = path.join(".claude", "mcp.json");
    const content = await fs.readJson(mcpPath);

    // Claude Code expects direct object, no wrapper
    expect(content).not.toHaveProperty("mcpServers");
    expect(content.github).toBeDefined();
    expect(content.postgres).toBeDefined();
    expect(content).toEqual(mcps);
  });

  it("syncMCP() formats JSON with 2-space indentation", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await target.syncMCP(mcps);

    const mcpPath = path.join(".claude", "mcp.json");
    const content = await fs.readFile(mcpPath, "utf-8");

    // Check for 2-space indentation
    expect(content).toContain('  "github"');
    expect(content).toContain('    "command"');
  });

  it("syncMCP() overwrites existing mcp.json", async () => {
    await fs.ensureDir(".claude");
    await fs.writeJson(path.join(".claude", "mcp.json"), { old: "data" });

    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await target.syncMCP(mcps);

    const content = await fs.readJson(path.join(".claude", "mcp.json"));
    expect(content).not.toHaveProperty("old");
    expect(content.github).toBeDefined();
  });

  it("syncMCP() handles empty MCPs", async () => {
    const mcps: Record<string, MCP> = {};

    await target.syncMCP(mcps);

    const content = await fs.readJson(path.join(".claude", "mcp.json"));
    expect(content).toEqual({});
  });
});
