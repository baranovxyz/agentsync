/**
 * Environment Variable Loader
 * Loads from .env file and merges with process.env
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "../../utils/fs.js";

/**
 * Load environment variables from .env file
 * @param envPath - Path to .env file (defaults to .env in cwd)
 * @returns Merged environment variables (process.env takes precedence over .env)
 */
export async function loadEnv(
  envPath?: string,
): Promise<Record<string, string>> {
  const filepath = envPath || path.join(process.cwd(), ".env");

  // Start with empty env
  const env: Record<string, string> = {};

  // If .env file exists, parse it first
  if (await pathExists(filepath)) {
    const content = await readFile(filepath, "utf-8");

    // Simple .env parser (handles KEY=value format)
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse KEY=value (allows both uppercase and lowercase keys)
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        env[key] = value;
      }
    }
  }

  // process.env takes precedence over .env file (for security)
  // Filter out undefined/null values
  const merged = { ...env, ...process.env };
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v != null && v !== "undefined")
  ) as Record<string, string>;
}
