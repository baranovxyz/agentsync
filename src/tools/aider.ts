/**
 * Aider Tool Provider
 *
 * Aider supports AGENTS.md only — no MCP, no commands, no skills.
 * It reads AGENTS.md natively from the project root.
 *
 * Ref: https://aider.chat/docs/
 */

import type { ToolProvider } from "./types.js";

export const aiderProvider: ToolProvider = {
  name: "aider",
  displayName: "Aider",
  paths: {
    skillsDir: null,
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: null,
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: false,
    commands: false,
    agents: false,
    mcpStdio: false,
    mcpHttp: false,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".md",
  mcpFormat: null,
  docsFormat: null,
};
