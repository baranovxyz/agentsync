/**
 * Global Config Utilities
 * Manages user-level configuration at ~/.agentsync/config.json
 */

import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentSyncConfig, ToolName } from "../types/index.js";
import { validateConfig } from "../types/schemas.js";
import { ensureDir, outputFile, pathExists } from "./fs.js";

/**
 * Get path to global config file
 */
export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".agentsync", "config.json");
}

/**
 * Get path to global rules directory
 */
export function getGlobalRulesPath(): string {
  return path.join(os.homedir(), ".agentsync", "rules");
}

/**
 * Get path to global commands directory
 */
export function getGlobalCommandsPath(): string {
  return path.join(os.homedir(), ".agentsync", "commands");
}

/**
 * Get path to global backups directory
 */
export function getGlobalBackupsPath(): string {
  return path.join(os.homedir(), ".agentsync", "backups");
}

/**
 * Check if global config file exists
 */
export async function globalConfigExists(): Promise<boolean> {
  return await pathExists(getGlobalConfigPath());
}

/**
 * Load global config, returns null if doesn't exist
 */
export async function loadGlobalConfig(): Promise<AgentSyncConfig | null> {
  const configPath = getGlobalConfigPath();
  if (!(await pathExists(configPath))) {
    return null;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    return validateConfig(config);
  } catch (error) {
    throw new Error(
      `Failed to load global config at ${configPath}: ${(error as Error).message}`,
    );
  }
}

/**
 * Create default global config structure
 */
export async function ensureGlobalConfig(tools?: ToolName[]): Promise<void> {
  const configPath = getGlobalConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure directory structure
  await ensureDir(configDir);
  await ensureDir(path.join(configDir, "rules"));
  await ensureDir(path.join(configDir, "commands"));
  await ensureDir(path.join(configDir, "backups"));

  // Check if config already exists
  if (await pathExists(configPath)) {
    return;
  }

  // Create default config
  const defaultConfig: AgentSyncConfig = {
    version: "1.0",
    tools: tools || [],
    extends: [],
    mcpServers: [],
    useSymlinks: true,
  };

  await outputFile(configPath, JSON.stringify(defaultConfig, null, 2));
}

/**
 * Get global config directory path
 */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), ".agentsync");
}
