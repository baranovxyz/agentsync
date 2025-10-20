/**
 * Environment Variable Loader
 * Loads from .env file and merges with process.env
 */

import { pathExists } from 'fs-extra';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

/**
 * Load environment variables from .env file
 * @param envPath - Path to .env file (defaults to .env in cwd)
 * @returns Merged environment variables (process.env takes precedence over .env)
 */
export async function loadEnv(envPath?: string): Promise<Record<string, string>> {
  const filepath = envPath || path.join(process.cwd(), '.env');

  // Start with empty env
  const env: Record<string, string> = {};

  // If .env file exists, parse it first
  if (await pathExists(filepath)) {
    const content = await readFile(filepath, 'utf-8');

    // Simple .env parser (handles KEY=value format)
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=value
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        env[key] = value;
      }
    }
  }

  // process.env takes precedence over .env file (for security)
  return { ...env, ...process.env } as Record<string, string>;
}
