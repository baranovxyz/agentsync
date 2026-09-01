/**
 * Pi Tool Provider (earendil-works)
 *
 * Pi reads `.agents/skills/` natively — `collectAncestorAgentsSkillDirs()` walks
 * cwd up to the git repo root collecting `<dir>/.agents/skills`, and a directory
 * is only a skill if it holds a `SKILL.md` (bare root-level `.md` files are
 * ignored in `.agents/skills`, exactly matching agentsync's required layout).
 * The user-global `~/.agents/skills/` is read as well, hence the explicit
 * `readsGlobalAgentsDir: true` — this one is verified, not assumed.
 *
 * Commands are prompt templates in `.pi/prompts/*.md`. Discovery there is
 * NON-RECURSIVE, so agentsync's flat `--` namespace separator is required;
 * nested `.pi/prompts/<ns>/<cmd>.md` would never be found.
 *
 * MCP: none. Pi ships no MCP client at all ("**No MCP.** Build CLI tools with
 * READMEs, or build an extension that adds MCP support" — README §Philosophy),
 * and a sweep of the published 0.84.2 bundle finds no `mcpServers` /
 * `mcp.json` reader anywhere. Writing an MCP file here would create a config
 * no Pi version reads, so `mcpFormat` stays null.
 *
 * Subagents: none — Pi deliberately omits them ("**No sub-agents.**").
 *
 * Two operator-facing gotchas agentsync cannot fix by writing files:
 *  - `AGENTS.override.md` outranks `AGENTS.md` in the SAME directory, so a repo
 *    carrying one will shadow the synced AGENTS.md.
 *  - Project resources (`.pi/prompts`, project `.agents/skills`) are gated on
 *    project trust (`~/.pi/agent/trust.json`); until the folder is trusted, a
 *    freshly synced repo's commands and skills are ignored.
 *
 * Ref: https://github.com/earendil-works/pi
 * Ref: `docs/skills.md`, `docs/prompt-templates.md`, `docs/usage.md` as shipped
 *      in `@earendil-works/pi-coding-agent`.
 */

import type { ToolProvider } from "./types.js";

export const piProvider: ToolProvider = {
  name: "pi",
  displayName: "Pi",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: ".pi/prompts",
    agentsDir: null,
    mcpConfigPath: null,
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: false,
    mcpStdio: false,
    mcpHttp: false,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
  },
  readsGlobalAgentsDir: true,
  manifestCleanSurfaces: ["commands"],
  agentFileExtension: ".md",
  mcpFormat: null,
  docsFormat: null,
};
