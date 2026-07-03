/**
 * TOML Config Types
 * TOML config type definitions
 */

/** MCP server config */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Profile config in TOML ([profiles.<name>]) */
export interface TomlProfileConfig {
  tools?: string[];
  skills_dirs?: string[];
  paths?: string[];
  env?: string;
}

/** AgentSync extension block ([agentsync] in TOML) */
export interface AgentSyncExtension {
  profile?: string;
  presets?: Array<{
    source: string;
    namespace: string;
    include?: string[];
    exclude?: string[];
  }>;
}

/** Hook spec under [[hooks.<Event>]] */
export interface TomlHookSpec {
  id: string;
  matcher?: string;
  command: string;
  timeout?: number;
  description?: string;
}

/** [permissions] block */
export interface TomlPermissions {
  default?: "allow" | "ask" | "deny";
  rules?: Array<{
    id: string;
    tool: string;
    pattern?: string;
    decision: "allow" | "ask" | "deny";
  }>;
}

/** [statusline] block */
export interface TomlStatusline {
  items?: string[];
  custom_items?: Array<{ id: string; label?: string; command: string }>;
}

/** [output_style] block */
export interface TomlOutputStyle {
  tone?: "terse" | "pragmatic" | "explanatory" | "friendly" | "none";
  custom?: Array<{ name: string; file: string }>;
}

/** Full TOML config structure with AgentSync extensions */
export interface AgentSyncTomlConfig {
  /** v1 format: flat tool list */
  tools?: string[];
  /** v1 format: flat extends list */
  extends?: string[];
  /** v1 format: [mcp.*] server definitions (defined = enabled) */
  mcp?: Record<string, McpServerConfig>;
  /** Legacy format: [mcp_servers.*] blocks */
  mcp_servers?: Record<string, McpServerConfig>;
  agentsync?: AgentSyncExtension;
  profiles?: Record<string, TomlProfileConfig>;
  /** [[hooks.<Event>]] — keyed by canonical event name */
  hooks?: Record<string, TomlHookSpec[]>;
  /** [permissions] */
  permissions?: TomlPermissions;
  /** [statusline] */
  statusline?: TomlStatusline;
  /** [output_style] */
  output_style?: TomlOutputStyle;
}
