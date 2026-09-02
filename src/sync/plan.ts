/**
 * Sync Plan Builder
 *
 * Pure function that produces a data object describing what needs to be synced.
 * No side effects, no spinners, no console output, no file writes.
 *
 * Used by the sync command (plan/execute split) and reusable by doctor, dry-run, etc.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import {
  isForeignDallayConfig,
  parseProjectTomlConfig,
} from "../config/toml-loader.js";
import { isToolName, SUPPORTED_TOOLS, type ToolName } from "../constants.js";
import type { MergedConfig } from "../core/config/hierarchy.js";
import { resolveConfig } from "../core/config/resolve.js";
import {
  AgentSyncError,
  ConfigError,
  getErrorMessage,
} from "../core/errors.js";
import { loadEnv } from "../core/mcp/env.js";
import type { MCP } from "../core/mcp/tokens.js";
import { substituteAllMCPs, validateTokens } from "../core/mcp/tokens.js";
import { getToolProviders } from "../tools/index.js";
import type { ToolProvider } from "../tools/types.js";
import type { CliError } from "../types/output.js";
import { pathExists } from "../utils/fs.js";
import { getGlobalConfigDir } from "../utils/global-config.js";

// ── Public Interfaces ──────────────────────────────────────

export interface SyncPlan {
  tools: ToolName[];
  providers: ToolProvider[];
  /** Content dirs from all hierarchy levels (global + monorepo chain), root-first (lowest priority) */
  hierarchySkillDirs: string[];
  hierarchyCommandDirs: string[];
  hierarchyAgentDirs: string[];
  presetSkills: Map<string, string[]> | undefined;
  presetCommands: Map<string, string[]> | undefined;
  presetAgents: Map<string, string[]> | undefined;
  mcpServers: Record<string, MCP>;
  /** Canonical hooks / permissions / statusline / output_style from merged config */
  extensions: import("./extensions.js").ExtensionsInput;
  warnings: string[];
  presetErrors: CliError[];
  config: MergedConfig;
}

export interface SyncPlanOptions {
  cwd?: string;
  dryRun?: boolean;
  tool?: string;
  profile?: string;
  link?: boolean;
}

// ── Foreign-config detection ────────────────────────────────

/**
 * Root-level tool-selection keys in the unrelated dallay/Rust config that
 * shares `.agents/agentsync.toml` with this project.
 */
const FOREIGN_CONFIG_KEYS = ["default_agents", "agents"] as const;

/**
 * Find the foreign selector keys in a validated config chain. Read failures
 * are ignored because hierarchy loading already surfaced them.
 */
async function detectForeignConfigKeys(
  configPaths: string[],
): Promise<string[]> {
  const found = new Set<string>();
  for (const configPath of configPaths) {
    try {
      const content = await readFile(configPath, "utf-8");
      const raw = parseProjectTomlConfig(content, configPath);
      if (!isForeignDallayConfig(raw)) continue;
      for (const key of FOREIGN_CONFIG_KEYS) {
        if (Object.hasOwn(raw, key)) {
          found.add(key);
        }
      }
    } catch {
      // Best-effort only -- skip unreadable/unparsable files.
    }
  }
  return [...found];
}

// ── Helpers ────────────────────────────────────────────────

function resolveTools(
  requested: string | undefined,
  configured: ToolName[],
): ToolName[] {
  if (requested === undefined) return configured;
  if (!isToolName(requested)) {
    throw new ConfigError(
      `Unknown tool: ${requested}`,
      "",
      `Valid tools: ${SUPPORTED_TOOLS.join(", ")}`,
    );
  }
  return [requested];
}

// ── Plan Builder ───────────────────────────────────────────

