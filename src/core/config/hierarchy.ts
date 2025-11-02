/**
 * Config Hierarchy Merging
 * Merges global, project, and local configs with deduplication
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import picocolors from "picocolors";
import type { AgentSyncConfig } from "../../types/index.js";
import { validateConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";
import {
  getGlobalConfigPath,
  loadGlobalConfig,
} from "../../utils/global-config.js";
import { ConfigError } from "../errors.js";

const pc = picocolors;

/**
 * Merged config with source tracking for debugging
 */
export interface MergedConfig extends AgentSyncConfig {
  _sources: {
    global?: string;
    project: string;
    local?: string;
  };
  _deduplicationLog: Array<{
    source: string;
    kept: "global" | "project";
    message: string;
  }>;
}

/**
 * Extract source URL from extends entry (handles both string and object forms)
 */
function getSourceUrl(
  ext:
    | string
    | {
        source: string;
        namespace: string;
        include?: string[];
        exclude?: string[];
      },
): string {
  return typeof ext === "string" ? ext : ext.source;
}

/**
 * Load and merge config hierarchy: global → project → local
 * Returns merged config with deduplication applied
 */
export async function loadConfigHierarchy(cwd: string): Promise<MergedConfig> {
  // 1. Load configs
  const global = await loadGlobalConfig();
  const projectPath = path.join(cwd, ".agentsync", "config.json");

  if (!(await pathExists(projectPath))) {
    throw new ConfigError(
      "Project config not found",
      projectPath,
      'Run "agentsync init" to initialize',
    );
  }

  let project: AgentSyncConfig;
  try {
    const projectContent = await readFile(projectPath, "utf-8");
    project = validateConfig(JSON.parse(projectContent));
  } catch (error) {
    throw new ConfigError(
      `Invalid project config: ${(error as Error).message}`,
      projectPath,
      "Check your .agentsync/config.json for syntax errors",
    );
  }

  const localPath = path.join(cwd, "agentsync.local.json");
  let local: Partial<AgentSyncConfig> | null = null;
  if (await pathExists(localPath)) {
    try {
      const localContent = await readFile(localPath, "utf-8");
      local = JSON.parse(localContent);
    } catch (error) {
      throw new ConfigError(
        `Invalid local config: ${(error as Error).message}`,
        localPath,
        "Check your agentsync.local.json for syntax errors",
      );
    }
  }

  // 2. Deduplicate extends by source URL
  const allExtends: Array<
    | string
    | {
        source: string;
        namespace: string;
        include?: string[];
        exclude?: string[];
      }
  > = [...(global?.extends || []), ...(project.extends || [])];

  // Group by source URL
  const bySource = new Map<
    string,
    Array<
      | string
      | {
          source: string;
          namespace: string;
          include?: string[];
          exclude?: string[];
        }
    >
  >();
  for (const ext of allExtends) {
    const source = getSourceUrl(ext);
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(ext);
  }

  // Deduplicate: project wins (last occurrence)
  const deduped: Array<
    | string
    | {
        source: string;
        namespace: string;
        include?: string[];
        exclude?: string[];
      }
  > = [];
  const deduplicationLog: Array<{
    source: string;
    kept: "global" | "project";
    message: string;
  }> = [];

  for (const [source, defs] of bySource) {
    if (defs.length > 1) {
      // Found in both - use project version (last in array)
      const kept = defs[defs.length - 1];
      deduped.push(kept);

      console.log(
        pc.gray(`ℹ️  Preset '${source}' defined in both global and project. `) +
          pc.cyan("Using project version."),
      );

      deduplicationLog.push({
        source,
        kept: "project",
        message: `Preset '${source}' appeared in both global and project configs, project version used`,
      });
    } else {
      deduped.push(defs[0]);
    }
  }

  // 3. Merge
  const merged: MergedConfig = {
    version: project.version,
    tools: project.tools || global?.tools || [],
    extends: deduped as AgentSyncConfig["extends"],
    mcpServers: local?.mcpServers ?? project.mcpServers ?? global?.mcpServers,
    security: project.security || global?.security,
    useSymlinks: project.useSymlinks ?? global?.useSymlinks ?? true,
    _sources: {
      ...(global ? { global: getGlobalConfigPath() } : {}),
      project: projectPath,
      ...(local ? { local: localPath } : {}),
    },
    _deduplicationLog: deduplicationLog,
  };

  return merged;
}
