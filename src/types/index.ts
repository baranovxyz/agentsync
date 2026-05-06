/**
 * Core type definitions for AgentSync
 */

// Import and re-export constants (single source of truth for supported tools)
import type { ToolName as ToolNameType } from "../constants.js";

export { SUPPORTED_TOOLS } from "../constants.js";
export type ToolName = ToolNameType;

// Re-export canonical format types
export * from "./canonical";
// Re-export preset types
export * from "./preset";
// Re-export schema types (covers all type and function exports from schemas.ts)
export * from "./schemas";

// CLI options types
export interface InitOptions {
  template?: string;
  tools?: ToolName[];
  force?: boolean;
  json?: boolean;
  pretty?: boolean;
}
