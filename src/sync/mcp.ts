/**
 * MCP Sync Module
 * Generates tool-specific MCP configuration files
 */

import type { MCP } from "../core/mcp/tokens.js";
import type { ToolProvider } from "../tools/types.js";

/** Result of syncing MCP servers to a single tool */
export interface MCPSyncResult {
  tool: string;
  serverCount: number;
  servers: string[];
}

/**
 * Sync MCP servers to all configured tools
 */
export async function syncMCP(
  providers: ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
): Promise<MCPSyncResult[]> {
  const results: MCPSyncResult[] = [];
  const servers = Object.keys(mcps);

  for (const provider of providers) {
    if (!provider.mcpFormat) {
      results.push({ tool: provider.name, serverCount: 0, servers: [] });
      continue;
    }

    await provider.mcpFormat.writeMCP(mcps, cwd);
    results.push({
      tool: provider.name,
      serverCount: servers.length,
      servers,
    });
  }

  return results;
}
