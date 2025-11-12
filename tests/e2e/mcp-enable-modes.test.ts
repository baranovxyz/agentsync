/**
 * E2E MCP Enable Command Tests
 *
 * Tests all three modes of the mcp enable command:
 * - Ephemeral: inline config → sync to tool only
 * - Persistent: inline config → save to config → sync to tool
 * - Registry: lookup in config → sync to tool
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnableMCPOptions } from "../../src/commands/mcp/enable.js";
import { enableMCP } from "../../src/commands/mcp/enable.js";
import * as fs from "../../src/utils/fs.js";

describe("MCP Enable Command E2E", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Setup temp directory as project root
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-mcp-enable-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create .agentsync directory
    await fs.ensureDir(path.join(tempDir, ".agentsync"));
  });

  afterEach(async () => {
    // Restore original working directory
    process.chdir(originalCwd);
    // Cleanup
    await fs.remove(tempDir);
  });

  interface MCPServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }

  interface ToolConfig {
    mcpServers?: Record<string, MCPServerConfig>;
  }

  interface ProjectConfig {
    version?: string;
    tools?: string[];
    mcpServers?: Record<string, MCPServerConfig>;
    mcpEnabled?: string[];
  }

  async function readToolConfig(tool: string): Promise<ToolConfig | null> {
    const configPath = path.join(
      tempDir,
      tool === "claude" ? ".mcp.json" : `.${tool}/mcp.json`,
    );

    if (!(await fs.pathExists(configPath))) {
      return null;
    }

    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  }

  async function readProjectConfig(): Promise<ProjectConfig | null> {
    const configPath = path.join(tempDir, ".agentsync", "config.json");

    if (!(await fs.pathExists(configPath))) {
      return null;
    }

    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  }

  describe("ephemeral mode", () => {
    it("syncs inline JSON config to tool without saving to config", async () => {
      const options: EnableMCPOptions = {
        tool: "claude",
        json: '{"command":"npx","args":["-y","@org/tracker"],"env":{"API_KEY":"secret"}}',
      };

      const result = await enableMCP("tracker", options);

      // Should return ephemeral mode
      expect(result.mode).toBe("ephemeral");
      expect(result.enabled).toBe(true);
      expect(result.syncedToTools).toContain("claude");

      // Should sync to tool config
      const toolConfig = await readToolConfig("claude");
      expect(toolConfig).toBeDefined();
      expect(toolConfig?.mcpServers?.tracker).toBeDefined();
      expect(toolConfig?.mcpServers?.tracker?.command).toBe("npx");

      // Should NOT save to agentsync config
      const projectConfig = await readProjectConfig();
      expect(projectConfig).toBeNull();
    });

    it("syncs transport stdio config to tool", async () => {
      const options: EnableMCPOptions = {
        tool: "claude",
        transport: "stdio",
        command: "node",
        args: ["./server.js"],
        env: { DEBUG: "true" },
      };

      const result = await enableMCP("myserver", options);

      expect(result.mode).toBe("ephemeral");
      expect(result.enabled).toBe(true);

      const toolConfig = await readToolConfig("claude");
      expect(toolConfig?.mcpServers?.myserver?.command).toBe("node");
      expect(toolConfig?.mcpServers?.myserver?.args).toEqual(["./server.js"]);
      expect(toolConfig?.mcpServers?.myserver?.env?.DEBUG).toBe("true");
    });

    it("syncs transport http config to tool", async () => {
      const options: EnableMCPOptions = {
        tool: "claude",
        transport: "http",
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer token" },
      };

      const result = await enableMCP("api", options);

      expect(result.mode).toBe("ephemeral");

      const toolConfig = await readToolConfig("claude");
      expect(toolConfig?.mcpServers?.api?.url).toBe(
        "https://api.example.com/mcp",
      );
      expect(toolConfig?.mcpServers?.api?.headers?.Authorization).toBe(
        "Bearer token",
      );
    });

    it("throws error if --tool not specified", async () => {
      const options: EnableMCPOptions = {
        json: '{"command":"npx","args":["server"]}',
      };

      await expect(enableMCP("tracker", options)).rejects.toThrow(
        /Ephemeral mode requires --tool/,
      );
    });
  });

  describe("persistent mode", () => {
    it("saves JSON config to project scope and syncs", async () => {
      const options: EnableMCPOptions = {
        json: '{"command":"npx","args":["-y","@org/tracker"]}',
        scope: "project",
      };

      const result = await enableMCP("tracker", options);

      expect(result.mode).toBe("persistent");
      expect(result.enabled).toBe(true);
      expect(result.savedToConfig).toBe(true);

      // Should save to project config
      const projectConfig = await readProjectConfig();
      expect(projectConfig?.mcpServers?.tracker).toBeDefined();
      expect(projectConfig?.mcpServers?.tracker?.command).toBe("npx");
      expect(projectConfig?.mcpEnabled).toContain("tracker");

      // Should sync to tools in config (defaults to claude)
      const toolConfig = await readToolConfig("claude");
      expect(toolConfig?.mcpServers?.tracker).toBeDefined();
    });

    it("saves with force flag overwrites existing", async () => {
      // Create initial project config
      await fs.outputFile(
        path.join(tempDir, ".agentsync", "config.json"),
        `${JSON.stringify(
          {
            version: "1.0",
            tools: ["claude"],
            mcpServers: {
              tracker: { command: "old", args: ["old"] },
            },
            mcpEnabled: ["tracker"],
          },
          null,
          2,
        )}\n`,
      );

      const options: EnableMCPOptions = {
        json: '{"command":"new","args":["new"]}',
        scope: "project",
        force: true,
      };

      const result = await enableMCP("tracker", options);

      expect(result.enabled).toBe(true);

      const projectConfig = await readProjectConfig();
      expect(projectConfig?.mcpServers?.tracker?.command).toBe("new");
    });

    it("syncs to specified tool only when --tool provided", async () => {
      const options: EnableMCPOptions = {
        json: '{"command":"npx","args":["server"]}',
        scope: "project",
        tool: "claude",
      };

      const result = await enableMCP("tracker", options);

      expect(result.syncedToTools).toEqual(["claude"]);
    });

    it("creates global config if it does not exist", async () => {
      const options: EnableMCPOptions = {
        json: '{"command":"npx","args":["server"]}',
        scope: "global",
      };

      const homeDir = process.env.HOME;
      const globalConfigPath = path.join(homeDir!, ".agentsync", "config.json");

      // Ensure it doesn't exist
      if (await fs.pathExists(globalConfigPath)) {
        await fs.remove(globalConfigPath);
      }

      const result = await enableMCP("tracker", options);

      expect(result.enabled).toBe(true);
      expect(result.savedToConfig).toBe(true);

      // Should create global config
      const globalConfig = JSON.parse(
        await fs.readFile(globalConfigPath, "utf-8"),
      );
      expect(globalConfig.mcpServers.tracker).toBeDefined();

      // Cleanup
      await fs.remove(path.join(homeDir!, ".agentsync"));
    });
  });

  describe("registry mode", () => {
    it("looks up server in project config and syncs", async () => {
      // Create project config with MCP server definition
      await fs.outputFile(
        path.join(tempDir, ".agentsync", "config.json"),
        `${JSON.stringify(
          {
            version: "1.0",
            tools: ["claude"],
            mcpServers: {
              tracker: {
                command: "npx",
                args: ["-y", "@org/tracker"],
                env: { API_KEY: "secret" },
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await enableMCP("tracker", {});

      expect(result.mode).toBe("registry");
      expect(result.enabled).toBe(true);

      // Should add to mcpEnabled
      const projectConfig = await readProjectConfig();
      expect(projectConfig?.mcpEnabled).toContain("tracker");

      // Should sync to tool
      const toolConfig = await readToolConfig("claude");
      expect(toolConfig?.mcpServers?.tracker).toBeDefined();
    });

    it("syncs to specified tool only when --tool provided", async () => {
      // Create project config
      await fs.outputFile(
        path.join(tempDir, ".agentsync", "config.json"),
        `${JSON.stringify(
          {
            version: "1.0",
            tools: ["claude", "cursor"],
            mcpServers: {
              tracker: { command: "npx", args: ["server"] },
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await enableMCP("tracker", { tool: "claude" });

      expect(result.syncedToTools).toEqual(["claude"]);
    });

    it("throws error if server not in registry", async () => {
      // Create project config without tracker
      await fs.outputFile(
        path.join(tempDir, ".agentsync", "config.json"),
        `${JSON.stringify(
          {
            version: "1.0",
            tools: ["claude"],
            mcpServers: {
              github: { command: "npx", args: ["server"] },
            },
          },
          null,
          2,
        )}\n`,
      );

      await expect(enableMCP("tracker", {})).rejects.toThrow(
        /not found in config.mcpServers/,
      );
    });

    it("throws error if project config does not exist", async () => {
      await expect(enableMCP("tracker", {})).rejects.toThrow(
        /Project config not found/,
      );
    });

    it("handles already enabled server gracefully", async () => {
      // Create project config with tracker already enabled
      await fs.outputFile(
        path.join(tempDir, ".agentsync", "config.json"),
        `${JSON.stringify(
          {
            version: "1.0",
            tools: ["claude"],
            mcpServers: {
              tracker: { command: "npx", args: ["server"] },
            },
            mcpEnabled: ["tracker"],
          },
          null,
          2,
        )}\n`,
      );

      const result = await enableMCP("tracker", {});

      expect(result.enabled).toBe(true);
    });
  });

  describe("error handling", () => {
    it("throws error with helpful message for unknown tool", async () => {
      const options: EnableMCPOptions = {
        tool: "unknowntool" as unknown as Parameters<
          typeof enableMCP
        >[1]["tool"],
        json: '{"command":"npx","args":["server"]}',
      };

      await expect(enableMCP("tracker", options)).rejects.toThrow(
        /Unknown tool/,
      );
    });

    it("throws error for invalid JSON config", async () => {
      const options: EnableMCPOptions = {
        tool: "claude",
        json: "invalid json{",
      };

      await expect(enableMCP("tracker", options)).rejects.toThrow();
    });

    it("handles codec errors gracefully (e.g., Cline no MCP support)", async () => {
      const options: EnableMCPOptions = {
        tool: "cline",
        json: '{"command":"npx","args":["server"]}',
      };

      // Should throw because Cline doesn't support MCP
      await expect(enableMCP("tracker", options)).rejects.toThrow(
        /does not support MCP/,
      );
    });
  });
});
