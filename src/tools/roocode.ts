/**
 * RooCode Tool Provider
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const roocodeProvider: ToolProvider = {
  name: "roocode",
  displayName: "RooCode",
  paths: {
    skillsDir: ".roo/skills",
    commandsDir: ".roo/commands",
    agentsDir: null, // RooCode doesn't support agents
    mcpConfigPath: ".roo/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: false,
    mcpStdio: true,
    mcpHttp: false,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
  },
  readsAgentsDir: true,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await writeMcpJson(path.join(cwd, ".roo", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
