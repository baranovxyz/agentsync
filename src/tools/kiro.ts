/**
 * Kiro Tool Provider
 *
 * Kiro reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .kiro/settings/mcp.json (standard "mcpServers" key).
 *
 * Ref: https://kiro.dev/docs/cli/mcp/
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const kiroProvider: ToolProvider = {
  name: "kiro",
  displayName: "Kiro",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".kiro/settings/mcp.json",
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
      await writeMcpJson(path.join(cwd, ".kiro", "settings", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
