/**
 * Amazon Q Developer CLI Tool Provider
 *
 * Amazon Q reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .amazonq/mcp.json (standard format, "mcpServers" key).
 * Agents live at .amazonq/agents/.
 *
 * Ref: https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const amazonqProvider: ToolProvider = {
  name: "amazonq",
  displayName: "Amazon Q",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: ".amazonq/agents",
    mcpConfigPath: ".amazonq/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
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
      await writeMcpJson(path.join(cwd, ".amazonq", "mcp.json"), mcps);
    },
  },
  docsFormat: null,
};
