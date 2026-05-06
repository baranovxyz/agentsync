/**
 * Claude Code Tool Provider
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile } from "../utils/fs.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const claudeProvider: ToolProvider = {
  name: "claude",
  displayName: "Claude Code",
  paths: {
    skillsDir: ".claude/skills",
    commandsDir: ".claude/commands",
    agentsDir: ".claude/agents",
    mcpConfigPath: ".mcp.json",
    docsFile: "CLAUDE.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: false,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await writeMcpJson(path.join(cwd, ".mcp.json"), mcps);
    },
  },
  docsFormat: {
    async writeDocs(_agentsMdPath: string, cwd: string): Promise<void> {
      const claudeMd = path.join(cwd, "CLAUDE.md");
      await outputFile(claudeMd, "@AGENTS.md\n", { encoding: "utf-8" });
    },
  },
};
