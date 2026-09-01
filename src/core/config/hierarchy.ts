/**
 * Config Hierarchy Merging
 * Merges global, project (N-layer monorepo chain), and local configs with deduplication
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parse } from "smol-toml";
import {
  parseProjectTomlConfig,
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
import { discoverConfigContext } from "./discovery.js";
import { mergeConfigChain } from "./merge.js";

/**
 * Merged config with source tracking for debugging
 */
export interface MergedConfig extends AgentSyncConfig {
  _sources: {
    global?: string;
    repoRoot: string;
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
 * Project and global configuration use the current TOML schema.
 */
async function parseConfigFile(configPath: string): Promise<AgentSyncConfig> {
  const content = await readFile(configPath, "utf-8");

  try {
    const toml = parseProjectTomlConfig(content, configPath);
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

type ExtensionSlice = Partial<
  Pick<MergedConfig, "hooks" | "permissions" | "statusline" | "output_style">
>;

/**
 * Pick extension surfaces from local, project, then global. A defined deeper
 * value replaces the outer value entirely.
 */
function pickExtensions(
  global: AgentSyncConfig | null,
  project: AgentSyncConfig,
  local: LocalConfig | null,
): ExtensionSlice {
  const hooks = local?.hooks ?? project.hooks ?? global?.hooks;
  const permissions =
    local?.permissions ?? project.permissions ?? global?.permissions;
  const statusline =
    local?.statusline ?? project.statusline ?? global?.statusline;
  const outputStyle =
    local?.output_style ?? project.output_style ?? global?.output_style;
  return {
    ...(hooks !== undefined ? { hooks } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
    ...(statusline !== undefined ? { statusline } : {}),
    ...(outputStyle !== undefined ? { output_style: outputStyle } : {}),
  };
}

/**
 * Load and merge config hierarchy: global → project chain → local
 * Returns merged config with deduplication applied
 */
export async function loadConfigHierarchy(cwd: string): Promise<MergedConfig> {
  const global = await loadGlobalConfig();
  const { chain, repoRoot } = await discoverConfigContext(cwd);

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
  const { local, localPath } = await loadLocalConfig(cwd);

  const { deduped, log } = deduplicateExtends(
    global?.extends || [],
    project.extends || [],
  );

  // Extension surfaces (hooks/permissions/statusline/output_style):
  // local replaces project entirely if defined (deeper-wins; matches
  // AGENTS.md "All other fields" merge rule).
  const extensions = pickExtensions(global, project, local);
  const profiles = { ...global?.profiles, ...project.profiles };

  return {
    tools: project.tools ?? global?.tools ?? [],
    extends: deduped,
    mcp: mergeMcpConfigs(global, project, local),
    ...(Object.keys(profiles).length > 0 ? { profiles } : {}),
    ...extensions,
    _sources: {
      ...(global ? { global: getGlobalConfigPath() } : {}),
      repoRoot,
      chain,
      ...(local ? { local: localPath } : {}),
    },
    _deduplicationLog: log,
  };
}
