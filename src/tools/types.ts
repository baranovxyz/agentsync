/**
 * Tool Provider Interface
 * Defines where each AI coding tool expects its files and what it supports
 */

import type { ToolName } from "../constants.js";
import type { MCP } from "../core/mcp/tokens.js";

export interface ToolPaths {
  /** Directory for skills (SKILL.md format) relative to project root */
  skillsDir: string | null;
  /** Directory for commands (*.md) relative to project root */
  commandsDir: string | null;
  /** Directory for agents (*.md) relative to project root */
  agentsDir: string | null;
  /** Path to MCP config file relative to project root */
  mcpConfigPath: string | null;
  /** Path to docs file (AGENTS.md, CLAUDE.md, GEMINI.md) relative to project root */
  docsFile: string;
}

export interface ToolCapabilities {
  skills: boolean;
  commands: boolean;
  agents: boolean;
  mcpStdio: boolean;
  mcpHttp: boolean;
  nativeAgentsMd: boolean;
  nativeSkillsDiscovery: boolean;
}

export interface MCPFormat {
  /** Write MCP servers to the tool's config file */
  writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void>;
}

export interface DocsFormat {
  /** Write docs directive file for this tool */
  writeDocs(agentsMdPath: string, cwd: string): Promise<void>;
}

export interface ToolProvider {
  /** Tool identifier */
  name: ToolName;
  /** Human-readable display name */
  displayName: string;
  /** Get paths for this tool */
  paths: ToolPaths;
  /** Feature capability matrix */
  capabilities: ToolCapabilities;
  /** Whether this tool reads .agents/ directly (no copy needed for skills) */
  readsAgentsDir: boolean;
  /** File extension for agent files */
  agentFileExtension: string;
  /** MCP format handler (null if tool doesn't support MCP) */
  mcpFormat: MCPFormat | null;
  /** Docs format handler (null if tool reads AGENTS.md natively) */
  docsFormat: DocsFormat | null;
}
