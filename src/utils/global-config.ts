/**
 * Global Config Utilities
 * Manages user-level configuration at ~/.agents/config.toml
 */

import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseTomlConfig,
  tomlToInternalConfig,
} from "../config/toml-loader.js";
import {
  AgentSyncError,
  ConfigError,
  getErrorMessage,
} from "../core/errors.js";
import type { AgentSyncConfig } from "../types/index.js";
import { pathExists } from "./fs.js";

/**
 * Get path to global config file
 */
export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".agents", "config.toml");
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
    const toml = parseTomlConfig(content, configPath);
    return tomlToInternalConfig(toml);
  } catch (error) {
    if (error instanceof AgentSyncError) throw error;
    throw new ConfigError(
      `Failed to load global config at ${configPath}: ${getErrorMessage(error)}`,
      configPath,
      "Check that ~/.agents/config.toml is readable and uses the current AgentSync format",
    );
  }
}

/**
 * Get global config directory path
 */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), ".agents");
}
