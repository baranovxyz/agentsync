/**
 * MCP Remove Command
 * Removes MCP server from tool config
 * Requires --tool flag to specify which tool
 * Optionally removes from registry with --from-registry flag
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { getConvertersForTools } from "../../targets/tools/index.js";
import type { ToolConverterName } from "../../targets/tools/types.js";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";

export interface RemoveMCPOptions {
  tool?: ToolConverterName;
  scope?: "global" | "project";
  fromRegistry?: boolean;
}

export interface RemoveMCPResult {
  removed: boolean;
  serverName: string;
  removedFromTool?: boolean;
  removedFromConfig?: boolean;
}

/**
 * Remove MCP server
 * @param serverName - MCP server name to remove
 * @param options - Remove options
 * @returns Remove result
 */
export async function removeMCP(
  serverName: string,
  options: RemoveMCPOptions = {},
): Promise<RemoveMCPResult> {
  const result: RemoveMCPResult = {
    removed: false,
    serverName,
  };

  const cwd = process.cwd();

  // Remove from tool config if --tool specified
  if (options.tool) {
    const converters = getConvertersForTools([options.tool]);
    if (converters.length === 0) {
      throw new Error(`Unknown tool: ${options.tool}`);
    }

    const codec = converters[0];
    await codec.removeMCP(serverName, cwd);
    result.removedFromTool = true;
  }

  // Remove from registry if --from-registry or --scope specified
  if (options.fromRegistry || options.scope) {
    const scope = options.scope || "project";
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    let configPath: string;
    if (scope === "global") {
      if (!homeDir) {
        throw new Error("Cannot determine home directory for global config");
      }
      configPath = path.join(homeDir, ".agentsync", "config.json");
    } else {
      configPath = path.join(cwd, ".agentsync", "config.json");
    }

    if (await pathExists(configPath)) {
      const content = await readFile(configPath, "utf-8");
      const config: AgentSyncConfig = JSON.parse(content);

      // Remove from mcpServers registry
      if (config.mcpServers && serverName in config.mcpServers) {
        delete config.mcpServers[serverName];
        result.removedFromConfig = true;
      }

      // Remove from mcpEnabled if present
      if (config.mcpEnabled && config.mcpEnabled.includes(serverName)) {
        config.mcpEnabled = config.mcpEnabled.filter((s) => s !== serverName);
      }

      // Save updated config
      await writeFile(
        configPath,
        `${JSON.stringify(config, null, 2)}\n`,
        "utf-8",
      );
    }
  }

  result.removed =
    result.removedFromTool || result.removedFromConfig || !!options.tool;
  return result;
}
