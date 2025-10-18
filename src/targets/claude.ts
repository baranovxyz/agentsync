/**
 * Claude Code Target Implementation
 * Syncs MCP configurations to Claude Code
 */

import type { MCPTarget } from './mcp-base.js';
import type { MCP } from '../core/mcp/tokens.js';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Claude Code MCP target
 * Writes to .claude/mcp.json with direct object (no wrapper)
 */
export class ClaudeTarget implements MCPTarget {
  name = 'claude';

  async detect(): Promise<boolean> {
    return fs.pathExists('.claude');
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const claudeDir = '.claude';
    const mcpFile = path.join(claudeDir, 'mcp.json');

    // Ensure directory exists
    await fs.ensureDir(claudeDir);

    // Claude Code expects direct MCP object (no wrapper)
    await fs.writeJson(mcpFile, mcps, { spaces: 2 });
  }
}
