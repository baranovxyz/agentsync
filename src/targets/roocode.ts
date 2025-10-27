/**
 * RooCode Target Implementation
 * Syncs MCP configurations to RooCode
 */

import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import type { MCPTarget } from "./mcp-base.js";

/**
 * RooCode MCP target
 * Writes to .roo/mcp.json with {"mcpServers": {...}} wrapper
 */
export class RooCodeTarget implements MCPTarget {
  name = "roocode";

  async detect(): Promise<boolean> {
    return pathExists(".roo");
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const rooDir = ".roo";
    const mcpFile = path.join(rooDir, "mcp.json");

    // Ensure directory exists
    await ensureDir(rooDir);

    // RooCode expects: {"mcpServers": {...}} wrapper (like Cursor)
    const config = {
      mcpServers: mcps,
    };

    // Write MCP configuration with 2-space indentation
    await writeFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }
}
