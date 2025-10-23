/**
 * Local Configuration Loader
 * Handles loading and saving of agentsync.local.json files
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "../../utils/fs.js";
import { validateLocalConfig, type LocalConfig } from "../../types/schemas.js";

/**
 * Load local configuration from agentsync.local.json
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Local configuration or default empty config
 */
export async function loadLocalConfig(
  cwd: string = process.cwd(),
): Promise<LocalConfig> {
  const configPath = path.join(cwd, "agentsync.local.json");

  if (!(await pathExists(configPath))) {
    return { version: "1.0" };
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return validateLocalConfig(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in agentsync.local.json: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Save local configuration to agentsync.local.json
 * @param config - Configuration to save
 * @param cwd - Working directory (defaults to process.cwd())
 */
export async function saveLocalConfig(
  config: LocalConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  const configPath = path.join(cwd, "agentsync.local.json");
  const content = JSON.stringify(config, null, 2) + "\n";
  await writeFile(configPath, content, "utf-8");
}
