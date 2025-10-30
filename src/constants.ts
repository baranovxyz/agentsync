/**
 * Constants for AgentSync
 * These are the single source of truth for supported tools and other configuration
 */

/**
 * Supported AI coding tools
 * This is the canonical list - all types, schemas, and converters derive from this
 */
export const SUPPORTED_TOOLS = [
  "cursor",
  "claude",
  "cline",
  "roocode",
] as const;

/**
 * Tool name type derived from the supported tools constant
 */
export type ToolName = (typeof SUPPORTED_TOOLS)[number];
