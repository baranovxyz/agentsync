/**
 * Config List Command
 * Lists configured items, optionally filtered by type.
 */

import { readdir } from "node:fs/promises";
import * as path from "node:path";
import { loadProjectConfig } from "../../config/load-project-config.js";
import { ValidationError } from "../../core/errors.js";
import { pathExists } from "../../utils/fs.js";

const VALID_TYPES = ["tools", "mcp", "presets", "skills", "commands"] as const;
type ConfigLsType = (typeof VALID_TYPES)[number];

export interface ConfigLsOptions {
  cwd?: string;
}

export interface ConfigLsResult {
  tools?: string[];
  mcp?: string[];
  presets?: string[];
  skills?: string[];
  commands?: string[];
}

/** List directory names (skills) or .md file basenames (commands). */
async function listDirEntries(
  dirPath: string,
  mode: "dirs" | "md-files",
): Promise<string[]> {
  if (!(await pathExists(dirPath))) return [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  if (mode === "dirs") {
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/, ""));
}

export async function configLs(
  type?: string,
  options: ConfigLsOptions = {},
): Promise<ConfigLsResult> {
  const cwd = options.cwd || process.cwd();

  if (type && !(VALID_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(
      `Invalid type "${type}". Valid types: ${VALID_TYPES.join(", ")}`,
    );
  }

  const f = type as ConfigLsType | undefined;
  const wants = (t: ConfigLsType) => !f || f === t;

  // Use dual-read shim (TOML first, JSON fallback with deprecation warning)
  let config: import("../../types/index.js").AgentSyncConfig | null = null;
  try {
    const result = await loadProjectConfig(cwd);
    config = result.config;
  } catch {
    // No config found — return empty results
  }

  const result: ConfigLsResult = {};

  if (wants("tools")) result.tools = config?.tools ?? [];
  if (wants("mcp")) result.mcp = config?.mcp ? Object.keys(config.mcp) : [];
  if (wants("presets")) result.presets = config?.extends ?? [];
  if (wants("skills"))
    result.skills = await listDirEntries(
      path.join(cwd, ".agents", "skills"),
      "dirs",
    );
  if (wants("commands"))
    result.commands = await listDirEntries(
      path.join(cwd, ".agents", "commands"),
      "md-files",
    );

  return result;
}
