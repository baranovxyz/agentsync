/**
 * Claude Code Target Implementation
 * Syncs MCP configurations to Claude Code
 */

import type { MCPTarget } from './mcp-base.js';
import type { MCP } from '../core/mcp/tokens.js';
import { writeFile } from 'node:fs/promises';
import { pathExists, ensureDir } from 'fs-extra';
import * as path from 'path';

/**
 * Claude Code MCP target
 * Writes to .claude/mcp.json with direct object (no wrapper)
 */
export class ClaudeTarget implements MCPTarget {
  name = 'claude';

  async detect(): Promise<boolean> {
    return pathExists('.claude');
  }

  async syncMCP(mcps: Record<string, MCP>): Promise<void> {
    const claudeDir = '.claude';
    const mcpFile = path.join(claudeDir, 'mcp.json');

    // Ensure directory exists
    await ensureDir(claudeDir);

    // Claude Code expects direct MCP object (no wrapper)
    await writeFile(mcpFile, JSON.stringify(mcps, null, 2) + '\n', 'utf-8');
  }
}
