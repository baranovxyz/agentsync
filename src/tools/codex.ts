/**
 * Codex CLI Tool Provider
 *
 * MCP is configured via TOML in `.codex/config.toml` (project-scoped) or
 * `~/.codex/config.toml` (global). AgentSync writes to the project-scoped
 * file and merges with existing settings to avoid overwriting user config.
 *
 * Skills live in .agents/skills/ (shared cross-tool directory).
 * Ref: https://developers.openai.com/codex/mcp
 * Ref: https://developers.openai.com/codex/skills/
 */

import * as path from "node:path";
import { parse, stringify } from "smol-toml";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile, readFile } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

export const codexProvider: ToolProvider = {
  name: "codex",
  displayName: "Codex CLI",
  paths: {
    skillsDir: ".agents/skills", // Codex reads from .agents/ shared directory
    commandsDir: null, // Codex uses skills for commands (prompts are deprecated)
    agentsDir: null,
    mcpConfigPath: ".codex/config.toml",
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
      const configFile = path.join(cwd, ".codex", "config.toml");

      // Preserve existing non-MCP settings (e.g. model, sandbox_permissions)
      let existing: Record<string, unknown> = {};
      try {
        const content = await readFile(configFile, { encoding: "utf-8" });
        existing = parse(content) as Record<string, unknown>;
      } catch {
        // File doesn't exist yet — start fresh
      }

      // Build mcp_servers table in Codex TOML format
      const mcpServers: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if ("command" in mcp) {
          const server: Record<string, unknown> = {
            command: mcp.command,
            args: mcp.args,
          };
          if (mcp.env && Object.keys(mcp.env).length > 0) {
            server.env = mcp.env;
          }
          mcpServers[name] = server;
        } else {
          const server: Record<string, unknown> = { url: mcp.url };
          if (mcp.headers && Object.keys(mcp.headers).length > 0) {
            server.http_headers = mcp.headers;
          }
          mcpServers[name] = server;
        }
      }

      const config = { ...existing, mcp_servers: mcpServers };
      await outputFile(configFile, stringify(config), { encoding: "utf-8" });
    },
  },
  docsFormat: null,
};
