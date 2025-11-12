/**
 * MCP Tool Config Manager Tests
 * Tests reading, writing, and merging MCP tool configs
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMCPToToolConfig,
  disableMCPInToolConfig,
  loadMCPToolConfig,
  removeMCPFromToolConfig,
  saveMCPToolConfig,
} from "../../../../src/core/mcp/tool-config.js";
import * as fs from "../../../../src/utils/fs.js";

describe("MCP Tool Config Manager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-tool-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("loadMCPToolConfig", () => {
    it("loads existing tool config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config = {
        mcpServers: {
          github: { command: "npx", args: ["@server/github"] },
        },
      };

      await fs.writeJson(configPath, config);

      const result = await loadMCPToolConfig(configPath);

      expect(result).toEqual(config);
    });

    it("returns null if file does not exist", async () => {
      const configPath = path.join(tempDir, "nonexistent.json");

      const result = await loadMCPToolConfig(configPath);

      expect(result).toBeNull();
    });

    it("returns null if file is invalid JSON", async () => {
      const configPath = path.join(tempDir, "invalid.json");
      await fs.writeFile(configPath, "invalid json{");

      const result = await loadMCPToolConfig(configPath);

      expect(result).toBeNull();
    });

    it("returns null if mcpServers field is missing", async () => {
      const configPath = path.join(tempDir, "no-servers.json");
      await fs.writeJson(configPath, { foo: "bar" });

      const result = await loadMCPToolConfig(configPath);

      expect(result).toBeNull();
    });
  });

  describe("saveMCPToolConfig", () => {
    it("writes tool config to file", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config = {
        mcpServers: {
          tracker: { command: "node", args: ["./server.js"] },
        },
      };

      await saveMCPToolConfig(configPath, config);

      const content = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(config);
    });

    it("overwrites existing file", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config1 = { mcpServers: { old: { command: "old" } } };
      const config2 = { mcpServers: { new: { command: "new" } } };

      await saveMCPToolConfig(configPath, config1);
      await saveMCPToolConfig(configPath, config2);

      const result = await loadMCPToolConfig(configPath);

      expect(result).toEqual(config2);
      expect(result?.mcpServers.old).toBeUndefined();
    });

    it("formats JSON with proper indentation", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config = {
        mcpServers: {
          github: { command: "npx", args: ["server"] },
        },
      };

      await saveMCPToolConfig(configPath, config);

      const content = await fs.readFile(configPath, "utf-8");

      expect(content).toContain("  ");
      expect(content).toContain("github");
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("addMCPToToolConfig", () => {
    it("adds new MCP server to empty config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const mcpConfig = { command: "npx", args: ["-y", "@org/tracker"] };

      await addMCPToToolConfig(configPath, "tracker", mcpConfig);

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.tracker).toEqual(mcpConfig);
    });

    it("adds MCP server to existing servers", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const github = { command: "npx", args: ["@server/github"] };
      const tracker = { command: "npx", args: ["-y", "@org/tracker"] };

      await addMCPToToolConfig(configPath, "github", github);
      await addMCPToToolConfig(configPath, "tracker", tracker);

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.github).toEqual(github);
      expect(result?.mcpServers.tracker).toEqual(tracker);
    });

    it("throws error if server exists and force=false", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config1 = { command: "npx", args: ["old"] };
      const config2 = { command: "npx", args: ["new"] };

      await addMCPToToolConfig(configPath, "tracker", config1);

      await expect(
        addMCPToToolConfig(configPath, "tracker", config2, false),
      ).rejects.toThrow(/already exists/);
    });

    it("overwrites server if force=true", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const config1 = { command: "npx", args: ["old"] };
      const config2 = { command: "npx", args: ["new"] };

      await addMCPToToolConfig(configPath, "tracker", config1);
      await addMCPToToolConfig(configPath, "tracker", config2, true);

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.tracker).toEqual(config2);
    });

    it("creates tool config if it does not exist", async () => {
      const configPath = path.join(tempDir, "new-mcp.json");
      const mcpConfig = { url: "https://api.example.com/mcp" };

      expect(await fs.pathExists(configPath)).toBe(false);

      await addMCPToToolConfig(configPath, "api", mcpConfig);

      expect(await fs.pathExists(configPath)).toBe(true);
      const result = await loadMCPToolConfig(configPath);
      expect(result?.mcpServers.api).toEqual(mcpConfig);
    });
  });

  describe("disableMCPInToolConfig", () => {
    it("removes MCP server from config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const github = { command: "npx", args: ["@server/github"] };
      const tracker = { command: "npx", args: ["@server/tracker"] };

      await addMCPToToolConfig(configPath, "github", github);
      await addMCPToToolConfig(configPath, "tracker", tracker);

      await disableMCPInToolConfig(configPath, "github");

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.github).toBeUndefined();
      expect(result?.mcpServers.tracker).toBeDefined();
    });

    it("does nothing if config does not exist", async () => {
      const configPath = path.join(tempDir, "nonexistent.json");

      // Should not throw
      await expect(
        disableMCPInToolConfig(configPath, "tracker"),
      ).resolves.not.toThrow();
    });

    it("does nothing if server is not in config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const github = { command: "npx", args: ["@server/github"] };

      await addMCPToToolConfig(configPath, "github", github);
      await disableMCPInToolConfig(configPath, "nonexistent");

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.github).toBeDefined();
      expect(result?.mcpServers.nonexistent).toBeUndefined();
    });

    it("preserves other servers when disabling one", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const servers = {
        github: { command: "npx", args: ["@server/github"] },
        postgres: { command: "docker", args: ["exec", "postgres"] },
        tracker: { url: "https://api.example.com" },
      };

      for (const [name, config] of Object.entries(servers)) {
        await addMCPToToolConfig(configPath, name, config);
      }

      await disableMCPInToolConfig(configPath, "postgres");

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.github).toEqual(servers.github);
      expect(result?.mcpServers.postgres).toBeUndefined();
      expect(result?.mcpServers.tracker).toEqual(servers.tracker);
    });
  });

  describe("removeMCPFromToolConfig", () => {
    it("is an alias for disableMCPInToolConfig", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const tracker = { command: "npx", args: ["@server/tracker"] };

      await addMCPToToolConfig(configPath, "tracker", tracker);
      await removeMCPFromToolConfig(configPath, "tracker");

      const result = await loadMCPToolConfig(configPath);

      expect(result?.mcpServers.tracker).toBeUndefined();
    });
  });
});
