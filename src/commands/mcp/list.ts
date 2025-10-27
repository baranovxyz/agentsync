/**
 * MCP List Command
 * Lists available vs active MCP servers
 */

import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import picocolors from "picocolors";
import { loadProjectConfig } from "../../core/mcp/config.js";
import { loadGlobalRegistry } from "../../core/mcp/registry.js";
import { outputFile } from "../../utils/fs.js";

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

  // Ensure .agentsync directory exists
  await mkdir(path.join(process.cwd(), ".agentsync"), { recursive: true });

  const configPath = path.join(process.cwd(), ".agentsync", "config.json");
  const config = {
    version: "1.0",
    tools: ["cursor", "claude"],
    mcpServers: [],
  };

  await outputFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf-8",
  });

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

  // 2. Determine active MCPs
  let activeMCPs: string[] = [];

  if (!options.ignoreProjectConfig) {
    try {
      const projectConfig = await loadProjectConfig();

      // Extract active MCP names
      if (Array.isArray(projectConfig.mcpServers)) {
        activeMCPs = projectConfig.mcpServers;
      } else {
        activeMCPs = Object.keys(projectConfig.mcpServers);
      }
    } catch (error) {
      // If no project config, auto-create with helpful message
      if ((error as Error).message.includes("MCP configuration not found")) {
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
  for (const [name, mcp] of Object.entries(globalRegistry)) {
    const isActive = activeMCPs.includes(name);

    result.mcps[name] = {
      active: isActive,
      command: mcp.command,
      args: mcp.args,
      env: mcp.env,
    };

    if (!isActive) {
      result.inactive.push(name);
    }
  }

  // Print a simple list for CLI output used by shell tests
  const lines: string[] = [];
  lines.push("Available MCP servers:");
  for (const name of Object.keys(globalRegistry)) {
    const status = activeMCPs.includes(name) ? pc.green("active") : pc.gray("inactive");
    lines.push(`- ${name} (${status})`);
  }
  // Only print when invoked directly via CLI (stdout expected by tests)
  if (typeof process !== "undefined" && process.stdout) {
    console.log(lines.join("\n"));
  }

  return result;
}
