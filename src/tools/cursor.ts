/**
 * Cursor Tool Provider
 *
 * Cursor supports skills (.cursor/skills/) and rules (.cursor/rules/)
 * but does NOT have a commands directory — it uses rules for instructions.
 * Ref: https://cursor.com/docs/context/rules
 * Ref: https://cursor.com/docs/context/skills
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const cursorProvider: ToolProvider = {
  name: "cursor",
  displayName: "Cursor",
  paths: {
    skillsDir: ".cursor/skills",
    commandsDir: null, // Cursor uses rules, not commands
    agentsDir: null,
    mcpConfigPath: ".cursor/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: false,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await writeMcpJson(path.join(cwd, ".cursor", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
