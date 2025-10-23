/**
 * MCP Sync Command
 * Main workflow: load → filter → substitute → validate → sync
 */

import {
  filterSelectedMCPs,
  loadProjectConfig,
} from "../../core/mcp/config.js";
import { loadEnv } from "../../core/mcp/env.js";
import { loadGlobalRegistry } from "../../core/mcp/registry.js";
import { substituteAllMCPs, validateTokens } from "../../core/mcp/tokens.js";
import { detectMCPTargets, getMCPTarget } from "../../targets/mcp-index.js";

/**
 * Sync options
 */
export interface SyncMCPOptions {
  /** Sync only to specific tool */
  tool?: string;
  /** Dry run mode (no files written) */
  dryRun?: boolean;
}

/**
 * Sync MCP configurations to detected targets
 * @param options - Sync options
 */
export async function syncMCP(options: SyncMCPOptions = {}): Promise<void> {
  // 1. Load global registry
  const globalRegistry = await loadGlobalRegistry();

  // 2. Load project config
  const projectConfig = await loadProjectConfig();

  // 3. Filter selected MCPs
  const selectedMCPs = filterSelectedMCPs(globalRegistry, projectConfig);

  // 4. Load environment variables (process.env + .env file)
  const env = await loadEnv();

  // 5. Substitute tokens
  const substitutedMCPs = substituteAllMCPs(selectedMCPs, env);

  // 6. Validate all tokens were substituted
  validateTokens(substitutedMCPs);

  // 7. Determine targets
  let targets: Awaited<ReturnType<typeof detectMCPTargets>>;
  if (options.tool) {
    // Specific tool requested
    const target = getMCPTarget(options.tool);
    if (!target) {
      throw new Error(
        `Unknown MCP target: ${options.tool}\n\n` +
          `Available targets: cursor, claude`,
      );
    }
    targets = [target];
  } else {
    // Auto-detect targets
    targets = await detectMCPTargets();

    if (targets.length === 0) {
      throw new Error(
        `No MCP targets detected in current project.\n\n` +
          `Please create a .cursor/ or .claude/ directory first, or specify --tool.`,
      );
    }
  }

  // 8. Sync to targets (skip if dry run)
  if (!options.dryRun) {
    for (const target of targets) {
      await target.syncMCP(substitutedMCPs);
    }
  }
}
