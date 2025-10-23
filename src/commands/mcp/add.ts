/**
 * MCP Add Command
 * Adds MCP server to project configuration
 */

import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectMCPConfig } from "../../core/mcp/config.js";
import { loadProjectConfig } from "../../core/mcp/config.js";
import { loadGlobalRegistry } from "../../core/mcp/registry.js";
import type { AgentSyncConfig, McpServer } from "../../types/schemas.js";

/**
 * Add result
 */
export interface AddMCPResult {
  /** Whether MCP was added (false if already present) */
  added: boolean;
  /** MCP server name */
  serverName: string;
  /** Required environment variables (if any) */
  requiredEnv: string[];
}

/**
 * Extract required environment variables from MCP server configuration
 */
function extractRequiredEnvVars(mcpServer: McpServer): string[] {
  const requiredEnv: string[] = [];
  if (mcpServer.env) {
    for (const value of Object.values(mcpServer.env)) {
      const matches = value.matchAll(/\{([A-Z_][A-Z0-9_]*)\}/g);
      for (const match of matches) {
        if (!requiredEnv.includes(match[1])) {
          requiredEnv.push(match[1]);
        }
      }
    }
  }
  return requiredEnv;
}

/**
 * Create new configuration file
 */
async function createNewConfig(
  serverName: string,
  configPath: string,
): Promise<AgentSyncConfig> {
  await mkdir(path.join(process.cwd(), ".agentsync"), { recursive: true });

  const projectConfig: AgentSyncConfig = {
    version: "1.0",
    tools: ["cursor", "claude"],
    useSymlinks: true,
    mcpServers: [serverName],
  };

  await writeFile(
    configPath,
    `${JSON.stringify(projectConfig, null, 2)}\n`,
    "utf-8",
  );

  return projectConfig;
}

/**
 * Add MCP server to existing configuration
 */
function addMcpToConfig(
  projectConfig: AgentSyncConfig,
  serverName: string,
): boolean {
  if (Array.isArray(projectConfig.mcpServers)) {
    if (!projectConfig.mcpServers.includes(serverName)) {
      projectConfig.mcpServers.push(serverName);
      return true;
    }
  } else if (projectConfig.mcpServers) {
    if (!projectConfig.mcpServers[serverName]) {
      projectConfig.mcpServers[serverName] = true;
      return true;
    }
  }
  return false;
}

/**
 * Add MCP server to project configuration
 * @param serverName - MCP server name to add
 * @returns Add result with required env vars
 */
export async function addMCP(serverName: string): Promise<AddMCPResult> {
  // 1. Load global registry to validate server exists
  const globalRegistry = await loadGlobalRegistry();

  if (!globalRegistry[serverName]) {
    const available = Object.keys(globalRegistry).join(", ");
    throw new Error(
      `MCP server '${serverName}' not found in global registry.\n\n` +
        `Available MCPs: ${available}`,
    );
  }

  // 2. Extract required env vars
  const requiredEnv = extractRequiredEnvVars({
    name: serverName,
    ...globalRegistry[serverName],
  });

  // 3. Load or create project config
  const configPath = path.join(process.cwd(), ".agentsync", "config.json");
  let projectConfig: AgentSyncConfig | ProjectMCPConfig;

  try {
    projectConfig = await loadProjectConfig();
  } catch (error) {
    // If config doesn't exist, create it
    if ((error as Error).message.includes("MCP configuration not found")) {
      projectConfig = await createNewConfig(serverName, configPath);
      return {
        added: true,
        serverName,
        requiredEnv,
      };
    }
    throw error;
  }

  // 4. Add to config
  const added = addMcpToConfig(projectConfig as AgentSyncConfig, serverName);

  // 5. Save updated config
  if (added) {
    await mkdir(path.join(process.cwd(), ".agentsync"), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify(projectConfig as AgentSyncConfig, null, 2)}\n`,
      "utf-8",
    );
  }

  return {
    added,
    serverName,
    requiredEnv,
  };
}
