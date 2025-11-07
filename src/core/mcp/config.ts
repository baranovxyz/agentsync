/**
 * Project MCP Configuration Loader & Merger
 * Loads agentsync.local.json (or fallback locations) and filters/merges selected MCPs
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "../../utils/fs.js";
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
 * Get MCP config file paths with load priority:
 * 1. agentsync.local.json (user-local overrides, gitignored)
 * 2. .agentsync/config.json (project config)
 */
async function getMCPConfigPaths(): Promise<{
  project: string | null;
  local: string | null;
}> {
  const cwd = process.cwd();

  const projectPath = path.join(cwd, ".agentsync", "config.json");
  const localPath = path.join(cwd, "agentsync.local.json");

  return {
    project: (await pathExists(projectPath)) ? projectPath : null,
    local: (await pathExists(localPath)) ? localPath : null,
  };
}

/**
 * Load and merge MCP configuration from project and local files
 * Merge strategy (Option A): Local mcpServers replaces project mcpServers entirely
 * @param configPath - Optional custom path (defaults to auto-detect with fallback)
 * @returns Merged configuration (empty mcpServers arrays/objects are valid)
 * @throws Error if no config found or config is invalid
 */
export async function loadProjectConfig(
  configPath?: string,
): Promise<ProjectMCPConfig> {
  if (configPath) {
    // Custom path provided - load single file
    if (!(await pathExists(configPath))) {
      throw new Error(`MCP configuration not found at: ${configPath}`);
    }
    return loadConfigFile(configPath);
  }

  // Auto-detect: load both project and local configs, merge with Option A strategy
  const paths = await getMCPConfigPaths();

  if (!(paths.project || paths.local)) {
    throw new Error(
      `MCP configuration not found.\n\n` +
        `Expected one of:\n` +
        `  - .agentsync/config.json (team config, committed)\n` +
        `  - agentsync.local.json (personal overrides, gitignored)\n\n` +
        `Create .agentsync/config.json with:\n` +
        `  {"version": "1.0", "tools": ["cursor", "claude"], "mcpServers": []}\n\n` +
        `Or run 'agentsync init' to set up the project.`,
    );
  }

  // Load project config (if exists)
  let projectConfig: ProjectMCPConfig | null = null;
  if (paths.project) {
    projectConfig = await loadConfigFile(paths.project);
  }

  // Load local config (if exists) - allow missing mcpServers in local config
  let localConfig: ProjectMCPConfig | null = null;
  if (paths.local) {
    localConfig = await loadConfigFileOptional(paths.local);
  }

  // Merge: Option A - Local replaces project's mcpServers entirely
  if (localConfig?.mcpServers) {
    // Local config has mcpServers: use it, ignore project
    return {
      tools: localConfig.tools || projectConfig?.tools,
      mcpServers: localConfig.mcpServers,
    };
  }

  // No local config or local config has no mcpServers: use project
  if (projectConfig) {
    return projectConfig;
  }

  // Should never reach here due to early check above
  throw new Error("MCP configuration not found");
}

/**
 * Load and validate a single config file
 * @param filepath - Path to config file
 * @returns Parsed configuration
 * @throws Error if file is invalid
 */
async function loadConfigFile(filepath: string): Promise<ProjectMCPConfig> {
  // Read and parse JSON
  let config: unknown;
  try {
    const content = await readFile(filepath, "utf-8");
    config = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse MCP configuration at ${filepath}: ${(error as Error).message}`,
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
        `  agentsync mcp list`,
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
        `  echo '{"mcpServers": []}' > ${filepath}`,
    );
  }

  return config as ProjectMCPConfig;
}

/**
 * Load and validate a single config file (optional mcpServers)
 * Used for local config files where mcpServers is optional
 * @param filepath - Path to config file
 * @returns Parsed configuration with optional mcpServers, or null if parsing fails
 */
async function loadConfigFileOptional(
  filepath: string,
): Promise<ProjectMCPConfig | null> {
  // Read and parse JSON
  let config: unknown;
  try {
    const content = await readFile(filepath, "utf-8");
    config = JSON.parse(content);
  } catch (_error) {
    // Ignore parse errors for optional files
    return null;
  }

  // Validate structure
  if (typeof config !== "object" || config === null) {
    return null;
  }

  const configObj = config as Record<string, unknown>;

  // mcpServers is optional for local config
  // If it exists, validate it
  if (configObj.mcpServers) {
    if (
      !Array.isArray(configObj.mcpServers) &&
      (typeof configObj.mcpServers !== "object" ||
        configObj.mcpServers === null)
    ) {
      // Invalid type, but don't throw - just ignore
      return null;
    }
  }

  // Return partial config (mcpServers may be undefined)
  return {
    tools: configObj.tools as string[] | undefined,
    mcpServers: configObj.mcpServers as
      | string[]
      | Record<string, boolean | Partial<MCP>>
      | undefined,
  } as ProjectMCPConfig;
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
  config: ProjectMCPConfig,
): Record<string, MCP> {
  const result: Record<string, MCP> = {};

  // Handle array format: ["github", "postgres"]
  if (Array.isArray(config.mcpServers)) {
    for (const serverName of config.mcpServers) {
      if (!globalRegistry[serverName]) {
        const available = Object.keys(globalRegistry).join(", ");
        throw new Error(
          `MCP server '${serverName}' not found in global registry.\n\n` +
            `Available MCPs: ${available}`,
        );
      }

      // Deep clone to avoid mutation
      result[serverName] = JSON.parse(
        JSON.stringify(globalRegistry[serverName]),
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
            `Available MCPs: ${available}`,
        );
      }

      // If value is true, use global config as-is
      if (value === true) {
        result[serverName] = JSON.parse(
          JSON.stringify(globalRegistry[serverName]),
        );
      }
      // If value is object, merge with global config
      else if (typeof value === "object" && value !== null) {
        const global = globalRegistry[serverName];

        // Only command-based MCPs can be merged
        if ("command" in global) {
          result[serverName] = {
            command: global.command,
            args: [...global.args],
            // Merge env variables (override takes precedence)
            env: {
              ...(global.env || {}),
              ...("env" in value && value.env ? value.env : {}),
            },
          };
        } else {
          // URL-based MCP - can't merge, use global as-is
          result[serverName] = JSON.parse(JSON.stringify(global));
        }
      }
    }
  }

  return result;
}

/**
 * Determine active MCP servers from merged config registry and enabled/disabled filters
 * OPT-IN: Only servers explicitly listed in mcpEnabled are active
 * @param registry - Merged MCP server registry from config hierarchy
 * @param mcpEnabled - Servers to enable (REQUIRED for any servers to be active)
 * @param mcpDisabled - Servers to disable (overrides mcpEnabled)
 * @returns Record of active MCP server configs
 */
export function getActiveMCPs(
  registry: Record<string, unknown>,
  mcpEnabled?: string[],
  mcpDisabled?: string[],
): Record<string, unknown> {
  // OPT-IN: Only explicitly enabled servers (empty/undefined = no servers)
  const enabledServers = mcpEnabled || [];

  // Filter out disabled servers (disabled wins)
  const disabledServers = new Set(mcpDisabled || []);
  const activeServers = enabledServers.filter(
    (name) => !disabledServers.has(name),
  );

  // Build active MCP configs
  const activeMCPs: Record<string, unknown> = {};
  for (const name of activeServers) {
    if (registry[name]) {
      activeMCPs[name] = registry[name];
    }
  }

  return activeMCPs;
}
