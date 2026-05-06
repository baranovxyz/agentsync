/**
 * Gemini CLI Tool Provider
 *
 * Gemini merges MCP into .gemini/settings.json under mcpServers.
 * Commands use .toml format (not .md), so AgentSync doesn't write commands for Gemini.
 * Skills: .gemini/skills/<name>/SKILL.md
 * Docs: GEMINI.md (default context file, configurable)
 * Ref: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md
 * Ref: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile } from "../utils/fs.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const geminiProvider: ToolProvider = {
  name: "gemini",
  displayName: "Gemini CLI",
  paths: {
    skillsDir: ".gemini/skills",
    commandsDir: null, // Gemini uses .toml commands — incompatible with .md
    agentsDir: null, // Gemini doesn't have a separate agents directory
    mcpConfigPath: ".gemini/settings.json",
    docsFile: "GEMINI.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: false,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: false,
    nativeSkillsDiscovery: true,
  },
  readsAgentsDir: true,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await mergeIntoSettings(path.join(cwd, ".gemini", "settings.json"), mcps);
    },
  },
  docsFormat: {
    async writeDocs(_agentsMdPath: string, cwd: string): Promise<void> {
      const geminiMd = path.join(cwd, "GEMINI.md");
      await outputFile(geminiMd, "@AGENTS.md\n", { encoding: "utf-8" });
    },
  },
};
