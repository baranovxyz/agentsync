/**
 * Sync Plan Builder
 *
 * Pure function that produces a data object describing what needs to be synced.
 * No side effects, no spinners, no console output, no file writes.
 *
 * Used by the sync command (plan/execute split) and reusable by doctor, dry-run, etc.
 */

import * as path from "node:path";
import { isToolName, SUPPORTED_TOOLS, type ToolName } from "../constants.js";
import {
  loadConfigHierarchy,
  type MergedConfig,
} from "../core/config/hierarchy.js";
import { applyProfile, selectProfile } from "../core/config/profiles.js";
import { ConfigError, getErrorMessage } from "../core/errors.js";
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
  noToolDetection?: boolean;
  link?: boolean;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Derive the CWD's position relative to the git root using the config chain.
 * The last entry in the chain is the root-most config, and its parent's parent
 * is the git root (e.g., /repo/.agents/agentsync.toml -> /repo).
 * Falls back to "." if the chain is empty or CWD is the root.
 */
function getRepoRelativePath(cwd: string, chain: string[]): string {
  if (chain.length === 0) return ".";
  // The root-most config is the last in the chain
  const rootConfig = chain[chain.length - 1];
  // Config is at <root>/.agents/agentsync.toml
  // Go up two levels to get to the repo root directory
  const repoRoot = path.dirname(path.dirname(rootConfig));
  const rel = path.relative(repoRoot, cwd);
  return rel || ".";
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
  let config = await loadConfigHierarchy(cwd);

  // 2. Resolve and apply profile if available
  if (config.profiles) {
    const repoRelativePath = getRepoRelativePath(cwd, config._sources.chain);
    const profileName =
      options.profile ??
      process.env.AGENTSYNC_PROFILE ??
      config.profile ??
      selectProfile(config.profiles, { repoRelativePath });

    if (profileName && config.profiles[profileName]) {
      const applied = applyProfile(config, config.profiles[profileName]);
      config = {
        ...applied,
        _sources: config._sources,
        _deduplicationLog: config._deduplicationLog,
      } as MergedConfig;
    }
  }

  // 3. Validate target tools
  if (options.tool && !isToolName(options.tool)) {
    throw new ConfigError(
      `Unknown tool: ${options.tool}`,
      "",
      `Valid tools: ${SUPPORTED_TOOLS.join(", ")}`,
    );
  }
  const tools: ToolName[] = options.tool
    ? [options.tool as ToolName]
    : config.tools || [];

  // Get tool providers
  const providers = getToolProviders(tools);

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
            "Pin to a single version, or use the object form with an explicit namespace: " +
            `{ source: "${entry.source}", namespace: "custom-name" }`
          : `"${existing}" and "${entry.source}" both derive namespace "${entry.namespace}". ` +
            "Use the object form with an explicit namespace to resolve.";
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
        const cachePath = await resolver.resolve(entry.source, {
          cwd,
          noToolDetection: options.noToolDetection,
        });

        // Skip tool directory markers
        if (cachePath.startsWith("tool:")) continue;

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
        server as Record<string, unknown>,
        `mcp.${name}`,
      );
      warnings.push(...mcpWarnings);

      if ("url" in cleaned) {
        const mcp: MCP = { url: cleaned.url as string };
        if (cleaned.headers) {
          mcp.headers = cleaned.headers as Record<string, string>;
        }
        activeMCPs[name] = mcp;
      } else {
        const mcp: MCP = {
          command: (cleaned.command as string) || "",
          args: (cleaned.args as string[]) || [],
        };
        if (cleaned.env) {
          mcp.env = cleaned.env as Record<string, string>;
        }
        activeMCPs[name] = mcp;
      }
    }

    const env = await loadEnv();
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
