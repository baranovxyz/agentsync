/**
 * OpenHands Tool Provider
 *
 * OpenHands reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via JSON at .openhands/mcp.json with a split-array format:
 *   - command-based MCPs go into "stdio_servers" array (each entry has a "name" field)
 *   - URL-based MCPs go into "sse_servers" array (each entry has a "name" field)
 *
 * Ref: https://github.com/OpenHands/OpenHands
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

interface OpenHandsStdioServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface OpenHandsSSEServer {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

interface OpenHandsMCPConfig {
  stdio_servers: OpenHandsStdioServer[];
  sse_servers: OpenHandsSSEServer[];
}

/**
 * Convert standard MCP format to OpenHands split-array format
 */
function toStdioServer(
  name: string,
  mcp: Extract<MCP, { command: string }>,
): OpenHandsStdioServer {
  const server: OpenHandsStdioServer = { name, command: mcp.command };
  if (mcp.args?.length) server.args = mcp.args;
  if (mcp.env && Object.keys(mcp.env).length > 0) server.env = mcp.env;
  return server;
}

function toSSEServer(
  name: string,
  mcp: Extract<MCP, { url: string }>,
): OpenHandsSSEServer {
  const server: OpenHandsSSEServer = { name, url: mcp.url };
  if (mcp.headers && Object.keys(mcp.headers).length > 0)
    server.headers = mcp.headers;
  return server;
}

function toOpenHandsConfig(mcps: Record<string, MCP>): OpenHandsMCPConfig {
  const stdio_servers: OpenHandsStdioServer[] = [];
  const sse_servers: OpenHandsSSEServer[] = [];

  for (const [name, mcp] of Object.entries(mcps)) {
    if ("command" in mcp) {
      stdio_servers.push(toStdioServer(name, mcp));
    } else {
      sse_servers.push(toSSEServer(name, mcp));
    }
  }

  return { stdio_servers, sse_servers };
}

export const openhandsProvider: ToolProvider = {
  name: "openhands",
  displayName: "OpenHands",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".openhands/mcp.json",
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
  readsAgentsDir: true,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      const mcpFile = path.join(cwd, ".openhands", "mcp.json");
      const config = toOpenHandsConfig(mcps);
      await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`);
    },
  },
  docsFormat: null,
};
