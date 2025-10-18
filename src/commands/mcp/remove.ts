/**
 * MCP Remove Command
 * Removes MCP server from project configuration
 */

import { loadProjectConfig } from '../../core/mcp/config.js';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Remove result
 */
export interface RemoveMCPResult {
  /** Whether MCP was removed (false if not present) */
  removed: boolean;
  /** MCP server name */
  serverName: string;
}

/**
 * Remove MCP server from project configuration
 * @param serverName - MCP server name to remove
 * @returns Remove result
 */
export async function removeMCP(serverName: string): Promise<RemoveMCPResult> {
  // 1. Load project config
  const projectConfig = await loadProjectConfig();
  const configPath = path.join(process.cwd(), '.agentsync.json');

  let removed = false;

  // 2. Remove from config (handle both array and object formats)
  if (Array.isArray(projectConfig.mcpServers)) {
    // Array format: ["github", "postgres"]
    const index = projectConfig.mcpServers.indexOf(serverName);

    if (index !== -1) {
      // Check if this is the last MCP
      if (projectConfig.mcpServers.length === 1) {
        throw new Error(
          `Cannot remove last MCP server. Project must have at least one MCP configured.`
        );
      }

      projectConfig.mcpServers.splice(index, 1);
      removed = true;
    }
  } else {
    // Object format: {github: true, postgres: {...}}
    if (projectConfig.mcpServers[serverName]) {
      // Check if this is the last MCP
      if (Object.keys(projectConfig.mcpServers).length === 1) {
        throw new Error(
          `Cannot remove last MCP server. Project must have at least one MCP configured.`
        );
      }

      delete projectConfig.mcpServers[serverName];
      removed = true;
    }
  }

  // 3. Save updated config
  if (removed) {
    await fs.writeJson(configPath, projectConfig, { spaces: 2 });
  }

  return {
    removed,
    serverName,
  };
}
