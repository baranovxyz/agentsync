/**
 * Amp Tool Provider (Sourcegraph)
 *
 * Amp reads .agents/skills/ natively. Current Amp removed custom commands in favor of skills.
 * MCP is configured via JSON at .amp/settings.json (project-scoped), under "amp.mcpServers" key.
 * Merges into existing settings file to preserve non-MCP settings.
 *
 * Ref: https://sourcegraph.com/docs/amp
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const ampProvider: ToolProvider = {
  name: "amp",
  displayName: "Amp",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".amp/settings.json",
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
  readsGlobalAgentsDir: "unverified",
  manifestCleanSurfaces: [],
  agentFileExtension: ".md",
  mcpFormat: {
    projectPath: "static",
    ownership: { kind: "owned-keys", keys: ["amp.mcpServers"], format: "json" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      await mergeIntoSettings(
        path.join(cwd, ".amp", "settings.json"),
        mcps,
        cwd,
        "amp.mcpServers",
      );
    },
  },
  docsFormat: null,
};
