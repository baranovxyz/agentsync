/**
 * Augment Tool Provider
 *
 * Augment reads .agents/skills/ and .agents/commands/ natively.
 * MCP is configured via JSON at .augment/settings.json (standard "mcpServers" key).
 * Merges into existing settings file to preserve non-MCP settings.
 *
 * Ref: https://docs.augmentcode.com
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const augmentProvider: ToolProvider = {
  name: "augment",
  displayName: "Augment",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: ".agents/commands",
    agentsDir: null,
    mcpConfigPath: ".augment/settings.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
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
      await mergeIntoSettings(
        path.join(cwd, ".augment", "settings.json"),
        mcps,
      );
    },
  },
  docsFormat: null,
};
