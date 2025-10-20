/**
 * Project MCP Configuration Loader & Merger
 * Loads .agentsync.json and filters/merges selected MCPs
 */

import { readFile } from 'node:fs/promises';
import { pathExists } from 'fs-extra';
import * as path from 'path';
import type { MCP } from './tokens.js';

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
 * Load project MCP configuration
 * @param configPath - Optional custom path (defaults to .agentsync.json in cwd)
 * @returns Project configuration (empty mcpServers arrays/objects are valid)
 * @throws Error if config doesn't exist or is invalid
 */
export async function loadProjectConfig(configPath?: string): Promise<ProjectMCPConfig> {
  const filepath = configPath || path.join(process.cwd(), '.agentsync.json');

  // Check if file exists
  if (!(await pathExists(filepath))) {
    throw new Error(
      `Project configuration not found at: ${filepath}\n\n` +
        `Run 'agentsync mcp init' to create it.`
    );
  }

  // Read and parse JSON
  let config: unknown;
  try {
    const content = await readFile(filepath, 'utf-8');
    config = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse project configuration: ${(error as Error).message}`);
  }

  // Validate structure
  if (typeof config !== 'object' || config === null) {
    throw new Error('Project configuration must be an object');
  }

  const configObj = config as Record<string, unknown>;

  // Check for mcpServers field
  if (!configObj.mcpServers) {
    throw new Error(`Project configuration missing 'mcpServers' field`);
  }

  // Validate mcpServers is array or object (empty arrays/objects are valid)
  if (
    !Array.isArray(configObj.mcpServers) &&
    (typeof configObj.mcpServers !== 'object' || configObj.mcpServers === null)
  ) {
    throw new Error(`'mcpServers' must be an array or object`);
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
        const available = Object.keys(globalRegistry).join(', ');
        throw new Error(
          `MCP server '${serverName}' not found in global registry.\n\n` +
            `Available MCPs: ${available}`
        );
      }

      // Deep clone to avoid mutation
      result[serverName] = JSON.parse(JSON.stringify(globalRegistry[serverName]));
    }
  }
  // Handle object format: {github: true, postgres: {...}}
  else {
    for (const [serverName, value] of Object.entries(config.mcpServers)) {
      if (!globalRegistry[serverName]) {
        const available = Object.keys(globalRegistry).join(', ');
        throw new Error(
          `MCP server '${serverName}' not found in global registry.\n\n` +
            `Available MCPs: ${available}`
        );
      }

      // If value is true, use global config as-is
      if (value === true) {
        result[serverName] = JSON.parse(JSON.stringify(globalRegistry[serverName]));
      }
      // If value is object, merge with global config
      else if (typeof value === 'object' && value !== null) {
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
