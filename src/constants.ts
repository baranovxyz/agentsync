/**
 * Constants for AgentSync
 * These are the single source of truth for supported tools and other configuration
 */

/**
 * Supported AI coding tools
 * This is the canonical list - all types, schemas, and converters derive from this
 */
export const SUPPORTED_TOOLS = [
  "claude",
  "opencode",
  "cursor",
  "roocode",
  "codex",
  "copilot",
  "cline",
  "gemini",
  "amp",
  "goose",
  "aider",
  "amazonq",
  "augment",
  "kiro",
  "openhands",
  "junie",
  "crush",
  "kilocode",
  "qwen",
] as const;

/**
 * Tool name type derived from the supported tools constant
 */
export type ToolName = (typeof SUPPORTED_TOOLS)[number];

/**
 * Tools treated as maintainer-validated beta targets.
 */
export const VALIDATED_CLI_TOOLS = [
  "claude",
  "opencode",
  "codex",
  "gemini",
  "amp",
  "goose",
  "aider",
  "amazonq",
  "augment",
  "kiro",
  "openhands",
  "junie",
  "crush",
  "kilocode",
  "qwen",
] as const satisfies readonly ToolName[];

/**
 * Supported adapters outside the maintainer-validated beta target set.
 * These remain available when users explicitly configure them.
 */
export const OPTIONAL_ADAPTER_TOOLS = SUPPORTED_TOOLS.filter(
  (tool) => !(VALIDATED_CLI_TOOLS as readonly ToolName[]).includes(tool),
);

/**
 * Default init tools for the v1 beta.
 * Keep this compact and limited to maintainer-validated tools.
 */
export const DEFAULT_TOOLS = [
  "claude",
  "opencode",
  "codex",
] as const satisfies readonly (typeof VALIDATED_CLI_TOOLS)[number][];

/**
 * Type guard for ToolName — use instead of `as ToolName` casts.
 */
export function isToolName(name: string): name is ToolName {
  return (SUPPORTED_TOOLS as readonly string[]).includes(name);
}

/**
 * Type guard for maintainer-validated tools.
 */
export function isValidatedCliTool(
  name: ToolName,
): name is (typeof VALIDATED_CLI_TOOLS)[number] {
  return (VALIDATED_CLI_TOOLS as readonly ToolName[]).includes(name);
}
