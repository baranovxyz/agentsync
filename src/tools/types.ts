/**
 * Tool Provider Interface
 * Defines where each AI coding tool expects its files and what it supports
 */

import type { z } from "zod";
import type { ToolName } from "../constants.js";
import type { MCP } from "../core/mcp/tokens.js";
import type {
  HookSpec,
  OutputStyleConfigSchema,
  PermissionsConfigSchema,
  StatuslineConfigSchema,
} from "../types/schemas.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;
type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;

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
  /** Default false. Set true on providers that ship a hooksFormat writer. */
  hooks?: boolean;
  /** Default false. Set true on providers that ship a permissionsFormat writer. */
  permissions?: boolean;
  /** Default false. Set true on providers that ship a statuslineFormat writer. */
  statusline?: boolean;
  /** Default false. Set true on providers that ship an outputStyleFormat writer. */
  outputStyle?: boolean;
}

export interface MCPFormat {
  /** Write MCP servers to the tool's config file */
  writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void>;
}

export interface DocsFormat {
  /** Write docs directive file for this tool */
  writeDocs(agentsMdPath: string, cwd: string): Promise<void>;
}

export interface HooksFormat {
  /** Write canonical hooks into the tool's settings file. Returns dropped hooks (unsupported events). */
  writeHooks(
    hooks: Record<string, HookSpec[]>,
    cwd: string,
  ): Promise<{ dropped: Array<{ event: string; id: string; reason: string }> }>;
}

export interface PermissionsFormat {
  writePermissions(
    permissions: NonNullable<PermissionsConfig>,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

export interface StatuslineFormat {
  writeStatusline(
    statusline: NonNullable<StatuslineConfig>,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

export interface OutputStyleFormat {
  writeOutputStyle(
    outputStyle: NonNullable<OutputStyleConfig>,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

/** Optional per-tool post-processing for agent files (runs after generic copy) */
export interface AgentsPostHook {
  /**
   * Called after agent .md files have been copied into provider.paths.agentsDir.
   * Reads the canonical source dir(s) and writes any tool-specific artifacts
   * (e.g., Codex emits .toml role wrappers + merges [agents.<n>] into config.toml).
   */
  postSync(sourceAgentDirs: string[], cwd: string): Promise<void>;
}

/**
 * Optional per-tool transform of an agent .md's content at copy time.
 *
 * Unlike `agentsPostHook` (which writes sibling artifacts and leaves the .md
 * untouched), this rewrites the file the tool actually reads — for tools that
 * parse the agent's own frontmatter and reject foreign keys (e.g. OpenCode
 * fatal-boots on agentsync's `tools` allowlist). Its presence forces a real
 * copy (symlink mode is skipped, since the dest content diverges from source).
 */
export interface AgentContentTransform {
  /**
   * @param content  canonical agent .md (frontmatter + body)
   * @param name     agent name (basename without extension) for warning context
   * @returns translated content plus any lossy-translation warnings
   */
  transform(
    content: string,
    name: string,
  ): { content: string; warnings: string[] };
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
  /** Optional per-tool post-processing after agent copy (e.g., Codex role TOML wrappers) */
  agentsPostHook?: AgentsPostHook;
  /** Optional per-tool agent .md content transform applied at copy time (e.g., OpenCode frontmatter translation) */
  agentContentTransform?: AgentContentTransform;
  /** Hooks writer (null if tool does not support hooks via agentsync) */
  hooksFormat?: HooksFormat | null;
  /** Permissions writer (null if tool does not support permissions sync) */
  permissionsFormat?: PermissionsFormat | null;
  /** Statusline writer (null if not supported) */
  statuslineFormat?: StatuslineFormat | null;
  /** Output style writer (null if not supported) */
  outputStyleFormat?: OutputStyleFormat | null;
}
