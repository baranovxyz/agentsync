/**
 * Project MCP Configuration Loader & Merger
 * Loads agentsync.local.json (or fallback locations) and filters/merges selected MCPs
 */

import { readFile } from "node:fs/promises";
import { pathExists } from "../../utils/fs.js";
import * as path from "path";
import type { MCP } from "./tokens.js";

/**
 * Project MCP configuration format
 */
export interface ProjectMCPConfig {
  /** Selected AI tools (optional) */
  tools?: string[];

  /** Selected MCP servers - array or object format (empty arrays/objects are valid) */
  mcpServers: string[] | Record<string, boolean | Partial<MCP>>;
}

/**
 * Get MCP config file path with fallback priority:
 * 1. .agentsync/config.json (primary - team config, committed)
 * 2. agentsync.local.json (override - personal overrides, gitignored)
 * 3. .agentsync/config.local.json (backup - hidden directory)
 */
async function getMCPConfigPath(): Promise<string | null> {
  const cwd = process.cwd();

  // Primary: Team-shared config (committed to git)
  const teamPath = path.join(cwd, ".agentsync", "config.json");
  if (await pathExists(teamPath)) {
    return teamPath;
  }

  // Override: Personal overrides (gitignored)
  const localPath = path.join(cwd, "agentsync.local.json");
  if (await pathExists(localPath)) {
    return localPath;
  }

  // Backup: Hidden directory local config
  const backupPath = path.join(cwd, ".agentsync", "config.local.json");
  if (await pathExists(backupPath)) {
    return backupPath;
  }

  return null;
}

/**
 * Load project MCP configuration
 * @param configPath - Optional custom path (defaults to auto-detect with fallback)
 * @returns Project configuration (empty mcpServers arrays/objects are valid)
 * @throws Error if config doesn't exist or is invalid
 */
export async function loadProjectConfig(
  configPath?: string
): Promise<ProjectMCPConfig> {
  let filepath: string | null;

  if (configPath) {
    // Custom path provided
    filepath = configPath;
    if (!(await pathExists(filepath))) {
      throw new Error(`MCP configuration not found at: ${filepath}`);
    }
  } else {
    // Auto-detect with fallback
    filepath = await getMCPConfigPath();
    if (!filepath) {
      throw new Error(
        `MCP configuration not found.\n\n` +
          `Expected one of:\n` +
          `  - .agentsync/config.json (team config, committed)\n` +
          `  - agentsync.local.json (personal overrides, gitignored)\n` +
          `  - .agentsync/config.local.json (backup location)\n\n` +
          `Run 'agentsync init' to create team config, or create agentsync.local.json with:\n` +
          `  {"mcpServers": []}\n\n` +
          `Then use 'agentsync mcp add <server>' to select MCPs.`
      );
    }
  }

  // Read and parse JSON
  let config: unknown;
  try {
    const content = await readFile(filepath, "utf-8");
    config = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse MCP configuration at ${filepath}: ${(error as Error).message}`
    );
  }

  // Validate structure
  if (typeof config !== "object" || config === null) {
    throw new Error(`MCP configuration must be an object at ${filepath}`);
  }

  const configObj = config as Record<string, unknown>;

  // Check for mcpServers field
  if (!configObj.mcpServers) {
    throw new Error(
      `MCP configuration missing 'mcpServers' field\n\n` +
        `File: ${filepath}\n\n` +
        `Expected format:\n` +
        `  {"mcpServers": []}\n\n` +
        `Fix it:\n` +
        `  echo '{"mcpServers": []}' > ${filepath}\n\n` +
        `Or delete the file and run:\n` +
        `  agentsync mcp list`
    );
  }

  // Validate mcpServers is array or object (empty arrays/objects are valid)
  if (
    !Array.isArray(configObj.mcpServers) &&
    (typeof configObj.mcpServers !== "object" || configObj.mcpServers === null)
  ) {
    throw new Error(
      `Invalid 'mcpServers' type\n\n` +
        `File: ${filepath}\n\n` +
        `Expected array or object:\n` +
        `  {"mcpServers": []} or {"mcpServers": {}}\n\n` +
        `Fix it:\n` +
        `  echo '{"mcpServers": []}' > ${filepath}`
    );
  }

  return config as ProjectMCPConfig;
}

/**
 * Filter and merge selected MCPs from global registry
 * @param globalRegistry - All available MCPs
 * @param config - Project configuration
 * @returns Filtered MCPs with overrides applied
 * @throws Error if selected MCP not found in global registry
 */
export function filterSelectedMCPs(
  globalRegistry: Record<string, MCP>,
  config: ProjectMCPConfig
): Record<string, MCP> {
  const result: Record<string, MCP> = {};

  // Handle array format: ["github", "postgres"]
  if (Array.isArray(config.mcpServers)) {
    for (const serverName of config.mcpServers) {
      if (!globalRegistry[serverName]) {
        const available = Object.keys(globalRegistry).join(", ");
        throw new Error(
          `MCP server '${serverName}' not found in global registry.\n\n` +
            `Available MCPs: ${available}`
        );
      }

      // Deep clone to avoid mutation
      result[serverName] = JSON.parse(
        JSON.stringify(globalRegistry[serverName])
      );
    }
  }
  // Handle object format: {github: true, postgres: {...}}
  else {
    for (const [serverName, value] of Object.entries(config.mcpServers)) {
      if (!globalRegistry[serverName]) {
        const available = Object.keys(globalRegistry).join(", ");
        throw new Error(
          `MCP server '${serverName}' not found in global registry.\n\n` +
            `Available MCPs: ${available}`
        );
      }

      // If value is true, use global config as-is
      if (value === true) {
        result[serverName] = JSON.parse(
          JSON.stringify(globalRegistry[serverName])
        );
      }
      // If value is object, merge with global config
      else if (typeof value === "object" && value !== null) {
        const global = globalRegistry[serverName];
        result[serverName] = {
          command: global.command,
          args: [...global.args],
          // Merge env variables (override takes precedence)
          env: {
            ...(global.env || {}),
            ...(value.env || {}),
          },
        };
      }
    }
  }

  return result;
}
