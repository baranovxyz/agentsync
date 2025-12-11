/**
 * Unified Tool Codec types
 * Supports bidirectional conversion: Tool format ↔ Canonical format
 */

import type { MCP } from "../../core/mcp/tokens.js";
import type {
  CanonicalCommand,
  CanonicalRule,
  ImportedCommand,
  ImportedRule,
  ToolDirectoryInfo,
} from "../../types/canonical.js";

export type ToolConverterName = "cursor" | "claude" | "cline" | "roocode";

// Backward compatibility alias
export type ToolConverter = ToolCodec;

/**
 * Bidirectional codec for tool-specific formats
 */
export interface ToolCodec {
  name: ToolConverterName;

  // OUTPUT: Canonical → Tool format
  syncAgentsMd(cwd: string): Promise<void>;
  syncRules(rules: Map<string, CanonicalRule>, cwd: string): Promise<void>;
  syncCommands(
    commands: Map<string, CanonicalCommand>,
    cwd: string,
  ): Promise<void>;
  syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void>;

  // MCP operations: Direct tool config manipulation (ephemeral mode)
  addMCP(
    name: string,
    config: MCP,
    cwd: string,
    force?: boolean,
  ): Promise<void>;
  disableMCP(name: string, cwd: string): Promise<void>;
  removeMCP(name: string, cwd: string): Promise<void>;

  // INPUT: Tool format → Canonical
  detect(basePath: string): Promise<ToolDirectoryInfo | null>;
  importRules(toolPath: string): Promise<Map<string, ImportedRule>>;
  importCommands(toolPath: string): Promise<Map<string, ImportedCommand>>;
  importMCP(toolPath: string): Promise<Record<string, MCP> | null>;
}
