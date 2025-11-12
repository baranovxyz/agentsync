/**
 * MCP Disable Command
 * Disables MCP server:
 * - Without --tool: adds to mcpDisabled in local config (managed mode)
 * - With --tool: removes from tool config directly (ephemeral mode)
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { getConvertersForTools } from "../../targets/tools/index.js";
import type { ToolConverterName } from "../../targets/tools/types.js";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { ensureDir, pathExists } from "../../utils/fs.js";

export interface DisableMCPOptions {
  tool?: ToolConverterName;
}

export interface DisableMCPResult {
  disabled: boolean;
  serverName: string;
  mode: "managed" | "ephemeral";
  alreadyDisabled?: boolean;
}

/**
 * Disable MCP server
 * @param serverName - MCP server name to disable
 * @param options - Disable options
 * @returns Disable result
 */
export async function disableMCP(
  serverName: string,
  options: DisableMCPOptions = {},
): Promise<DisableMCPResult> {
  if (options.tool) {
    // Ephemeral mode: remove from tool config
    return disableMCPEphemeral(serverName, options.tool);
  } else {
    // Managed mode: add to mcpDisabled in local config
    return disableMCPManaged(serverName);
  }
}

/**
 * Managed mode: add to mcpDisabled in local config
 */
async function disableMCPManaged(
  serverName: string,
): Promise<DisableMCPResult> {
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
      mode: "managed",
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
    mode: "managed",
    alreadyDisabled: false,
  };
}

/**
 * Ephemeral mode: remove from tool config
 */
async function disableMCPEphemeral(
  serverName: string,
  tool: ToolConverterName,
): Promise<DisableMCPResult> {
  const cwd = process.cwd();
  const converters = getConvertersForTools([tool]);

  if (converters.length === 0) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  const codec = converters[0];
  await codec.disableMCP(serverName, cwd);

  return {
    disabled: true,
    serverName,
    mode: "ephemeral",
  };
}
