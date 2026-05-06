/**
 * OpenCode Tool Provider
 *
 * OpenCode MCP config lives inside opencode.json under the "mcp" key.
 * It uses "environment" (not "env") and "command" as an array.
 * Ref: https://opencode.ai/docs/mcp-servers/
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

/**
 * Convert standard MCP format to OpenCode's format
 */
function toOpenCodeMCP(mcps: Record<string, MCP>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, mcp] of Object.entries(mcps)) {
    if ("command" in mcp) {
      result[name] = {
        type: "local",
        command: [mcp.command, ...(mcp.args || [])],
        enabled: true,
        ...(mcp.env ? { environment: mcp.env } : {}),
      };
    } else if ("url" in mcp) {
      result[name] = {
        type: "remote",
        url: mcp.url,
        enabled: true,
        ...(mcp.headers ? { headers: mcp.headers } : {}),
      };
    }
  }
  return result;
}

export const opencodeProvider: ToolProvider = {
  name: "opencode",
  displayName: "OpenCode",
  paths: {
    skillsDir: ".opencode/skills",
    commandsDir: ".opencode/commands",
    agentsDir: ".opencode/agents",
    mcpConfigPath: "opencode.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: true,
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
        path.join(cwd, "opencode.json"),
        toOpenCodeMCP(mcps),
        "mcp",
      );
    },
  },
  docsFormat: null,
};
