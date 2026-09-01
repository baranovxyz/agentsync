/**
 * Config Show Command
 * Dumps the full resolved configuration as JSON to stdout.
 * Useful for AI agents to inspect current state.
 */

import type { MergedConfig } from "../../core/config/hierarchy.js";
import { resolveConfig } from "../../core/config/resolve.js";

export interface ConfigShowOptions {
  cwd?: string;
  profile?: string;
}

/**
 * Load and return the full resolved configuration.
 *
 * @param options - Additional options
 * @returns The resolved AgentSyncConfig
 */
export async function configShow(
  options: ConfigShowOptions = {},
): Promise<MergedConfig> {
  return resolveConfig(options);
}
