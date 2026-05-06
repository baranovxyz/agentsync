/**
 * Cline Tool Provider
 *
 * Cline stores rules as flat .md files in .clinerules/ at project root.
 * Supports YAML frontmatter with `paths` field for conditional rules.
 * No subdirectory nesting — namespace separator is `--` in flat filenames.
 * Workflows (.clinerules/workflows/) exist but are not AgentSync commands.
 * MCP is global-only (VS Code globalStorage) — no project-level MCP config.
 * Reads AGENTS.md natively.
 *
 * Ref: https://docs.cline.bot/features/cline-rules
 * Ref: https://docs.cline.bot/mcp/configuring-mcp-servers
 */

import type { ToolProvider } from "./types.js";

export const clineProvider: ToolProvider = {
  name: "cline",
  displayName: "Cline",
  paths: {
    skillsDir: ".clinerules",
    commandsDir: null, // Cline workflows are not AgentSync commands
    agentsDir: null,
    mcpConfigPath: null, // MCP is global-only (VS Code storage)
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: false,
    mcpStdio: false, // No project-level MCP config
    mcpHttp: false,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".md",
  mcpFormat: null,
  docsFormat: null,
};
