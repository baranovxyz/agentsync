/**
 * MCP Disable Command
 * Disables MCP server by adding to mcpDisabled (typically in local config)
 * Overrides any mcpEnabled from global/project levels
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { ensureDir, pathExists } from "../../utils/fs.js";

/**
 * Disable result
 */
export interface DisableMCPResult {
  /** Whether MCP was disabled (false if already disabled) */
  disabled: boolean;
  /** MCP server name */
  serverName: string;
  /** Whether server was already disabled */
  alreadyDisabled: boolean;
}

/**
 * Disable MCP server by adding to mcpDisabled
 * Writes to local config by default (agentsync.local.json) for personal overrides
 * @param serverName - MCP server name to disable
 * @returns Disable result
 */
export async function disableMCP(
  serverName: string,
): Promise<DisableMCPResult> {
  // Prefer local config for personal overrides (in .agentsync directory)
  const agentsyncDir = path.join(process.cwd(), ".agentsync");
  const configPath = path.join(agentsyncDir, "agentsync.local.json");

  let config: Partial<AgentSyncConfig> = {};

  // Ensure .agentsync directory exists
  await ensureDir(agentsyncDir);

  // Load existing local config if it exists
  if (await pathExists(configPath)) {
    const content = await readFile(configPath, "utf-8");
    config = JSON.parse(content);
  }

  // Initialize mcpDisabled if needed
  if (!config.mcpDisabled) {
    config.mcpDisabled = [];
  }

  // Check if already disabled
  if (config.mcpDisabled.includes(serverName)) {
    return {
      disabled: false,
      serverName,
      alreadyDisabled: true,
    };
  }

  // Add to mcpDisabled
  config.mcpDisabled.push(serverName);

  // Save config
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  return {
    disabled: true,
    serverName,
    alreadyDisabled: false,
  };
}
