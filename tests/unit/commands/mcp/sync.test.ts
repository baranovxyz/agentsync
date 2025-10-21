/**
 * MCP Sync Command Tests
 * Tests the main sync workflow: load → filter → substitute → validate → sync
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { syncMCP } from "../../../../src/commands/mcp/sync.js";
import * as fs from "../../../../src/utils/fs.js";
import * as path from "path";
import * as os from "os";

describe("syncMCP", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    // Create temp project directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-sync-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create temp home directory
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHomeDir;

    // On Windows, also set USERPROFILE (os.homedir() uses this on Windows)
    if (process.platform === "win32") {
      originalUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tempHomeDir;
    }

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
    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), globalRegistry);
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

  it("syncs selected MCPs to Cursor target", async () => {
    // Setup project config
    const projectConfig = {
      mcpServers: ["github", "postgres"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    // Setup environment variables
    process.env.GITHUB_TOKEN = "ghp_test123";
    process.env.DATABASE_URL = "postgresql://localhost/db";

    // Create .cursor directory to enable detection
    await fs.ensureDir(".cursor");

    // Run sync
    await syncMCP();

    // Verify .cursor/mcp.json was created
    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp).toHaveProperty("mcpServers");
    expect(cursorMcp.mcpServers.github).toBeDefined();
    expect(cursorMcp.mcpServers.postgres).toBeDefined();
    expect(cursorMcp.mcpServers.linear).toBeUndefined(); // Not selected

    // Verify tokens were substituted
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe("ghp_test123");
    expect(cursorMcp.mcpServers.postgres.env.POSTGRES_URL).toBe(
      "postgresql://localhost/db"
    );
  });

  it("syncs selected MCPs to Claude target", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test456";

    // Create .claude directory
    await fs.ensureDir(".claude");

    await syncMCP();

    // Verify .claude/mcp.json was created (no wrapper)
    const claudeMcp = await fs.readJson(".claude/mcp.json");
    expect(claudeMcp).not.toHaveProperty("mcpServers"); // Claude has no wrapper
    expect(claudeMcp.github).toBeDefined();
    expect(claudeMcp.github.env.GITHUB_TOKEN).toBe("ghp_test456");
  });

  it("syncs to both Cursor and Claude if both directories exist", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test789";

    await fs.ensureDir(".cursor");
    await fs.ensureDir(".claude");

    await syncMCP();

    // Verify both were synced
    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    const claudeMcp = await fs.readJson(".claude/mcp.json");

    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe("ghp_test789");
    expect(claudeMcp.github.env.GITHUB_TOKEN).toBe("ghp_test789");
  });

  it("throws error if agentsync.local.json not found", async () => {
    await expect(syncMCP()).rejects.toThrow(/MCP configuration not found/);
  });

  it("throws error if global registry not found", async () => {
    // Remove global registry
    await fs.remove(path.join(tempHomeDir, ".agentsync", "mcp.json"));

    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    await expect(syncMCP()).rejects.toThrow(/Global MCP registry not found/);
  });

  it("throws error if required environment variable is missing", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    // Don't set GITHUB_TOKEN
    delete process.env.GITHUB_TOKEN;

    await fs.ensureDir(".cursor");

    await expect(syncMCP()).rejects.toThrow(
      /Missing environment variable: GITHUB_TOKEN/
    );
  });

  it("warns if no targets detected", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test";

    // Don't create .cursor or .claude directories

    await expect(syncMCP()).rejects.toThrow(/No MCP targets detected/);
  });

  it("supports selective sync with --tool option", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test";

    await fs.ensureDir(".cursor");
    await fs.ensureDir(".claude");

    // Sync only to cursor
    await syncMCP({ tool: "cursor" });

    // Verify only cursor was synced
    const cursorExists = await fs.pathExists(".cursor/mcp.json");
    const claudeExists = await fs.pathExists(".claude/mcp.json");

    expect(cursorExists).toBe(true);
    expect(claudeExists).toBe(false);
  });

  it("supports dry-run mode (no files written)", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test";

    await fs.ensureDir(".cursor");

    // Dry run should not throw but not write files
    await syncMCP({ dryRun: true });

    const mcpExists = await fs.pathExists(".cursor/mcp.json");
    expect(mcpExists).toBe(false);
  });

  it("applies config overrides correctly", async () => {
    const projectConfig = {
      mcpServers: {
        github: true, // Use global
        postgres: {
          env: {
            POSTGRES_URL: "postgresql://localhost/custom_db",
          },
        },
      },
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.DATABASE_URL = "postgresql://localhost/default"; // Should be overridden

    await fs.ensureDir(".cursor");

    await syncMCP();

    const cursorMcp = await fs.readJson(".cursor/mcp.json");

    // github uses global (with substitution from env)
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe("ghp_test");

    // postgres uses override (literal value, no substitution)
    expect(cursorMcp.mcpServers.postgres.env.POSTGRES_URL).toBe(
      "postgresql://localhost/custom_db"
    );
  });

  it("loads environment from .env file if present", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    // Clear process.env.GITHUB_TOKEN so .env takes effect
    delete process.env.GITHUB_TOKEN;

    // Create .env file
    await fs.writeFile(".env", "GITHUB_TOKEN=ghp_from_env_file\n");

    await fs.ensureDir(".cursor");

    await syncMCP();

    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp.mcpServers.github.env.GITHUB_TOKEN).toBe(
      "ghp_from_env_file"
    );
  });

  it("syncs empty config (empty array) to tools", async () => {
    const projectConfig = {
      mcpServers: [],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    await fs.ensureDir(".cursor");
    await fs.ensureDir(".claude");

    await syncMCP();

    // Verify empty configs were written to tools
    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp.mcpServers).toEqual({});

    const claudeMcp = await fs.readJson(".claude/mcp.json");
    expect(claudeMcp).toEqual({});
  });

  it("syncs empty config (empty object) to tools", async () => {
    const projectConfig = {
      mcpServers: {},
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    await fs.ensureDir(".cursor");

    await syncMCP();

    // Verify empty config was written
    const cursorMcp = await fs.readJson(".cursor/mcp.json");
    expect(cursorMcp.mcpServers).toEqual({});
  });
});
