/**
 * Config Hierarchy Merging
 * Merges global, project (N-layer monorepo chain), and local configs with deduplication
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parse } from "smol-toml";
import {
  parseTomlConfig,
  tomlToInternalConfig,
} from "../../config/toml-loader.js";
import type { AgentSyncConfig } from "../../types/index.js";
import type { LocalConfig } from "../../types/schemas.js";
import { validateLocalConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";
import {
  getGlobalConfigPath,
  loadGlobalConfig,
} from "../../utils/global-config.js";
import { AgentSyncError, ConfigError, getErrorMessage } from "../errors.js";
import { discoverConfigChain } from "./discovery.js";
import { mergeConfigChain } from "./merge.js";

/**
 * Merged config with source tracking for debugging
 */
export interface MergedConfig extends AgentSyncConfig {
  _sources: {
    global?: string;
    project: string; // most-specific project config (backward compat)
    chain: string[]; // all discovered config paths, most-specific first
    local?: string;
  };
  _deduplicationLog: Array<{
    source: string;
    kept: "global" | "project";
    message: string;
  }>;
}

/**
 * Parse a single TOML config file into AgentSyncConfig.
 * Only TOML is supported — no JSON fallback.
 */
async function parseConfigFile(configPath: string): Promise<AgentSyncConfig> {
  const content = await readFile(configPath, "utf-8");

  try {
    const toml = parseTomlConfig(content, configPath);
    return tomlToInternalConfig(toml);
  } catch (error) {
    if (error instanceof AgentSyncError) {
      throw error;
    }
    throw new ConfigError(
      `Invalid config in ${configPath}: ${getErrorMessage(error)}`,
      configPath,
      "Check your agentsync.toml for syntax errors",
    );
  }
}

/**
 * Load and parse the local overrides config at CWD level.
 */
async function loadLocalConfig(
  cwd: string,
): Promise<{ local: LocalConfig | null; localPath: string }> {
  const localPath = path.join(cwd, "agentsync.local.toml");
  if (!(await pathExists(localPath))) {
    return { local: null, localPath };
  }
  try {
    const localContent = await readFile(localPath, "utf-8");
    const parsed = parse(localContent);
    return { local: validateLocalConfig(parsed), localPath };
  } catch (error) {
    throw new ConfigError(
      `Invalid local config: ${getErrorMessage(error)}`,
      localPath,
      "Check your agentsync.local.toml for syntax errors",
    );
  }
}

/**
 * Deduplicate extends from global and project configs.
 * Last occurrence wins; logs duplicates found across layers.
 */
function deduplicateExtends(
  globalExtends: string[],
  projectExtends: string[],
): {
  deduped: string[];
  log: MergedConfig["_deduplicationLog"];
} {
  const log: MergedConfig["_deduplicationLog"] = [];
  const globalSet = new Set(globalExtends);
  const projectSet = new Set(projectExtends);

  for (const source of globalSet) {
    if (projectSet.has(source)) {
      log.push({
        source,
        kept: "project",
        message: `Preset '${source}' appeared in both global and project configs, project version used`,
      });
    }
  }

  const allExtends = [...globalExtends, ...projectExtends];
  const deduped: string[] = [];
  const added = new Set<string>();
  for (let i = allExtends.length - 1; i >= 0; i--) {
    if (!added.has(allExtends[i])) {
      added.add(allExtends[i]);
      deduped.unshift(allExtends[i]);
    }
  }

  return { deduped, log };
}

/**
 * Merge MCP configs across layers and apply local disabling.
 */
function mergeMcpConfigs(
  global: AgentSyncConfig | null,
  project: AgentSyncConfig,
  local: LocalConfig | null,
): Record<string, NonNullable<AgentSyncConfig["mcp"]>[string]> | undefined {
  const merged = {
    ...(global?.mcp || {}),
    ...(project.mcp || {}),
    ...(local?.mcp || {}),
  };
  if (local?.mcp_disabled) {
    for (const name of local.mcp_disabled) {
      delete merged[name];
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

const EXTENSION_FIELDS = [
  "hooks",
  "permissions",
  "statusline",
  "output_style",
] as const;

type ExtensionField = (typeof EXTENSION_FIELDS)[number];
type ExtensionSlice = Partial<Pick<MergedConfig, ExtensionField>>;

/**
 * Pick extension surfaces from local first, then project. A defined
 * local value replaces project entirely; an undefined field is omitted
 * from the output object so MergedConfig's optional-fields shape is
 * preserved.
 */
function pickExtensions(
  project: AgentSyncConfig,
  local: LocalConfig | null,
): ExtensionSlice {
  const out: ExtensionSlice = {};
  for (const field of EXTENSION_FIELDS) {
    const value = local?.[field] ?? project[field];
    if (value !== undefined) {
      (out as Record<string, unknown>)[field] = value;
    }
  }
  return out;
}

/**
 * Load and merge config hierarchy: global → project chain → local
 * Returns merged config with deduplication applied
 */
export async function loadConfigHierarchy(cwd: string): Promise<MergedConfig> {
  const global = await loadGlobalConfig();
  const chain = await discoverConfigChain(cwd);

  if (chain.length === 0) {
    const tomlPath = path.join(cwd, ".agents", "agentsync.toml");
    throw new ConfigError(
      "Project config not found",
      tomlPath,
      'Run "agentsync init" to initialize',
    );
  }

  const parsedConfigs = await Promise.all(
    chain.map((configPath) => parseConfigFile(configPath)),
  );
  const project = mergeConfigChain(parsedConfigs);
  const projectPath = chain[0];

  const { local, localPath } = await loadLocalConfig(cwd);

  const { deduped, log } = deduplicateExtends(
    global?.extends || [],
    project.extends || [],
  );

  // Extension surfaces (hooks/permissions/statusline/output_style):
  // local replaces project entirely if defined (deeper-wins; matches
  // AGENTS.md "All other fields" merge rule).
  const extensions = pickExtensions(project, local);

  return {
    tools: project.tools || global?.tools || [],
    extends: deduped,
    mcp: mergeMcpConfigs(global, project, local),
    ...(project.profile ? { profile: project.profile } : {}),
    ...(project.profiles ? { profiles: project.profiles } : {}),
    ...extensions,
    _sources: {
      ...(global ? { global: getGlobalConfigPath() } : {}),
      project: projectPath,
      chain,
      ...(local ? { local: localPath } : {}),
    },
    _deduplicationLog: log,
  };
}
