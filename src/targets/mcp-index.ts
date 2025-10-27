/**
 * MCP Target Registry
 * Phase 1: Hardcoded list of available targets
 * Phase 2+: Load from plugins
 */

import { ClaudeTarget } from "./claude.js";
import { ClineTarget } from "./cline.js";
import { CursorTarget } from "./cursor.js";
import { RooCodeTarget } from "./roocode.js";
import type { MCPTarget } from "./mcp-base.js";

/**
 * All available MCP targets
 * Phase 1: Hardcoded list
 * Phase 2+: Load from plugins
 */
export const MCP_TARGETS: MCPTarget[] = [
  new CursorTarget(),
  new ClaudeTarget(),
  new ClineTarget(),
  new RooCodeTarget(),
];

/**
 * Get MCP target by name
 * @param name - Target name (e.g., "cursor", "claude")
 * @returns Target instance or undefined if not found
 */
export function getMCPTarget(name: string): MCPTarget | undefined {
  return MCP_TARGETS.find((t) => t.name === name);
}

/**
 * Auto-detect which MCP targets are available in current project
 * @returns Array of detected targets
 */
export async function detectMCPTargets(): Promise<MCPTarget[]> {
  const detected: MCPTarget[] = [];

  for (const target of MCP_TARGETS) {
    if (await target.detect()) {
      detected.push(target);
    }
  }

  return detected;
}
