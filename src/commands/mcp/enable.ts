/**
 * MCP Enable Command
 * Enables MCP servers with support for:
 * - Ephemeral mode: inline config → sync to tool only
 * - Persistent mode: inline config → save to config → sync
 * - Registry mode: lookup in config hierarchy → sync
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  type ResolveMCPOptions,
  resolveMCPConfig,
} from "../../core/mcp/resolver.js";
import type { MCP } from "../../core/mcp/tokens.js";
import { getConvertersForTools } from "../../targets/tools/index.js";
import type { ToolConverterName } from "../../targets/tools/types.js";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";

export interface EnableMCPOptions {
  // Inline config sources (ephemeral or persistent)
  json?: string;
  transport?: "stdio" | "http" | "sse";
  preset?: string;

  // For transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  url?: string;

  // For HTTP/SSE
  transportUrl?: string;

  // Target tool (required for ephemeral, optional for persistent)
  tool?: ToolConverterName;

  // Scope for persistent mode (global/project)
  scope?: "global" | "project";

  // Force overwrite if server exists
  force?: boolean;
}

export interface EnableMCPResult {
  enabled: boolean;
  serverName: string;
  mode: "ephemeral" | "persistent" | "registry";
  savedToConfig?: boolean;
  syncedToTools?: string[];
}

/**
 * Enable MCP server with support for multiple modes
 * @param serverName - MCP server name
 * @param options - Enable options
 * @returns Enable result
 */
export async function enableMCP(
  serverName: string,
  options: EnableMCPOptions,
): Promise<EnableMCPResult> {
  // Detect mode: inline config flags present?
  const hasInlineConfig = options.json || options.transport || options.preset;

  if (hasInlineConfig) {
    // Ephemeral or persistent mode
    return enableMCPWithInlineConfig(serverName, options);
  } else {
    // Registry mode (existing behavior, fallback)
    return enableMCPFromRegistry(serverName, options);
  }
}

/**
 * Enable MCP with inline config (ephemeral or persistent)
 */
async function enableMCPWithInlineConfig(
  serverName: string,
  options: EnableMCPOptions,
): Promise<EnableMCPResult> {
  // Resolve MCP config from inline sources
  const resolveOptions: ResolveMCPOptions = {
    json: options.json,
    transport: options.transport,
    preset: options.preset,
    command: options.command,
    args: options.args,
    env: options.env,
    headers: options.headers,
    url: options.transportUrl || options.url,
  };

  const mcpConfig = resolveMCPConfig(resolveOptions);

  // Determine if ephemeral or persistent
  const isPersistent = !!options.scope;

  if (isPersistent) {
    // Persistent: save to config + sync
    return enableMCPPersistent(serverName, mcpConfig, options);
  } else {
    // Ephemeral: sync only (no --tool means error)
    if (!options.tool) {
      throw new Error(
        "Ephemeral mode requires --tool flag. " +
          "Example: agentsync mcp enable tracker --tool claude --json '...'",
      );
    }
    return enableMCPEphemeral(serverName, mcpConfig, options.tool);
  }
}

/**
 * Ephemeral mode: inline config → sync to tool
 */
async function enableMCPEphemeral(
  serverName: string,
  mcpConfig: MCP,
  tool: ToolConverterName,
): Promise<EnableMCPResult> {
  const cwd = process.cwd();
  const converters = getConvertersForTools([tool]);

  if (converters.length === 0) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  const codec = converters[0];
  await codec.addMCP(serverName, mcpConfig, cwd, true);

  return {
    enabled: true,
    serverName,
    mode: "ephemeral",
    syncedToTools: [tool],
  };
}

/**
 * Persistent mode: save to config + sync
 */
