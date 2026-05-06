/**
 * Clean Command
 * Removes all synced/generated files from tool directories.
 * Inverse of `agentsync sync` — useful for cleanup, fresh starts, or debugging.
 */

import * as path from "node:path";
import type { ToolName } from "../constants.js";
import { loadConfigHierarchy } from "../core/config/hierarchy.js";
import { ConfigError } from "../core/errors.js";
import { getToolProvider } from "../tools/index.js";
import type { ToolProvider } from "../tools/types.js";
import { pathExists, remove } from "../utils/fs.js";

/**
 * Result of cleaning a single tool's generated files
 */
export interface CleanResult {
  tool: string;
  removedFiles: string[];
  removedDirs: string[];
}

/**
 * Clean command options
 */
export interface CleanOptions {
  cwd?: string;
  dryRun?: boolean;
}

/**
 * Collect the generated file/directory paths for a tool provider.
 * Returns separate lists of files and directories that would be removed.
 */
function getGeneratedPaths(
  provider: ToolProvider,
  cwd: string,
): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];
  const paths = provider.paths;

  // Skills directory (only for holdout tools that don't read .agents/ directly)
  if (paths.skillsDir && !provider.readsAgentsDir) {
    dirs.push(path.join(cwd, paths.skillsDir));
  }

  // Commands directory
  if (paths.commandsDir) {
    dirs.push(path.join(cwd, paths.commandsDir));
  }

  // Agents directory
  if (paths.agentsDir) {
    dirs.push(path.join(cwd, paths.agentsDir));
  }

  // MCP config file
  if (paths.mcpConfigPath) {
    files.push(path.join(cwd, paths.mcpConfigPath));
  }

  // Docs file (CLAUDE.md, GEMINI.md) — only if the tool has docsFormat
  // Tools with docsFormat write a generated docs file; others read AGENTS.md natively
  if (provider.docsFormat) {
    files.push(path.join(cwd, paths.docsFile));
  }

  return { files, dirs };
}

/**
 * Remove generated files and directories for all configured tools.
 * Returns a list of what was removed per tool.
 */
/**
 * Remove existing files/dirs from a list, respecting dry-run mode.
 * Returns the paths that existed (and were removed, or would be removed).
 */
async function removeExistingPaths(
  paths: string[],
  dryRun: boolean,
): Promise<string[]> {
  const removed: string[] = [];
  for (const p of paths) {
    if (await pathExists(p)) {
      if (!dryRun) await remove(p);
      removed.push(p);
    }
  }
  return removed;
}

/**
 * Clean generated files for a single tool provider.
 */
async function cleanTool(
  toolName: ToolName,
  cwd: string,
  dryRun: boolean,
): Promise<CleanResult> {
  const provider = getToolProvider(toolName);
  const { files, dirs } = getGeneratedPaths(provider, cwd);
  return {
    tool: toolName,
    removedFiles: await removeExistingPaths(files, dryRun),
    removedDirs: await removeExistingPaths(dirs, dryRun),
  };
}

export async function cleanCommand(
  options: CleanOptions = {},
): Promise<CleanResult[]> {
  const cwd = options.cwd || process.cwd();
  const dryRun = options.dryRun ?? false;

  let tools: ToolName[];
  try {
    const config = await loadConfigHierarchy(cwd);
    tools = config.tools || [];
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new ConfigError(
        "Cannot clean: no AgentSync configuration found",
        "",
        'Run "agentsync init" to initialize, or ensure .agents/agentsync.toml exists',
      );
    }
    throw error;
  }

  const results = await Promise.all(
    tools.map((toolName) => cleanTool(toolName, cwd, dryRun)),
  );
  return results;
}
