/**
 * Shared configuration creation utilities
 * Single source of truth for creating .agentsync/config.json
 */

import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import type { AgentSyncConfig } from "../types/schemas.js";
import { outputFile } from "./fs.js";

/**
 * Create default project configuration
 * Used by init and mcp list commands
 */
export function createDefaultConfig(options?: {
  tools?: string[];
}): AgentSyncConfig {
  return {
    version: "1.0",
    extends: [],
    mcpServers: [],
    tools: (options?.tools || ["cursor", "claude"]) as any,
    useSymlinks: true,
  };
}

/**
 * Ensure .agentsync directory and create config.json
 * @param cwd - Working directory (defaults to process.cwd())
 * @param options - Configuration options
 */
export async function ensureProjectConfig(
  cwd?: string,
  options?: { tools?: string[] },
): Promise<AgentSyncConfig> {
  const workDir = cwd || process.cwd();
  const agentSyncDir = path.join(workDir, ".agentsync");
  const configPath = path.join(agentSyncDir, "config.json");

  // Create directory structure
  await mkdir(agentSyncDir, { recursive: true });

  // Create default config
  const config = createDefaultConfig(options);

  // Write to file
  await outputFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf-8",
  });

  return config;
}
