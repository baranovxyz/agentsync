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
import fg from "fast-glob";
import yaml from "js-yaml";
import { parse, stringify } from "smol-toml";
import type { z } from "zod";
import type { MCP } from "../core/mcp/tokens.js";
import type {
  OutputStyleConfigSchema,
  PermissionsConfigSchema,
  StatuslineConfigSchema,
} from "../types/schemas.js";
import { outputFile, pathExists, readFile } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;
type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;

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

/**
 * Parse YAML frontmatter from a markdown file body.
 * Returns null fm + full content if no frontmatter present.
 */
function splitFrontmatter(raw: string): {
  fm: Record<string, unknown> | null;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: null, body: raw };
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === "object") {
      return { fm: parsed as Record<string, unknown>, body: match[2] };
    }
  } catch {
    // fall through — treat as no frontmatter
  }
  return { fm: null, body: raw };
}

/**
 * Build a Codex role-TOML wrapper for an agent.
 * Always sets model_instructions_file; passes through any keys in frontmatter
 * under the `codex` block that are full-config-layer fields (model, sandbox_mode,
 * etc.). The cx-only metadata (description, nickname_candidates, max_depth) is
 * lifted into the parent config.toml's [agents.<n>] table by mergeCodexAgents,
 * NOT written here.
 */
function buildAgentToml(
  instructionsMdPath: string,
  codexFm: Record<string, unknown> | undefined,
): string {
  const payload: Record<string, unknown> = {
    model_instructions_file: instructionsMdPath,
  };
  if (codexFm) {
    // pass-through any codex.<field> that is NOT one of the [agents.<n>]
    // metadata fields (those live in the parent config.toml)
    const liftedToParent = new Set([
      "description",
      "nickname_candidates",
      "max_depth",
    ]);
    for (const [k, v] of Object.entries(codexFm)) {
      if (!liftedToParent.has(k)) payload[k] = v;
    }
  }
  return stringify(payload);
}

/**
 * Codex agent post-sync hook.
 *
 * After the generic agent-md copy lands `.codex/agents/<n>.md`, this hook:
 *  1) writes a sibling `.codex/agents/<n>.toml` role-config layer pointing at
 *     the md via `model_instructions_file`,
 *  2) merges `[agents.<n>]` into `<cwd>/.codex/config.toml` with description
 *     + nickname_candidates + config_file lifted from the source frontmatter.
 *
 * Source frontmatter shape:
 *   ---
 *   description: ...
 *   codex:
 *     nickname_candidates: ["nit", "Iris"]
 *     max_depth: 2
 *     # any other codex.<field> passes through to the role TOML
 *   ---
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear pipeline through sources/files/frontmatter/merge
async function codexAgentsPostSync(
  sourceAgentDirs: string[],
  cwd: string,
): Promise<void> {
  const codexAgentsDir = path.join(cwd, ".codex", "agents");
  const agentsTable: Record<string, Record<string, unknown>> = {};

  for (const sourceDir of sourceAgentDirs) {
    if (!(await pathExists(sourceDir))) continue;
    const files = await fg("**/*.md", { cwd: sourceDir, absolute: false });
    for (const relPath of files) {
      const raw = await readFile(path.join(sourceDir, relPath), {
        encoding: "utf-8",
      });
      const { fm } = splitFrontmatter(raw);
      const name = path.basename(relPath, ".md");

      const codexFm = (fm?.codex as Record<string, unknown> | undefined) ?? {};
      const description =
        (codexFm.description as string | undefined) ??
        (fm?.description as string | undefined);

      // Write role-config TOML wrapper next to the .md
      // (the .md itself was already copied by syncAgents)
      // Codex resolves `model_instructions_file` and `config_file` relative
      // to the `.codex/` directory in project-local config, so we emit
      // paths without the `.codex/` prefix (otherwise it looks for
      // `.codex/.codex/agents/<n>.toml` and errors).
      const mdRel = path.join("agents", relPath);
      const tomlPath = path.join(codexAgentsDir, `${name}.toml`);
      await outputFile(tomlPath, buildAgentToml(mdRel, codexFm), {
        encoding: "utf-8",
      });

      // Lift cx-only metadata into the [agents.<n>] table for config.toml
      const entry: Record<string, unknown> = {
        config_file: path.join("agents", `${name}.toml`),
      };
      if (description) entry.description = description;
      if (codexFm.nickname_candidates)
        entry.nickname_candidates = codexFm.nickname_candidates;
      if (codexFm.max_depth) entry.max_depth = codexFm.max_depth;
      agentsTable[name] = entry;
    }
  }

  if (Object.keys(agentsTable).length === 0) return;

  // Merge [agents.<n>] tables into .codex/config.toml, preserving every other key
  const configFile = path.join(cwd, ".codex", "config.toml");
  const existing = await readTomlOrEmpty(configFile);
  const existingAgents =
    (existing.agents as Record<string, unknown> | undefined) ?? {};
  // Per-key replace: agentsync owns only the names it just wrote; preserve
  // any hand-added entries the user has elsewhere in [agents.*].
  const mergedAgents: Record<string, unknown> = { ...existingAgents };
  for (const [name, entry] of Object.entries(agentsTable)) {
    mergedAgents[name] = entry;
  }
  const next = { ...existing, agents: mergedAgents };
  await outputFile(configFile, stringify(next), { encoding: "utf-8" });
}

