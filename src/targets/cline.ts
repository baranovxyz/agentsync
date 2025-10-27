/**
 * Cline Target Implementation
 * Syncs MCP configurations to Cline
 */

import { writeFile } from "node:fs/promises";
import type { MCP } from "../core/mcp/tokens.js";
import { pathExists } from "../utils/fs.js";
import type { MCPTarget } from "./mcp-base.js";

/**
 * Cline MCP target
 * Writes to cline_mcp_settings.json (root) with {"mcpServers": {...}} wrapper
 */
export class ClineTarget implements MCPTarget {
  name = "cline";

  async detect(): Promise<boolean> {
    return pathExists(".clinerules");
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const mcpFile = "cline_mcp_settings.json";

    // Cline expects: {"mcpServers": {...}} in root
    const config = {
      mcpServers: mcps,
    };

    // Write MCP configuration with 2-space indentation
    await writeFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }
}
