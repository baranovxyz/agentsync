/**
 * Unified Tool Converter types
 */

import type { MCP } from "../../core/mcp/tokens.js";

export type ToolConverterName = "cursor" | "claude" | "cline" | "roocode";

export interface ToolConverter {
  name: ToolConverterName;
  syncAgents(cwd: string): Promise<void>;
  syncRules(rules: Map<string, string>, cwd: string): Promise<void>;
  syncCommands(commands: Map<string, string>, cwd: string): Promise<void>;
  syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void>;
}
