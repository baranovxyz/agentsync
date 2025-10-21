/**
 * MCP Remove Command
 * Removes MCP server from project configuration
 */

import { loadProjectConfig } from '../../core/mcp/config.js';
import { writeFile, mkdir } from 'node:fs/promises';
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
 * Allows removing all MCPs, resulting in empty mcpServers array/object
 * @param serverName - MCP server name to remove
 * @returns Remove result
 */
export async function removeMCP(serverName: string): Promise<RemoveMCPResult> {
  // 1. Load project config
  const projectConfig = await loadProjectConfig();
  const configPath = path.join(process.cwd(), '.agentsync', 'config.json');

  let removed = false;

  // 2. Remove from config (handle both array and object formats)
  if (Array.isArray(projectConfig.mcpServers)) {
    // Array format: ["github", "postgres"]
    const index = projectConfig.mcpServers.indexOf(serverName);

    if (index !== -1) {
      projectConfig.mcpServers.splice(index, 1);
      removed = true;
    }
  } else {
    // Object format: {github: true, postgres: {...}}
    if (projectConfig.mcpServers[serverName]) {
      delete projectConfig.mcpServers[serverName];
      removed = true;
    }
  }

  // 3. Save updated config
  if (removed) {
    // Ensure .agentsync directory exists
    await mkdir(path.join(process.cwd(), '.agentsync'), { recursive: true });
    await writeFile(configPath, JSON.stringify(projectConfig, null, 2) + '\n', 'utf-8');
  }

  return {
    removed,
    serverName,
  };
}
