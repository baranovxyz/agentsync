/**
 * MCP Add Command Tests
 * Tests adding MCP server to project config
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addMCP } from "../../../../src/commands/mcp/add.js";
import * as fs from "../../../../src/utils/fs.js";

describe("addMCP", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-add-"));
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
      },
      linear: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-linear"],
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

  it("adds MCP to existing array config", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await addMCP("postgres");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual(["github", "postgres"]);
  });

  it("does not add duplicate MCP", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github", "postgres"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await addMCP("github");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual(["github", "postgres"]); // No duplicate
  });

  it("creates .agentsync/config.json if it does not exist", async () => {
    await addMCP("github");

    const exists = await fs.pathExists(".agentsync/config.json");
    expect(exists).toBe(true);

    const config = await fs.readJson(".agentsync/config.json");
    expect(config.mcpServers).toEqual(["github"]);
    expect(config.version).toBe("1.0");
    expect(config.tools).toEqual(["cursor", "claude"]);
  });

  it("throws error if MCP not in global registry", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await expect(addMCP("nonexistent")).rejects.toThrow(
      /MCP server 'nonexistent' not found in global registry/,
    );
  });

  it("returns info about required environment variables", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["postgres"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    const result = await addMCP("github");

    expect(result.added).toBe(true);
    expect(result.requiredEnv).toContain("GITHUB_TOKEN");
  });

  it("handles object format config", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: {
        github: true,
      },
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await addMCP("postgres");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers.github).toBe(true);
    expect(updated.mcpServers.postgres).toBe(true);
  });

  it("writes to .agentsync/config.json instead of agentsync.local.json", async () => {
    // Create .agentsync directory
    await fs.ensureDir(".agentsync");

    // Create initial config
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await addMCP("postgres");

    // Should write to .agentsync/config.json
    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual(["github", "postgres"]);

    // Should NOT create agentsync.local.json
    const localExists = await fs.pathExists("agentsync.local.json");
    expect(localExists).toBe(false);
  });

  it("creates .agentsync/config.json if it does not exist", async () => {
    await addMCP("github");

    const exists = await fs.pathExists(".agentsync/config.json");
    expect(exists).toBe(true);

    const config = await fs.readJson(".agentsync/config.json");
    expect(config.mcpServers).toEqual(["github"]);
    expect(config.version).toBe("1.0");
    expect(config.tools).toEqual(["cursor", "claude"]);
  });
});
