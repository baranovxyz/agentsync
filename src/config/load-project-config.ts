/**
 * Project config loading
 * Loads .agents/agentsync.toml — the only supported project config format.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { ConfigError } from "../core/errors.js";
import type { AgentSyncConfig } from "../types/index.js";
import { pathExists } from "../utils/fs.js";
import { parseTomlConfig, tomlToInternalConfig } from "./toml-loader.js";

export interface ProjectConfigResult {
  config: AgentSyncConfig;
  configPath: string;
}

/**
 * Load project configuration from .agents/agentsync.toml.
 *
 * @param cwd - Project root directory to search in
 * @returns Resolved config and its file path
 * @throws ConfigError if no configuration file is found
 */
export async function loadProjectConfig(
  cwd: string,
): Promise<ProjectConfigResult> {
  const tomlPath = path.join(cwd, ".agents", "agentsync.toml");
  if (await pathExists(tomlPath)) {
    const content = await readFile(tomlPath, "utf-8");
    const toml = parseTomlConfig(content, tomlPath);
    const config = tomlToInternalConfig(toml);
    return { config, configPath: tomlPath };
  }

  throw new ConfigError(
    `No AgentSync configuration found in ${cwd}`,
    undefined,
    "Run: agentsync init --tools cursor,claude",
  );
}

/**
 * Write project configuration back to disk as TOML.
 */
export async function writeProjectConfig(
  configPath: string,
  config: AgentSyncConfig,
): Promise<void> {
  const { outputFile } = await import("../utils/fs.js");
  const { stringify } = await import("smol-toml");
  const tomlObj: Record<string, unknown> = {};
  if (config.tools) tomlObj.tools = config.tools;
  if (config.mcp && Object.keys(config.mcp).length > 0) {
    tomlObj.mcp = config.mcp;
  }
  if (config.profiles) tomlObj.profiles = config.profiles;
  if (config.extends && config.extends.length > 0) {
    tomlObj.extends = config.extends;
  }

  const content = stringify(tomlObj);
  await outputFile(configPath, content);
}
