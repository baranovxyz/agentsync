/**
 * Shared MCP write helpers for tool providers.
 * Reduces duplication across the 15+ tool files that write MCP configs.
 */

import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import * as yaml from "js-yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ConfigError, getErrorMessage } from "../core/errors.js";
import { ToolSettingsSchema } from "../types/schemas.js";
import { outputFile, parseJsonValidated } from "../utils/fs.js";
import { editJsoncTopLevelKey, parseJsoncValidated } from "../utils/jsonc.js";
import { assertSafeProjectOutputFile } from "../utils/project-output.js";
import type { McpOwnedValueExpectation } from "./types.js";

type McpServers = Record<string, unknown>;

/** Serialization of a tool's shared config file. */
export type ConfigFileFormat = "json" | "jsonc" | "toml" | "yaml";

export function parseConfigRecord(
  content: string,
  format: ConfigFileFormat,
): Record<string, unknown> {
  const parsed =
    format === "toml"
      ? parseToml(content)
      : format === "yaml"
        ? yaml.load(content)
        : format === "jsonc"
          ? parseJsoncValidated(content, ToolSettingsSchema)
          : parseJsonValidated(content, ToolSettingsSchema);
  return ToolSettingsSchema.parse(parsed);
}

export function serializeConfigRecord(
  value: Record<string, unknown>,
  format: ConfigFileFormat,
): string {
  if (format === "toml") return `${stringifyToml(value)}\n`;
  if (format === "yaml") return yaml.dump(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Write a standalone MCP JSON file with a configurable top-level key.
 * Used by cursor, claude, roocode, amazonq, kiro, junie, kilocode, qwen, copilot.
 *
 * @param mcpPath   - Absolute path to the MCP JSON file
 * @param mcps      - MCP server definitions
 * @param projectRoot - Project boundary for generated output
 * @param key       - Top-level key name (default: "mcpServers")
 */
export async function writeMcpJson(
  mcpPath: string,
  mcps: McpServers,
  projectRoot: string,
  key = "mcpServers",
): Promise<void> {
  await assertSafeProjectOutputFile(projectRoot, mcpPath);
  await outputFile(mcpPath, `${JSON.stringify({ [key]: mcps }, null, 2)}\n`);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readConfigRecordOrEmpty(
  settingsPath: string,
  format: ConfigFileFormat,
): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(settingsPath, "utf-8");
    return parseConfigRecord(content, format);
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw new ConfigError(
      `Cannot safely update shared configuration "${settingsPath}": ${getErrorMessage(error)}`,
      settingsPath,
      `Repair the existing ${format.toUpperCase()}, or move it aside after preserving any user-authored settings, then rerun agentsync sync.`,
    );
  }
}

/** Validate a shared config that a later projection will read and mutate. */
export async function preflightConfigRecord(
  settingsPath: string,
  format: ConfigFileFormat,
  projectRoot: string,
): Promise<void> {
  await assertSafeProjectOutputFile(projectRoot, settingsPath);
  await readConfigRecordOrEmpty(settingsPath, format);
}

/**
 * Merge MCP servers (or any other top-level config value) into an existing
 * settings JSON file. Preserves keys already present in the file.
 * Used by gemini, amp, augment, crush, opencode for MCP; and by claude for
 * hooks/permissions/statusline/outputStyle.
 *
 * @param settingsPath - Absolute path to the settings JSON file
 * @param value        - Value to write at `key` (object, string, array, …)
 * @param projectRoot  - Project boundary for generated output
 * @param key          - Top-level key under which to store the value (default: "mcpServers")
 */
export async function mergeIntoSettings(
  settingsPath: string,
  value: unknown,
  projectRoot: string,
  key = "mcpServers",
): Promise<void> {
  await assertSafeProjectOutputFile(projectRoot, settingsPath);
  const existing = await readConfigRecordOrEmpty(settingsPath, "json");
  const next = { ...existing, [key]: value };
  await assertSafeProjectOutputFile(projectRoot, settingsPath);
  await outputFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
}

/** Update one OpenCode JSONC key while preserving unrelated source text. */
export async function mergeIntoJsoncSettings(
  settingsPath: string,
  value: unknown,
  key: string,
  projectRoot: string,
  expected?: McpOwnedValueExpectation,
): Promise<void> {
  await assertSafeProjectOutputFile(projectRoot, settingsPath);
  let content: string;
  try {
    content = await readFile(settingsPath, "utf-8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw new ConfigError(
        `Cannot safely update shared configuration "${settingsPath}": ${getErrorMessage(error)}`,
        settingsPath,
        "Repair the existing JSONC, or move it aside after preserving any user-authored settings, then rerun agentsync sync.",
      );
    }
    content = "{}\n";
  }
  let next: string;
  try {
    if (expected) {
      const existing = parseJsoncValidated(content, ToolSettingsSchema);
      const present = Object.hasOwn(existing, key);
      if (
        present !== expected.present ||
        (present &&
          expected.present &&
          !isDeepStrictEqual(existing[key], expected.value))
      ) {
        throw new ConfigError(
          `Refusing to update shared configuration "${settingsPath}": managed key "${key}" changed after preflight.`,
          settingsPath,
          "Preserve the concurrent edit, then rerun agentsync sync against the new config state.",
        );
      }
    }
    next = editJsoncTopLevelKey(content, key, value, ToolSettingsSchema);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(
      `Cannot safely update shared configuration "${settingsPath}": ${getErrorMessage(error)}`,
      settingsPath,
      "Repair the existing JSONC, or move it aside after preserving any user-authored settings, then rerun agentsync sync.",
    );
  }
  await outputFile(settingsPath, next);
}
