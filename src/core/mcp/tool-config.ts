/**
 * MCP Tool Config Manager
 * Handles adding, disabling, and removing MCP servers from tool-specific configs
 */

import { readFile } from "node:fs/promises";
import { outputFile, pathExists } from "../../utils/fs.js";
import type { MCP } from "./tokens.js";

export interface MCPToolConfig {
  mcpServers: Record<string, MCP>;
}

/**
 * Load existing MCP config from tool config file
 * @param configPath - Path to mcp.json
 * @returns Parsed config or null if file doesn't exist
 */
export async function loadMCPToolConfig(
  configPath: string,
): Promise<MCPToolConfig | null> {
  if (!(await pathExists(configPath))) {
    return null;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);

    // Validate structure
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("mcpServers" in parsed)
    ) {
      return null;
    }

    return parsed as MCPToolConfig;
  } catch {
    return null;
  }
}

/**
 * Save MCP config to tool config file
 * @param configPath - Path to mcp.json
 * @param config - MCP configuration to write
 */
export async function saveMCPToolConfig(
  configPath: string,
  config: MCPToolConfig,
): Promise<void> {
  await outputFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf-8",
  });
}

/**
 * Add or update MCP server in tool config
 * @param configPath - Path to mcp.json
 * @param name - Server name
 * @param config - MCP configuration
 * @param force - If true, overwrite existing; if false, merge
 */
export async function addMCPToToolConfig(
  configPath: string,
  name: string,
  config: MCP,
  force: boolean = false,
): Promise<void> {
  // Load existing config or create new
  let toolConfig = await loadMCPToolConfig(configPath);
  if (!toolConfig) {
    toolConfig = { mcpServers: {} };
  }

  // Check if server already exists
  if (toolConfig.mcpServers[name] && !force) {
    throw new Error(
      `MCP server '${name}' already exists in tool config. Use --force to overwrite.`,
    );
  }

  // Add or overwrite server
  toolConfig.mcpServers[name] = config;

  // Save back
  await saveMCPToolConfig(configPath, toolConfig);
}

/**
 * Disable (remove) MCP server from tool config
 * @param configPath - Path to mcp.json
 * @param name - Server name to remove
 */
export async function disableMCPInToolConfig(
  configPath: string,
  name: string,
): Promise<void> {
  const toolConfig = await loadMCPToolConfig(configPath);
  if (!toolConfig) {
    return; // Nothing to disable
  }

  // Remove server
  delete toolConfig.mcpServers[name];

  // Save back
  await saveMCPToolConfig(configPath, toolConfig);
}

/**
 * Remove MCP server from tool config (alias for disable)
 * @param configPath - Path to mcp.json
 * @param name - Server name to remove
 */
export async function removeMCPFromToolConfig(
  configPath: string,
  name: string,
): Promise<void> {
  return disableMCPInToolConfig(configPath, name);
}
