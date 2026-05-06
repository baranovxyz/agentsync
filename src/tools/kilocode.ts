/**
 * KiloCode Tool Provider
 *
 * KiloCode reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .kilocode/mcp.json (standard "mcpServers" key).
 *
 * Ref: https://github.com/Kilo-Org/kilocode
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const kilocodeProvider: ToolProvider = {
  name: "kilocode",
  displayName: "KiloCode",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".kilocode/mcp.json",
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
      await writeMcpJson(path.join(cwd, ".kilocode", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
