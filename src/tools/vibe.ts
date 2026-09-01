/**
 * Mistral Vibe Tool Provider
 *
 * Vibe reads `.agents/skills/` natively — `find_local_config_dirs()` in
 * `vibe/core/paths/_local_config_files.py` appends `<root>/.agents/skills` to
 * the skill search path (both `.agents/` and `.agents/skills/` must exist), and
 * `_discover_skills_in_dir()` requires `<skill>/SKILL.md`, silently skipping
 * flat `.md` files — exactly agentsync's canonical layout. `~/.agents/skills`
 * is read too, so `readsGlobalAgentsDir` is explicitly true. Vibe therefore
 * needs no skill copies at all.
 *
 * MCP lives in `.vibe/config.toml` — and unlike every other tool here, it is an
 * ARRAY OF TABLES (`[[mcp_servers]]`) whose entries carry their own `name`
 * field, not a name-keyed map. The transport key is `transport`, not `type`.
 * The file is human-authored (models, permissions, themes live there too), so
 * the writer merges: it parses what is on disk, replaces only `mcp_servers`,
 * and writes everything else back untouched.
 *
 * `.vibe/config.toml` is listed in the gitignore patterns for the same reason
 * every other MCP target is: agentsync resolves `{TOKEN}` placeholders into
 * this file, so it can hold live credentials. The tradeoff is real — a project
 * that wants its Vibe model/permission config committed should drop that line.
 *
 * Commands: none. Vibe has no slash-command file surface.
 *
 * Subagents: deliberately NOT synced. Vibe's `.vibe/agents/` holds `*.toml`
 * PROFILES (model + tool-permission overrides), discovered via `base.glob("*.toml")`
 * — a canonical `.agents/agents/<name>.md` role brief has no lossless home
 * there. Carrying the brief across would mean splitting each file into a
 * `.toml` profile plus a `system_prompt_id` prompt file, and that prompt
 * REPLACES Vibe's entire default system prompt rather than adding a role to it.
 * Widening a role brief into a full system-prompt replacement is precisely the
 * lossy translation this codebase refuses to perform silently, so `agents` is
 * false until that mapping is designed on purpose.
 *
 * Rules: no glob-scoped rule surface.
 *
 * Ref: https://github.com/mistralai/vibe
 * Ref: `vibe/core/config/models.py` (MCPStdio / MCPHttp / MCPStreamableHttp),
 *      `vibe/core/paths/_local_config_files.py`, `vibe/core/skills/manager.py`.
 */

import * as path from "node:path";
import { parse, stringify } from "smol-toml";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile, pathExists, readFile } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

async function readTomlOrEmpty(
  filePath: string,
): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) return {};
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    const parsed = parse(content);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Start fresh if the existing config is unparseable
    return {};
  }
}

/**
 * Convert canonical MCP to one `[[mcp_servers]]` entry. The server name is a
 * FIELD here, not the key it is stored under.
 */
function toVibeServer(name: string, mcp: MCP): Record<string, unknown> {
  if ("command" in mcp) {
    const server: Record<string, unknown> = {
      name,
      transport: "stdio",
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      server.env = mcp.env;
    }
    return server;
  }

  const server: Record<string, unknown> = {
    name,
    transport: "http",
    url: mcp.url,
  };
  if (mcp.headers && Object.keys(mcp.headers).length > 0) {
    // Vibe carries HTTP headers under the server's `auth` table, not as a
    // top-level `headers` key.
    server.auth = { type: "static", headers: mcp.headers };
  }
  return server;
}

export const vibeProvider: ToolProvider = {
  name: "vibe",
  displayName: "Mistral Vibe",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".vibe/config.toml",
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
  readsGlobalAgentsDir: true,
  manifestCleanSurfaces: [],
  agentFileExtension: ".md",
  mcpFormat: {
    projectPath: "static",
    ownership: { kind: "owned-keys", keys: ["mcp_servers"], format: "toml" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      const configPath = path.join(cwd, ".vibe", "config.toml");
      const existing = await readTomlOrEmpty(configPath);

      existing.mcp_servers = Object.entries(mcps).map(([name, mcp]) =>
        toVibeServer(name, mcp),
      );

      await outputFile(configPath, `${stringify(existing)}\n`, {
        encoding: "utf-8",
      });
    },
  },
  docsFormat: null,
};
