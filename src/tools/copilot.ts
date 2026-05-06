/**
 * GitHub Copilot CLI Tool Provider
 *
 * Skills: .github/skills/<name>/SKILL.md
 * Agents: .github/agents/<name>.agent.md
 * MCP: .vscode/mcp.json (workspace scope, CLI v0.0.407+) — key is "servers" (VS Code format)
 *   or ~/.copilot/mcp-config.json (user-level, key "mcpServers")
 * Ref: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
 * Ref: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const copilotProvider: ToolProvider = {
  name: "copilot",
  displayName: "Copilot CLI",
  paths: {
    skillsDir: ".github/skills",
    commandsDir: null, // Copilot uses prompts (IDE only) not CLI commands
    agentsDir: ".github/agents",
    mcpConfigPath: ".vscode/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: false,
  },
  readsAgentsDir: false,
  agentFileExtension: ".agent.md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      // VS Code native MCP format uses "servers" key (not "mcpServers")
      await writeMcpJson(
        path.join(cwd, ".vscode", "mcp.json"),
        mcps,
        "servers",
      );
    },
  },
  docsFormat: null,
};
