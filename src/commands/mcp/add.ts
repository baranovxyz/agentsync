/**
 * MCP Add Command
 * Adds MCP server to project configuration
 */

import { loadGlobalRegistry } from '../../core/mcp/registry.js';
import { loadProjectConfig } from '../../core/mcp/config.js';
import * as fs from 'fs-extra';
import * as path from 'path';

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
 * Add MCP server to project configuration
 * @param serverName - MCP server name to add
 * @returns Add result with required env vars
 */
export async function addMCP(serverName: string): Promise<AddMCPResult> {
  // 1. Load global registry to validate server exists
  const globalRegistry = await loadGlobalRegistry();

  if (!globalRegistry[serverName]) {
    const available = Object.keys(globalRegistry).join(', ');
    throw new Error(
      `MCP server '${serverName}' not found in global registry.\n\n` +
        `Available MCPs: ${available}`
    );
  }

  // 2. Extract required env vars
  const requiredEnv: string[] = [];
  if (globalRegistry[serverName].env) {
    for (const value of Object.values(globalRegistry[serverName].env!)) {
      const matches = value.matchAll(/\{([A-Z_][A-Z0-9_]*)\}/g);
      for (const match of matches) {
        if (!requiredEnv.includes(match[1])) {
          requiredEnv.push(match[1]);
        }
      }
    }
  }

  // 3. Load or create project config
  const configPath = path.join(process.cwd(), '.agentsync.json');
  let projectConfig;

  try {
    projectConfig = await loadProjectConfig();
  } catch (error) {
    // If config doesn't exist, create it
    if ((error as Error).message.includes('Project configuration not found')) {
      projectConfig = {
        mcpServers: [serverName],
      };

      await fs.writeJson(configPath, projectConfig, { spaces: 2 });

      return {
        added: true,
        serverName,
        requiredEnv,
      };
    }
    throw error;
  }

  // 4. Add to config (handle both array and object formats)
  let added = false;

  if (Array.isArray(projectConfig.mcpServers)) {
    // Array format: ["github", "postgres"]
    if (!projectConfig.mcpServers.includes(serverName)) {
      projectConfig.mcpServers.push(serverName);
      added = true;
    }
  } else {
    // Object format: {github: true, postgres: {...}}
    if (!projectConfig.mcpServers[serverName]) {
      projectConfig.mcpServers[serverName] = true;
      added = true;
    }
  }

  // 5. Save updated config
  if (added) {
    await fs.writeJson(configPath, projectConfig, { spaces: 2 });
  }

  return {
    added,
    serverName,
    requiredEnv,
  };
}
