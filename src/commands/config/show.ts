/**
 * Config Show Command
 * Dumps the full resolved configuration as JSON to stdout.
 * Useful for AI agents to inspect current state.
 */

import { loadProjectConfig } from "../../config/load-project-config.js";
import type { AgentSyncConfig } from "../../types/schemas.js";

export interface ConfigShowOptions {
  cwd?: string;
}

/**
 * Load and return the full resolved configuration.
 * Uses dual-read shim: tries TOML first, falls back to JSON with deprecation warning.
 *
 * @param options - Additional options
 * @returns The resolved AgentSyncConfig
 */
export async function configShow(
  options: ConfigShowOptions = {},
): Promise<AgentSyncConfig> {
  const cwd = options.cwd || process.cwd();
  const { config } = await loadProjectConfig(cwd);
  return config;
}
