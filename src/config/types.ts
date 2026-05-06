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
}
