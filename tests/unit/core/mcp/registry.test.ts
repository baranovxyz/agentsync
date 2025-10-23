/**
 * Global MCP Registry Loader Tests
 * Loads ~/.agentsync/mcp.json
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadGlobalRegistry } from "../../../../src/core/mcp/registry.js";
import * as fs from "../../../../src/utils/fs.js";

describe("loadGlobalRegistry", () => {
  let tempHomeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    // Create temp home directory
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHomeDir;

    // On Windows, also set USERPROFILE (os.homedir() uses this on Windows)
    if (process.platform === "win32") {
      originalUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tempHomeDir;
    }
  });

  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;

    // Restore USERPROFILE on Windows
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    }

    // Cleanup temp directory
    await fs.remove(tempHomeDir);
  });

  it("loads global registry from ~/.agentsync/mcp.json", async () => {
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);

    const registry = {
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
    };

    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), registry);

    const result = await loadGlobalRegistry();

    expect(result).toEqual(registry);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.github).toBeDefined();
    expect(result.postgres).toBeDefined();
  });

  it("throws error if ~/.agentsync/mcp.json does not exist", async () => {
    await expect(loadGlobalRegistry()).rejects.toThrow(
      /Global MCP registry not found/,
    );
  });

  it("throws error if registry is not valid JSON", async () => {
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await fs.writeFile(path.join(agentsyncDir, "mcp.json"), "invalid json{");

    await expect(loadGlobalRegistry()).rejects.toThrow(
      /Failed to parse global MCP registry/,
    );
  });

  it("throws error if registry is empty object", async () => {
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);
    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), {});

    await expect(loadGlobalRegistry()).rejects.toThrow(
      /Global MCP registry is empty/,
    );
  });

  it("validates MCP structure (requires command and args)", async () => {
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);

    const invalidRegistry = {
      github: {
        // Missing command field
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), invalidRegistry);

    await expect(loadGlobalRegistry()).rejects.toThrow(
      /Invalid MCP configuration for 'github'/,
    );
  });

  it("allows MCPs without env section", async () => {
    const agentsyncDir = path.join(tempHomeDir, ".agentsync");
    await fs.ensureDir(agentsyncDir);

    const registry = {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      },
    };

    await fs.writeJson(path.join(agentsyncDir, "mcp.json"), registry);

    const result = await loadGlobalRegistry();

    expect(result.filesystem).toBeDefined();
    expect(result.filesystem.env).toBeUndefined();
  });

  it("supports custom registry path", async () => {
    const customPath = path.join(tempHomeDir, "custom-mcp.json");

    const registry = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    };

    await fs.writeJson(customPath, registry);

    const result = await loadGlobalRegistry(customPath);

    expect(result.github).toBeDefined();
  });

  it("provides helpful error message with path to create registry", async () => {
    try {
      await loadGlobalRegistry();
      expect.fail("Should have thrown error");
    } catch (error) {
      const errorMsg = (error as Error).message;
      expect(errorMsg).toContain("~/.agentsync/mcp.json");
      expect(errorMsg).toContain("create");
    }
  });
});
