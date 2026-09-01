/**
 * Factory Droid Tool Provider
 *
 * Droid reads `.agents/skills/` natively: `discoverSkills()` joins each of
 * `.factory`, `.agents`, `.agent` with `skills` for every root it scans, and a
 * directory becomes a skill when it holds a `SKILL.md`. `~/.agents/skills/`
 * is covered too, so `readsGlobalAgentsDir` is explicitly true.
 *
 * MCP lives in `.factory/mcp.json` (git-root anchored) under the standard
 * `mcpServers` key. Droid WRITES this file too — `persistMcp()` rewrites it
 * wholesale and stores `persistentPermissions` and OAuth state alongside the
 * servers — so the writer merges and preserves unknown keys rather than
 * treating the file as a generated artifact it owns.
 *
 * The entry shape is NOT the plain `{command,args,env}` / `{url,headers}` pair
 * most tools take. Droid parses it with a discriminated union on `type`:
 *   stdio → `{type?: "stdio", command, args, env?}`  (type optional, defaults to stdio)
 *   http  → `{type: "http",  url, headers?}`          (type REQUIRED)
 *   sse   → `{type: "sse",   url, headers?}`
 * A URL server written without `type` therefore fails Droid's schema outright,
 * so `toDroidServer` stamps the discriminator explicitly on both forms.
 *
 * Commands are `.factory/commands/*.md` (`description` / `argument-hint`
 * frontmatter). Discovery recurses into subdirectories but the command NAME is
 * always the file basename — nested directories do not namespace it, so two
 * preset commands sharing a basename collide.
 *
 * Subagents ("droids") are flat `.factory/droids/*.md` with YAML frontmatter
 * (`name`, `description`, `model`, `reasoningEffort`, `tools`, `mcpServers`).
 * Note `.agents/droids` is NOT read — Droid's `.agents`-aware loader covers
 * skills and commands only — so agent files must be copied to `.factory/droids`.
 *
 * One value-level caveat: Droid runs its own shell-style `${VAR}` (and
 * `${VAR:-default}`) expansion over MCP `env` and `headers` — never over `url`,
 * `args` or `command` — and THROWS when a referenced variable is unset. Since
 * AgentSync resolves its own `{TOKEN}` placeholders before writing, that is
 * normally invisible; it only bites when a synced value legitimately contains
 * `${...}`, which Droid will try to expand.
 *
 * Rules: no glob-scoped rule surface exists (no `applyTo` / `globs` /
 * `alwaysApply` anywhere in the shipped binary). The only scoping primitive is
 * positional — nested `AGENTS.md` files refine the root one for a subtree.
 *
 * Ref: https://docs.factory.ai/cli/configuration/mcp
 * Ref: https://docs.factory.ai — see the Skills and Subagents pages for the
 *      supported skill locations and the droid frontmatter schema.
 */

import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { ToolProvider } from "./types.js";

/**
 * Convert canonical MCP to Droid's `type`-discriminated entry shape.
 * The discriminator is mandatory for URL servers and harmless (it is the
 * schema default) for command servers.
 */
function toDroidServer(mcp: MCP): Record<string, unknown> {
  if ("command" in mcp) {
    const server: Record<string, unknown> = {
      type: "stdio",
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      server.env = mcp.env;
    }
    return server;
  }

  const server: Record<string, unknown> = { type: "http", url: mcp.url };
  if (mcp.headers && Object.keys(mcp.headers).length > 0) {
    server.headers = mcp.headers;
  }
  return server;
}

export const droidProvider: ToolProvider = {
  name: "droid",
  displayName: "Factory Droid",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: ".factory/commands",
    agentsDir: ".factory/droids",
    mcpConfigPath: ".factory/mcp.json",
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
  readsGlobalAgentsDir: true,
  manifestCleanSurfaces: ["commands", "agents"],
  agentFileExtension: ".md",
  mcpFormat: {
    projectPath: "static",
    ownership: { kind: "owned-keys", keys: ["mcpServers"], format: "json" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      const servers: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        servers[name] = toDroidServer(mcp);
      }
      // Merge, never clobber: Droid writes this file itself and keeps
      // `persistentPermissions` and OAuth state in it (see header).
      await mergeIntoSettings(
        path.join(cwd, ".factory", "mcp.json"),
        servers,
        cwd,
        "mcpServers",
      );
    },
  },
  docsFormat: null,
};
