/**
 * Crush Tool Provider (Charm)
 *
 * Crush is a minimal terminal AI tool with MCP support only.
 * MCP is configured via JSON at crush.json under the "mcp" key (not "mcpServers").
 * Merges into existing crush.json to preserve non-MCP settings.
 *
 * Ref: https://github.com/charmbracelet/crush
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const crushProvider: ToolProvider = {
  name: "crush",
  displayName: "Crush",
  paths: {
    skillsDir: null,
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: "crush.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: false,
    commands: false,
    agents: false,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: false,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await mergeIntoSettings(path.join(cwd, "crush.json"), mcps, "mcp");
    },
  },
  docsFormat: null,
};
