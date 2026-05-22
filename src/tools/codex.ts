/**
 * Codex CLI Tool Provider
 *
 * MCP is configured via TOML in `.codex/config.toml` (project-scoped) or
 * `~/.codex/config.toml` (global). AgentSync writes BOTH:
 *   1. The project-scoped `<cwd>/.codex/config.toml` (forward-compatible —
 *      matches the codex docs surface and what future codex versions will
 *      honor),
 *   2. The user-level `~/.codex/config.toml` (current necessity — codex
 *      0.130 only reads MCP entries from the user home file; the
 *      project-scoped file is ignored by the live CLI).
 *
 * The user-level write merges per-key into `[mcp_servers.*]` and only touches
 * server names that AgentSync owns for this project's enabled MCPs, so
 * unrelated entries the user added by hand are preserved. Set
 * `AGENTSYNC_CODEX_NO_HOME_MCP=1` to opt out of the home-dir write
 * (project-scoped write still runs).
 *
 * Skills live in .agents/skills/ (shared cross-tool directory).
 * Ref: https://developers.openai.com/codex/mcp
 * Ref: https://developers.openai.com/codex/skills/
 * Background: docs/troubleshooting-harness.md "Codex MCP scope:
 * project-scoped `.codex/config.toml` is ignored".
 */

import { homedir } from "node:os";
import * as path from "node:path";
import { parse, stringify } from "smol-toml";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile, readFile } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

function toCodexServer(mcp: MCP): Record<string, unknown> {
  if ("command" in mcp) {
    const server: Record<string, unknown> = {
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      server.env = mcp.env;
    }
    return server;
  }
  const server: Record<string, unknown> = { url: mcp.url };
  if (mcp.headers && Object.keys(mcp.headers).length > 0) {
    server.http_headers = mcp.headers;
  }
  return server;
}

async function readTomlOrEmpty(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    return parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function mergeHomeMcp(
  managedNames: string[],
  mcpServers: Record<string, unknown>,
): Promise<void> {
  const home = process.env.HOME ?? homedir();
  const homeConfig = path.join(home, ".codex", "config.toml");
  const existing = await readTomlOrEmpty(homeConfig);
  const existingServers =
    (existing.mcp_servers as Record<string, unknown> | undefined) ?? {};
  // Per-key merge: replace only the names this sync owns; leave everything
  // else (other projects' entries, hand-edited servers) untouched.
  const merged: Record<string, unknown> = { ...existingServers };
  for (const name of managedNames) {
    merged[name] = mcpServers[name];
  }
  const next = { ...existing, mcp_servers: merged };
  await outputFile(homeConfig, stringify(next), { encoding: "utf-8" });
}

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
      const existing = await readTomlOrEmpty(configFile);

      // Build mcp_servers table in Codex TOML format
      const mcpServers: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        mcpServers[name] = toCodexServer(mcp);
      }

      const config = { ...existing, mcp_servers: mcpServers };
      await outputFile(configFile, stringify(config), { encoding: "utf-8" });

      // Also merge into ~/.codex/config.toml — codex 0.130 only reads MCP
      // entries from the user home file. Opt out via env if a user wants
      // strict project-scope-only behavior.
      if (process.env.AGENTSYNC_CODEX_NO_HOME_MCP !== "1") {
        await mergeHomeMcp(Object.keys(mcps), mcpServers);
      }
    },
  },
  docsFormat: null,
};