/**
 * Build a sync plan: load config, resolve profile, validate tools,
 * resolve presets, sanitize MCP servers. Returns pure data -- no I/O.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: extracted plan-building logic from sync command
export async function buildSyncPlan(
  options: SyncPlanOptions = {},
): Promise<SyncPlan> {
  const cwd = options.cwd || process.cwd();
  const warnings: string[] = [];
  const presetErrors: CliError[] = [];

  // 1. Load config hierarchy
  const config = await resolveConfig({ cwd, profile: options.profile });

  // 3. Validate target tools
  const tools = resolveTools(options.tool, config.tools ?? []);

  // Get tool providers
  const providers = getToolProviders(tools);

  // 3b. Zero resolved tools means sync has nothing to do -- almost always a
  // config mistake, not an intentional no-op. A classified dallay/Rust file
  // gets recovery that respects its read-only boundary.
  if (tools.length === 0) {
    const foreignKeys = await detectForeignConfigKeys(config._sources.chain);
    if (foreignKeys.length > 0) {
      warnings.push(
        `Read-only dallay/Rust config selected no supported tools from ${foreignKeys.join(", ")}. ` +
          "Choose supported ids in default_agents or [agents.<id>], or pass --tool <name>; " +
          "AgentSync will not rewrite the foreign config.",
      );
    } else {
      warnings.push(
        "No tools configured -- sync has nothing to do. Add tools = [...] to " +
          ".agents/agentsync.toml, or pass --tool <name> to sync a single tool " +
          '(see "agentsync config add tool <name>" or docs/cli.md).',
      );
    }
  }

  // 4. Resolve presets (namespace collision check, source resolution)
  let presetSkills: Map<string, string[]> | undefined;
  let presetCommands: Map<string, string[]> | undefined;
  let presetAgents: Map<string, string[]> | undefined;

  if (config.extends && config.extends.length > 0) {
    // Warn about fragile symlinks when using --link with presets
    if (options.link) {
      warnings.push(
        "Using --link with presets creates symlinks into temp directories. " +
          "These symlinks may break after temp cleanup.",
      );
    }

    const { normalizeExtends } = await import("../types/schemas.js");
    const { SourceResolver } = await import(
      "../core/registry/source-resolver.js"
    );
    const { pathExists: exists } = await import("../utils/fs.js");

    const entries = normalizeExtends(config.extends);

    // Check for namespace collisions
    const seenNamespaces = new Map<string, string>();
    for (const entry of entries) {
      const existing = seenNamespaces.get(entry.namespace);
      if (existing) {
        const isVersionedCollision =
          existing.replace(/@[^@]+$/, "") ===
          entry.source.replace(/@[^@]+$/, "");
        const hint = isVersionedCollision
          ? `Both "${existing}" and "${entry.source}" derive the same namespace "${entry.namespace}". ` +
            "Keep exactly one version in the top-level extends array."
          : `"${existing}" and "${entry.source}" both derive namespace "${entry.namespace}". ` +
            "Remove one source from the top-level extends array, or give the source a unique final path or repository name.";
        throw new ConfigError(
          `Namespace collision: "${entry.namespace}"`,
          "",
          hint,
        );
      }
      seenNamespaces.set(entry.namespace, entry.source);
    }

    const resolver = new SourceResolver();
    const skillsMap = new Map<string, string[]>();
    const commandsMap = new Map<string, string[]>();
    const agentsMap = new Map<string, string[]>();

    for (const entry of entries) {
      try {
        const cachePath = await resolver.resolve(entry.source, { cwd });

        // Warn about transitive extends (not supported in v1)
        const presetToml = path.join(cachePath, ".agents", "agentsync.toml");
        if (await exists(presetToml)) {
          warnings.push(
            `Transitive extends in preset "${entry.source}" are not supported in v1 and will be ignored.`,
          );
        }

        const skillsDir = path.join(cachePath, "skills");
        const commandsDir = path.join(cachePath, "commands");
        const agentsDir = path.join(cachePath, "agents");

        skillsMap.set(entry.namespace, [skillsDir]);
        commandsMap.set(entry.namespace, [commandsDir]);
        agentsMap.set(entry.namespace, [agentsDir]);
      } catch (error) {
        if (
          error instanceof AgentSyncError &&
          error.code === "PRESET_REF_NOT_FOUND"
        ) {
          presetErrors.push({
            code: "PRESET_REF_NOT_FOUND",
            message: error.message,
            suggestion: error.suggestion,
            retryable: false,
            context: { source: entry.source },
          });
          continue;
        }
        const msg = getErrorMessage(error);
        presetErrors.push({
          code: "PRESET_UNREACHABLE",
          message: `Failed to load preset "${entry.source}": ${msg}`,
          suggestion: `Check network connectivity, or remove with: agentsync config rm preset ${entry.source}`,
          retryable: true,
          context: { source: entry.source },
        });
      }
    }

    presetSkills = skillsMap.size > 0 ? skillsMap : undefined;
    presetCommands = commandsMap.size > 0 ? commandsMap : undefined;
    presetAgents = agentsMap.size > 0 ? agentsMap : undefined;
  }

  // 5. Resolve MCP servers (sanitize, substitute tokens, validate)
  let mcpServers: Record<string, MCP> = {};

  const hasMcpServers = config.mcp && Object.keys(config.mcp).length > 0;
  if (hasMcpServers) {
    const { sanitizeMcpConfig } = await import("../utils/sanitize.js");
    const activeMCPs: Record<string, MCP> = {};

    for (const [name, server] of Object.entries(config.mcp || {})) {
      const { config: cleaned, warnings: mcpWarnings } = sanitizeMcpConfig(
        server,
        `mcp.${name}`,
      );
      warnings.push(...mcpWarnings);

      activeMCPs[name] =
        "url" in cleaned
          ? {
              url: cleaned.url,
              ...(cleaned.headers ? { headers: cleaned.headers } : {}),
            }
          : {
              command: cleaned.command,
              args: cleaned.args ?? [],
              ...(cleaned.env ? { env: cleaned.env } : {}),
            };
    }

    const env = await loadEnv(path.join(cwd, ".env"));
    const substituted = substituteAllMCPs(activeMCPs, env);
    validateTokens(substituted);

    mcpServers = substituted;
  }

  // 6. Discover content from all hierarchy levels (global + monorepo chain)
  // Order: root-first (lowest priority). CWD's .agents/ is excluded here —
  // it's synced as "project content" (highest priority) by the executor.
  const hierarchySkillDirs: string[] = [];
  const hierarchyCommandDirs: string[] = [];
  const hierarchyAgentDirs: string[] = [];

  // Global ~/.agents/ first (lowest priority)
  const globalConfigDir = getGlobalConfigDir();
  for (const sub of ["skills", "commands", "agents"]) {
    const dir = path.join(globalConfigDir, sub);
    if (await pathExists(dir)) {
      if (sub === "skills") hierarchySkillDirs.push(dir);
      else if (sub === "commands") hierarchyCommandDirs.push(dir);
      else hierarchyAgentDirs.push(dir);
    }
  }

  // Intermediate monorepo layers (root → parent → ... but NOT CWD's .agents/ or global)
  // Chain is most-specific first, so reverse to get root-first ordering
  const cwdAgentsDir = path.join(cwd, ".agents");
  for (const configPath of [...config._sources.chain].reverse()) {
    const agentsDir = path.dirname(configPath);
    // Skip CWD's .agents/ — that's project content, synced separately at highest priority
    if (path.resolve(agentsDir) === path.resolve(cwdAgentsDir)) continue;
    // Skip global ~/.agents/ — already added in pass 1 above
    if (path.resolve(agentsDir) === path.resolve(globalConfigDir)) continue;
    for (const sub of ["skills", "commands", "agents"]) {
      const dir = path.join(agentsDir, sub);
      if (await pathExists(dir)) {
        if (sub === "skills") hierarchySkillDirs.push(dir);
        else if (sub === "commands") hierarchyCommandDirs.push(dir);
        else hierarchyAgentDirs.push(dir);
      }
    }
  }

  return {
    tools,
    providers,
    hierarchySkillDirs,
    hierarchyCommandDirs,
    hierarchyAgentDirs,
    presetSkills,
    presetCommands,
    presetAgents,
    mcpServers,
    extensions: {
      hooks: config.hooks as
        | Record<string, import("../types/schemas.js").HookSpec[]>
        | undefined,
      permissions: config.permissions ?? undefined,
      statusline: config.statusline ?? undefined,
      outputStyle: config.output_style ?? undefined,
    },
    warnings,
    presetErrors,
    config,
  };
}
