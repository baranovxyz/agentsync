/**
 * MCP List Command
 * Lists available vs active MCP servers
 */

import picocolors from "picocolors";
import { loadConfigHierarchy } from "../../core/config/hierarchy.js";
import { getActiveMCPs } from "../../core/mcp/config.js";
import { loadGlobalRegistry } from "../../core/mcp/registry.js";
import type { MCP } from "../../core/mcp/tokens.js";
import { ensureProjectConfig } from "../../utils/config-creation.js";

const pc = picocolors;

/**
 * Auto-create empty MCP configuration with helpful onboarding
 */
async function autoCreateMCPConfig(): Promise<void> {
  console.log(pc.yellow("⚠ No MCP configuration found\n"));
  console.log(
    pc.gray(
      "Creating .agentsync/config.json with empty MCP configuration...\n",
    ),
  );

  await ensureProjectConfig();

  console.log(pc.green("✓ Created .agentsync/config.json\n"));
}

/**
 * List options
 */
export interface ListMCPOptions {
  /** Ignore project config and show all as inactive */
  ignoreProjectConfig?: boolean;
}

/**
 * MCP list result
 */
export interface ListMCPResult {
  /** Total number of MCPs in global registry */
  total: number;
  /** Active MCP names */
  active: string[];
  /** Inactive MCP names */
  inactive: string[];
  /** MCP details with active status */
  mcps: Record<
    string,
    {
      active: boolean;
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

/**
 * List available and active MCP servers
 * @param options - List options
 * @returns List result with active/inactive MCPs
 */
export async function listMCP(
  options: ListMCPOptions = {},
): Promise<ListMCPResult> {
  // 1. Load global registry
  const globalRegistry = await loadGlobalRegistry();

  // 2. Determine active MCPs from config hierarchy
  let activeMCPs: string[] = [];
  let activeMCPConfigs: Record<string, unknown> = {};

  if (!options.ignoreProjectConfig) {
    try {
      // Load merged config hierarchy (global → project → local)
      const config = await loadConfigHierarchy(process.cwd());

      // Extract mcpServers registry from merged config
      // The merged registry already contains final MCP definitions from global + project + local
      const registry = config.mcpServers || {};

      // Use shared logic to determine active servers (matches sync.ts)
      activeMCPConfigs = getActiveMCPs(
        registry,
        config.mcpEnabled,
        config.mcpDisabled,
      );
      activeMCPs = Object.keys(activeMCPConfigs);
    } catch (error) {
      // If no project config, auto-create with helpful message
      if (
        (error as Error).message.includes("Project config not found") ||
        (error as Error).message.includes("MCP configuration not found")
      ) {
        await autoCreateMCPConfig();
        // Continue with empty activeMCPs
      } else {
        throw error;
      }
    }
  }

  // 3. Build result
  const result: ListMCPResult = {
    total: Object.keys(globalRegistry).length,
    active: activeMCPs,
    inactive: [],
    mcps: {},
  };

  // 4. Populate MCP details
  // Show all servers from global registry, but use merged config values for active ones
  for (const [name, globalMcp] of Object.entries(globalRegistry)) {
    const isActive = activeMCPs.includes(name);

    // Use merged config value if active, otherwise use global registry config
    // The merged registry may contain overrides from project/local configs
    const mcpValue =
      isActive && activeMCPConfigs[name]
        ? (activeMCPConfigs[name] as MCP)
        : globalMcp;

    // Only command-based MCPs have command/args/env
    if ("command" in mcpValue) {
      result.mcps[name] = {
        active: isActive,
        command: mcpValue.command,
        args: mcpValue.args,
        env: mcpValue.env,
      };
    } else {
      // URL-based MCP - use url as command for display
      result.mcps[name] = {
        active: isActive,
        command: mcpValue.url,
        args: [],
        env: undefined,
      };
    }

    if (!isActive) {
      result.inactive.push(name);
    }
  }

  // Print a simple list for CLI output used by shell tests
  const lines: string[] = [];
  lines.push("Available MCP servers:");
  for (const name of Object.keys(globalRegistry)) {
    const status = activeMCPs.includes(name)
      ? pc.green("active")
      : pc.gray("inactive");
    lines.push(`- ${name} (${status})`);
  }
  // Only print when invoked directly via CLI (stdout expected by tests)
  if (typeof process !== "undefined" && process.stdout) {
    console.log(lines.join("\n"));
  }

  return result;
}
