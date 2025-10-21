/**
 * MCP List Command Tests
 * Tests listing available vs active MCPs
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listMCP } from "../../../../src/commands/mcp/list.js";
import * as fs from "../../../../src/utils/fs.js";
import * as path from "path";
import * as os from "os";

describe("listMCP", () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-list-"));
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

  it("returns list of all MCPs with active status", async () => {
    const projectConfig = {
      mcpServers: ["github", "postgres"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    const result = await listMCP();

    expect(result.total).toBe(3);
    expect(result.active).toHaveLength(2);
    expect(result.inactive).toHaveLength(1);

    expect(result.active).toContain("github");
    expect(result.active).toContain("postgres");
    expect(result.inactive).toContain("linear");
  });

  it("includes MCP details in result", async () => {
    const projectConfig = {
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", projectConfig);

    const result = await listMCP();

    expect(result.mcps.github).toBeDefined();
    expect(result.mcps.github.active).toBe(true);
    expect(result.mcps.github.command).toBe("npx");

    expect(result.mcps.postgres).toBeDefined();
    expect(result.mcps.postgres.active).toBe(false);
  });

  it("handles no active MCPs", async () => {
    // Don't create project config - should fail gracefully or show all as inactive
    const result = await listMCP({ ignoreProjectConfig: true });

    expect(result.active).toHaveLength(0);
    expect(result.inactive).toHaveLength(3);
  });

  it("works without project config when flag is set", async () => {
    // No agentsync.local.json created

    const result = await listMCP({ ignoreProjectConfig: true });

    expect(result.total).toBe(3);
    expect(result.active).toHaveLength(0);
    expect(result.inactive).toHaveLength(3);
  });

  it("throws error if global registry not found", async () => {
    await fs.remove(path.join(tempHomeDir, ".agentsync", "mcp.json"));

    await expect(listMCP({ ignoreProjectConfig: true })).rejects.toThrow(
      /Global MCP registry not found/
    );
  });
});