// Hooks: codex 0.130 has no hooks system — an earlier design assumed cx
// had hooks, but a live check of the binary
// (`strings /usr/bin/codex | grep -iE "hook|matcher"`) returns zero matches.
// cx silently tolerates a `[[hooks.*]]` block in config.toml but never
// fires anything from it. The writer was removed; `syncExtensions` now
// surfaces "codex does not support hooks" via droppedHooks so users see
// their canonical hooks didn't reach cx.

const CX_PERMISSION_DEFAULT: Record<string, string> = {
  allow: ":danger-full-access",
  ask: ":workspace",
  deny: ":read-only",
};

async function writeCodexPermissions(
  permissions: NonNullable<PermissionsConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const configFile = path.join(cwd, ".codex", "config.toml");
  const existing = await readTomlOrEmpty(configFile);
  const next: Record<string, unknown> = { ...existing };
  if (permissions.default) {
    next.default_permissions = CX_PERMISSION_DEFAULT[permissions.default];
    if (permissions.default === "allow") {
      warnings.push(
        "permissions.default=allow maps to codex :danger-full-access — " +
          "verify this is intentional.",
      );
    }
  }
  for (const rule of permissions.rules ?? []) {
    warnings.push(
      `permissions.rule ${rule.id} (${rule.tool}/${rule.pattern ?? "*"}) is not ` +
        "translatable to Codex — use [overrides.cx] (planned) for cx-specific " +
        "filesystem ACLs in permissions.<profile>.filesystem.",
    );
  }
  await outputFile(configFile, stringify(next), { encoding: "utf-8" });
  return { warnings };
}

async function writeCodexStatusline(
  statusline: NonNullable<StatuslineConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const items = statusline.items ?? [];
  // Translate canonical `tokens` → cx `context-used` (the cx enum name).
  // Always include `context-used` so an external supervisor can parse
  // current usage from the status line — additive, doesn't displace the
  // user's selection.
  const mapped = items.map((i) => (i === "tokens" ? "context-used" : i));
  if (!mapped.includes("context-used")) mapped.push("context-used");
  // cx tui.status_line takes the same canonical item names — pass through
  if (statusline.custom_items?.length) {
    warnings.push(
      "statusline.custom_items dropped on codex — cx tui.status_line is " +
        "enum-only. Use [overrides.cx] (planned) if a custom item is required.",
    );
  }
  const configFile = path.join(cwd, ".codex", "config.toml");
  const existing = await readTomlOrEmpty(configFile);
  const tui = (existing.tui as Record<string, unknown> | undefined) ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    tui: { ...tui, status_line: mapped },
  };
  await outputFile(configFile, stringify(next), { encoding: "utf-8" });
  return { warnings };
}

const TONE_TO_CX: Record<string, string | null> = {
  terse: "none",
  pragmatic: "pragmatic",
  explanatory: null,
  friendly: "friendly",
  none: "none",
};

async function writeCodexOutputStyle(
  outputStyle: NonNullable<OutputStyleConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  if (outputStyle.custom?.length) {
    warnings.push(
      "output_style.custom dropped on codex — cx personality is enum-only.",
    );
  }
  if (!outputStyle.tone) return { warnings };
  const personality = TONE_TO_CX[outputStyle.tone];
  if (personality === null) {
    warnings.push(
      `output_style.tone=${outputStyle.tone} has no codex personality equivalent`,
    );
    return { warnings };
  }
  const configFile = path.join(cwd, ".codex", "config.toml");
  const existing = await readTomlOrEmpty(configFile);
  const profiles =
    (existing.profiles as
      | Record<string, Record<string, unknown>>
      | undefined) ?? {};
  const defaultProfile = profiles.default ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    profiles: {
      ...profiles,
      default: { ...defaultProfile, personality },
    },
  };
  await outputFile(configFile, stringify(next), { encoding: "utf-8" });
  return { warnings };
}

export const codexProvider: ToolProvider = {
  name: "codex",
  displayName: "Codex CLI",
  paths: {
    skillsDir: ".agents/skills", // Codex reads from .agents/ shared directory
    commandsDir: null, // Codex uses skills for commands (prompts are deprecated)
    agentsDir: ".codex/agents",
    mcpConfigPath: ".codex/config.toml",
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
    hooks: false,
    permissions: true,
    statusline: true,
    outputStyle: true,
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
  agentsPostHook: {
    postSync: codexAgentsPostSync,
  },
  permissionsFormat: {
    writePermissions: writeCodexPermissions,
  },
  statuslineFormat: {
    writeStatusline: writeCodexStatusline,
  },
  outputStyleFormat: {
    writeOutputStyle: writeCodexOutputStyle,
  },
};