async function enableMCPPersistent(
  serverName: string,
  mcpConfig: MCP,
  options: EnableMCPOptions,
): Promise<EnableMCPResult> {
  const cwd = process.cwd();
  const scope = options.scope || "project";

  // Determine config path
  let configPath: string;
  if (scope === "global") {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error("Cannot determine home directory for global config");
    }
    configPath = path.join(homeDir, ".agentsync", "config.json");
  } else {
    configPath = path.join(cwd, ".agentsync", "config.json");
  }

  // Load or create config
  let config: AgentSyncConfig;
  if (await pathExists(configPath)) {
    const content = await readFile(configPath, "utf-8");
    config = JSON.parse(content);
  } else {
    config = {
      version: "1.0",
      tools: ["claude"],
      mcpServers: {},
      useSymlinks: true,
    };
  }

  // Ensure mcpServers exists
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  // Check if exists
  if (config.mcpServers[serverName] && !options.force) {
    throw new Error(
      `MCP server '${serverName}' already defined in config. Use --force to overwrite.`,
    );
  }

  // Add to registry
  config.mcpServers[serverName] = mcpConfig;

  // Add to mcpEnabled if not present
  if (!config.mcpEnabled) {
    config.mcpEnabled = [];
  }
  if (!config.mcpEnabled.includes(serverName)) {
    config.mcpEnabled.push(serverName);
  }

  // Ensure config dir exists
  const configDir = path.dirname(configPath);
  if (!(await pathExists(configDir))) {
    // Create it (would need mkdir util)
    throw new Error(`Config directory does not exist: ${configDir}`);
  }

  // Save config
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  // Auto-sync to tools in config (or specified tool)
  const toolsToSync = options.tool
    ? [options.tool]
    : config.tools || ["claude"];
  const converters = getConvertersForTools(toolsToSync);

  for (const codec of converters) {
    try {
      await codec.addMCP(serverName, mcpConfig, cwd, options.force);
    } catch (_error) {
      // Some tools may not support MCP, continue
    }
  }

  return {
    enabled: true,
    serverName,
    mode: "persistent",
    savedToConfig: true,
    syncedToTools: toolsToSync,
  };
}

/**
 * Registry mode: lookup in config hierarchy + sync
 */
async function enableMCPFromRegistry(
  serverName: string,
  options: EnableMCPOptions,
): Promise<EnableMCPResult> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, ".agentsync", "config.json");

  if (!(await pathExists(configPath))) {
    throw new Error(
      "Project config not found at .agentsync/config.json\n\n" +
        'Run "agentsync init" to initialize the project.',
    );
  }

  // Load config
  const content = await readFile(configPath, "utf-8");
  const config: AgentSyncConfig = JSON.parse(content);

  // Validate server exists in registry
  if (!config.mcpServers?.[serverName]) {
    throw new Error(
      `MCP server '${serverName}' not found in config.mcpServers.\n\n` +
        `Add the server definition to .agentsync/config.json first:\n\n` +
        `  "mcpServers": {\n` +
        `    "${serverName}": {\n` +
        `      "command": "npx",\n` +
        `      "args": ["-y", "@modelcontextprotocol/server-${serverName}"],\n` +
        `      "env": {}\n` +
        `    }\n` +
        `  }`,
    );
  }

  // Initialize mcpEnabled if needed
  if (!config.mcpEnabled) {
    config.mcpEnabled = [];
  }

  // Check if already enabled
  if (config.mcpEnabled.includes(serverName)) {
    // Just sync to tool (could still be useful to ensure tool config is updated)
  } else {
    // Add to mcpEnabled
    config.mcpEnabled.push(serverName);

    // Save config
    await writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf-8",
    );
  }

  // Sync to tools
  const toolsToSync = options.tool
    ? [options.tool]
    : config.tools || ["claude"];
  const mcpConfig = config.mcpServers[serverName];
  const converters = getConvertersForTools(toolsToSync);

  for (const codec of converters) {
    try {
      await codec.addMCP(serverName, mcpConfig, cwd, options.force);
    } catch (_error) {
      // Some tools may not support MCP, continue
    }
  }

  return {
    enabled: true,
    serverName,
    mode: "registry",
    syncedToTools: toolsToSync,
  };
}
