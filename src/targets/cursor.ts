/**
 * Cursor Target Implementation
 * Syncs MCP configurations to Cursor IDE
 */

import type { MCPTarget } from './mcp-base.js';
import type { MCP } from '../core/mcp/tokens.js';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Cursor MCP target
 * Writes to .cursor/mcp.json with {"mcpServers": {...}} wrapper
 */
export class CursorTarget implements MCPTarget {
  name = 'cursor';

  async detect(): Promise<boolean> {
    return fs.pathExists('.cursor');
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const cursorDir = '.cursor';
    const mcpFile = path.join(cursorDir, 'mcp.json');

    // Ensure directory exists
    await fs.ensureDir(cursorDir);

    // Cursor expects: {"mcpServers": {...}}
    const config = {
      mcpServers: mcps,
    };

    // Write MCP configuration with 2-space indentation
    await fs.writeJson(mcpFile, config, { spaces: 2 });
  }
}
