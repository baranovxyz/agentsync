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
import { mergeIntoSettings } from "./mcp-helpers.js";
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
  readsGlobalAgentsDir: false,
  manifestCleanSurfaces: ["skills", "agents"],
  agentFileExtension: ".agent.md",
  mcpFormat: {
    projectPath: "static",
    // `.vscode/mcp.json` is VS Code's own file: alongside `servers` it carries
    // `inputs` (prompted-secret definitions) and anything added through the
    // VS Code UI. Merge rather than serialize the whole file, so neither sync
    // nor clean discards what AgentSync did not write.
    //
    // Caveat: VS Code accepts JSONC here, and the merge parses strict JSON. A
    // file containing comments fails to parse and is rewritten from scratch,
    // losing `inputs` — the same outcome as before this became a merge, never
    // worse, but not the preservation the merge otherwise gives.
    ownership: { kind: "owned-keys", keys: ["servers"], format: "json" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      // VS Code native MCP format uses "servers" key (not "mcpServers")
      await mergeIntoSettings(
        path.join(cwd, ".vscode", "mcp.json"),
        mcps,
        cwd,
        "servers",
      );
    },
  },
  docsFormat: null,
};
