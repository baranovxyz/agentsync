/**
 * Cursor Target Implementation
 * Syncs MCP configurations to Cursor IDE
 */

import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import type { MCPTarget } from "./mcp-base.js";

/**
 * Cursor MCP target
 * Writes to .cursor/mcp.json with {"mcpServers": {...}} wrapper
 */
export class CursorTarget implements MCPTarget {
  name = "cursor";

  async detect(): Promise<boolean> {
    return pathExists(".cursor");
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const cursorDir = ".cursor";
    const mcpFile = path.join(cursorDir, "mcp.json");

    // Ensure directory exists
    await ensureDir(cursorDir);

    // Cursor expects: {"mcpServers": {...}}
    const config = {
      mcpServers: mcps,
    };

    // Write MCP configuration with 2-space indentation
    await writeFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }
}
