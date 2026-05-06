/**
 * Shared configuration creation utilities
 * Single source of truth for creating .agents/agentsync.toml
 */

import * as path from "node:path";
import { DEFAULT_TOOLS } from "../constants.js";
import type { ToolName } from "../types/index.js";
import type { AgentSyncConfig } from "../types/schemas.js";
import { outputFile } from "./fs.js";

/**
 * Create default project configuration
 * Used by init and mcp list commands
 */
function createDefaultConfig(options?: {
  tools?: ToolName[];
}): AgentSyncConfig {
  return {
    tools: options?.tools || [...DEFAULT_TOOLS],
  };
}

/**
 * Generate TOML config string from tool list
 */
export function generateTomlConfig(tools: ToolName[]): string {
  const toolsList = tools.map((t) => `"${t}"`).join(", ");
  return `tools = [${toolsList}]\n`;
}

/**
 * Ensure .agents directory and create agentsync.toml
 * @param cwd - Working directory (defaults to process.cwd())
 * @param options - Configuration options
 */
export async function ensureProjectConfig(
  cwd?: string,
  options?: { tools?: ToolName[] },
): Promise<AgentSyncConfig> {
  const workDir = cwd || process.cwd();
  const configPath = path.join(workDir, ".agents", "agentsync.toml");

  // Create default config (outputFile creates parent dirs automatically)
  const config = createDefaultConfig(options);

  // Write TOML config (tools is always set by createDefaultConfig)
  await outputFile(
    configPath,
    generateTomlConfig(config.tools ?? [...DEFAULT_TOOLS]),
    {
      encoding: "utf-8",
    },
  );

  return config;
}
