/**
 * Junie Tool Provider (JetBrains)
 *
 * Junie reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .junie/mcp/mcp.json (standard "mcpServers" key).
 *
 * Ref: https://junie.jetbrains.com
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const junieProvider: ToolProvider = {
  name: "junie",
  displayName: "Junie",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".junie/mcp/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: false,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
  },
  readsAgentsDir: true,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await writeMcpJson(path.join(cwd, ".junie", "mcp", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
