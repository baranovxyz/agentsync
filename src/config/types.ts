/**
 * TOML Config Types
 * TOML config type definitions
 */

import type { ToolName } from "../constants.js";
import type {
  AgentSyncConfig,
  McpServerConfig as CanonicalMcpServerConfig,
  ProfileConfig,
} from "../types/schemas.js";

/** MCP server config shared with the canonical runtime schema. */
export type McpServerConfig = CanonicalMcpServerConfig;

/** Profile config in TOML ([profiles.<name>]) */
export type TomlProfileConfig = ProfileConfig;

/** A single [agents.<id>] block in a foreign (dallay/Rust agentsync) config */
export interface ForeignAgentConfig {
  /** Defaults to true when omitted, matching the foreign schema */
  enabled?: boolean;
}

/** Parsed current-format config, plus the isolated dallay/Rust foreign layout. */
export interface AgentSyncTomlConfig {
  /** Current format: flat tool list. Mutually exclusive with foreign selectors. */
  tools?: ToolName[];
  /**
   * Tool selection from the dallay/Rust config that shares this file path.
   * It is valid only when `tools` is absent.
   */
  default_agents?: string[];
  /**
   * Tool selection from `[agents.<id>]` in a dallay/Rust config. It is valid
   * only when `tools` is absent.
   */
  agents?: Record<string, ForeignAgentConfig>;
  /** Current format: flat source strings only. */
  extends?: string[];
  /** Current format: [mcp.*] server definitions (defined = enabled). */
  mcp?: Record<string, McpServerConfig>;
  profiles?: Record<string, TomlProfileConfig>;
  /** [[hooks.<Event>]] — keyed by canonical event name */
  hooks?: NonNullable<AgentSyncConfig["hooks"]>;
  /** [permissions] */
  permissions?: NonNullable<AgentSyncConfig["permissions"]>;
  /** [statusline] */
  statusline?: NonNullable<AgentSyncConfig["statusline"]>;
  /** [output_style] */
  output_style?: NonNullable<AgentSyncConfig["output_style"]>;
}
