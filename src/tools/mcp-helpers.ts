/**
 * Shared MCP write helpers for tool providers.
 * Reduces duplication across the 15+ tool files that write MCP configs.
 */

import { readFile } from "node:fs/promises";
import { ToolSettingsSchema } from "../types/schemas.js";
import { outputFile, pathExists } from "../utils/fs.js";

type McpServers = Record<string, unknown>;

/**
 * Write a standalone MCP JSON file with a configurable top-level key.
 * Used by cursor, claude, roocode, amazonq, kiro, junie, kilocode, qwen, copilot.
 *
 * @param mcpPath   - Absolute path to the MCP JSON file
 * @param mcps      - MCP server definitions
 * @param key       - Top-level key name (default: "mcpServers")
 */
export async function writeMcpJson(
  mcpPath: string,
  mcps: McpServers,
  key = "mcpServers",
): Promise<void> {
  await outputFile(mcpPath, `${JSON.stringify({ [key]: mcps }, null, 2)}\n`);
}

/**
 * Merge MCP servers (or any other top-level config value) into an existing
 * settings JSON file. Preserves keys already present in the file.
 * Used by gemini, amp, augment, crush, opencode for MCP; and by claude for
 * hooks/permissions/statusline/outputStyle.
 *
 * @param settingsPath - Absolute path to the settings JSON file
 * @param value        - Value to write at `key` (object, string, array, …)
 * @param key          - Top-level key under which to store the value (default: "mcpServers")
 */
export async function mergeIntoSettings(
  settingsPath: string,
  value: unknown,
  key = "mcpServers",
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (await pathExists(settingsPath)) {
    try {
      const content = await readFile(settingsPath, "utf-8");
      existing = ToolSettingsSchema.parse(JSON.parse(content));
    } catch {
      // Start fresh if existing file is invalid
    }
  }
  existing[key] = value;
  await outputFile(settingsPath, `${JSON.stringify(existing, null, 2)}\n`);
}
