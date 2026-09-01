/**
 * Qwen Code Tool Provider
 *
 * Qwen Code reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .qwen/.mcp.json (standard "mcpServers" key).
 *
 * Ref: https://github.com/QwenLM/qwen-code
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

export const qwenProvider: ToolProvider = {
  name: "qwen",
  displayName: "Qwen Code",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".qwen/.mcp.json",
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
    ownership: { kind: "whole-file" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      await writeMcpJson(path.join(cwd, ".qwen", ".mcp.json"), mcps, cwd);
    },
  },
  docsFormat: null,
};
