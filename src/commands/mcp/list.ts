/**
 * MCP List Command
 * Lists available vs active MCP servers
 */

import { loadGlobalRegistry } from '../../core/mcp/registry.js';
import { loadProjectConfig } from '../../core/mcp/config.js';

/**
 * List options
 */
export interface ListMCPOptions {
  /** Ignore project config and show all as inactive */
  ignoreProjectConfig?: boolean;
}

/**
 * MCP list result
 */
export interface ListMCPResult {
  /** Total number of MCPs in global registry */
  total: number;
  /** Active MCP names */
  active: string[];
  /** Inactive MCP names */
  inactive: string[];
  /** MCP details with active status */
  mcps: Record<
    string,
    {
      active: boolean;
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

/**
 * List available and active MCP servers
 * @param options - List options
 * @returns List result with active/inactive MCPs
 */
export async function listMCP(options: ListMCPOptions = {}): Promise<ListMCPResult> {
  // 1. Load global registry
  const globalRegistry = await loadGlobalRegistry();

  // 2. Determine active MCPs
  let activeMCPs: string[] = [];

  if (!options.ignoreProjectConfig) {
    try {
      const projectConfig = await loadProjectConfig();

      // Extract active MCP names
      if (Array.isArray(projectConfig.mcpServers)) {
        activeMCPs = projectConfig.mcpServers;
      } else {
        activeMCPs = Object.keys(projectConfig.mcpServers);
      }
    } catch (error) {
      // If no project config, treat all as inactive
      if ((error as Error).message.includes('MCP configuration not found')) {
        // Continue with empty activeMCPs
      } else {
        throw error;
      }
    }
  }

  // 3. Build result
  const result: ListMCPResult = {
    total: Object.keys(globalRegistry).length,
    active: activeMCPs,
    inactive: [],
    mcps: {},
  };

  // 4. Populate MCP details
  for (const [name, mcp] of Object.entries(globalRegistry)) {
    const isActive = activeMCPs.includes(name);

    result.mcps[name] = {
      active: isActive,
      command: mcp.command,
      args: mcp.args,
      env: mcp.env,
    };

    if (!isActive) {
      result.inactive.push(name);
    }
  }

  return result;
}
