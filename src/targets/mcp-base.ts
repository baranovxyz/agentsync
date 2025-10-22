/**
 * MCP Target Base Interface
 * Defines interface for syncing MCP configurations to AI coding tools
 */

import type { MCP } from "../core/mcp/tokens.js";

/**
 * MCPTarget represents an AI coding tool that can receive MCP configurations
 */
export interface MCPTarget {
  /** Target name (e.g., "cursor", "claude") */
  name: string;

  /**
   * Detect if this tool is configured in the current project
   * @returns true if tool directory exists (.cursor/, .claude/, etc.)
   */
  detect(): Promise<boolean>;

  /**
   * Sync MCP configuration to this tool
   * @param mcps - Filtered and token-substituted MCP configs
   */
  syncMCP(mcps: Record<string, MCP>): Promise<void>;
}
