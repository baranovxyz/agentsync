/**
 * MCP Enable Command
 * Enables MCP server by adding to mcpEnabled in project configuration
 * User must manually add MCP server definition to mcpServers first
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";

/**
 * Enable result
 */
export interface EnableMCPResult {
  /** Whether MCP was enabled (false if already enabled) */
  enabled: boolean;
  /** MCP server name */
  serverName: string;
  /** Whether server was already enabled */
  alreadyEnabled: boolean;
}

/**
 * Enable MCP server by adding to mcpEnabled
 * User must manually add MCP server definition to config.mcpServers first
 * @param serverName - MCP server name to enable
 * @returns Enable result
 */
export async function enableMCP(serverName: string): Promise<EnableMCPResult> {
  const configPath = path.join(process.cwd(), ".agentsync", "config.json");

  if (!(await pathExists(configPath))) {
    throw new Error(
      "Project config not found at .agentsync/config.json\n\n" +
        'Run "agentsync init" to initialize the project.',
    );
  }

  // Load config
  const content = await readFile(configPath, "utf-8");
  const config: AgentSyncConfig = JSON.parse(content);

  // Validate server exists in registry
  if (!(config.mcpServers && config.mcpServers[serverName])) {
    throw new Error(
      `MCP server '${serverName}' not found in config.mcpServers.\n\n` +
        `Add the server definition to .agentsync/config.json first:\n\n` +
        `  "mcpServers": {\n` +
        `    "${serverName}": {\n` +
        `      "command": "npx",\n` +
        `      "args": ["-y", "@modelcontextprotocol/server-${serverName}"],\n` +
        `      "env": {}\n` +
        `    }\n` +
        `  }`,
    );
  }

  // Initialize mcpEnabled if needed
  if (!config.mcpEnabled) {
    config.mcpEnabled = [];
  }

  // Check if already enabled
  if (config.mcpEnabled.includes(serverName)) {
    return {
      enabled: false,
      serverName,
      alreadyEnabled: true,
    };
  }

  // Add to mcpEnabled
  config.mcpEnabled.push(serverName);

  // Save config
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  return {
    enabled: true,
    serverName,
    alreadyEnabled: false,
  };
}
