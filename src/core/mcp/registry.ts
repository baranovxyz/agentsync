/**
 * Global MCP Registry Loader
 * Loads ~/.agentsync/mcp.json
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { MCP } from './tokens.js';

/**
 * Get the default global registry path
 */
export function getGlobalRegistryPath(): string {
  const home = os.homedir();
  return path.join(home, '.agentsync', 'mcp.json');
}

/**
 * Validate MCP configuration structure
 */
function validateMCP(name: string, mcp: unknown): mcp is MCP {
  if (typeof mcp !== 'object' || mcp === null) {
    throw new Error(`Invalid MCP configuration for '${name}': must be an object`);
  }

  const mcpObj = mcp as Record<string, unknown>;

  if (typeof mcpObj.command !== 'string') {
    throw new Error(`Invalid MCP configuration for '${name}': missing 'command' field`);
  }

  if (!Array.isArray(mcpObj.args)) {
    throw new Error(`Invalid MCP configuration for '${name}': missing or invalid 'args' field`);
  }

  if (mcpObj.env !== undefined) {
    if (typeof mcpObj.env !== 'object' || mcpObj.env === null) {
      throw new Error(`Invalid MCP configuration for '${name}': 'env' must be an object`);
    }
  }

  return true;
}

/**
 * Load global MCP registry
 * @param registryPath - Optional custom path (defaults to ~/.agentsync/mcp.json)
 * @returns Record of MCP configurations
 * @throws Error if registry doesn't exist, is invalid JSON, or has invalid structure
 */
export async function loadGlobalRegistry(
  registryPath?: string
): Promise<Record<string, MCP>> {
  const filepath = registryPath || getGlobalRegistryPath();

  // Check if file exists
  if (!(await fs.pathExists(filepath))) {
    throw new Error(
      `Global MCP registry not found at: ~/.agentsync/mcp.json\n\n` +
        `Please create it with your MCP server configurations.\n` +
        `Example:\n` +
        `{\n` +
        `  "github": {\n` +
        `    "command": "npx",\n` +
        `    "args": ["-y", "@modelcontextprotocol/server-github"],\n` +
        `    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }\n` +
        `  }\n` +
        `}`
    );
  }

  // Read and parse JSON
  let registry: unknown;
  try {
    registry = await fs.readJson(filepath);
  } catch (error) {
    throw new Error(
      `Failed to parse global MCP registry at ${filepath}: ${(error as Error).message}`
    );
  }

  // Validate it's an object
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new Error(`Global MCP registry must be an object, got ${typeof registry}`);
  }

  const registryObj = registry as Record<string, unknown>;

  // Check if empty
  if (Object.keys(registryObj).length === 0) {
    throw new Error(
      `Global MCP registry is empty at ${filepath}\n\n` +
        `Please add at least one MCP server configuration.`
    );
  }

  // Validate each MCP
  const validatedRegistry: Record<string, MCP> = {};
  for (const [name, mcp] of Object.entries(registryObj)) {
    validateMCP(name, mcp);
    validatedRegistry[name] = mcp as MCP;
  }

  return validatedRegistry;
}
