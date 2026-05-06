import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "../../utils/fs.js";

export const VALID_TYPES = [
  "tool",
  "mcp",
  "preset",
  "skill",
  "command",
] as const;

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function resolveConfigPath(
  cwd: string,
): Promise<{ configPath: string; content: string | null }> {
  const configPath = path.join(cwd, ".agents", "agentsync.toml");
  if (!(await pathExists(configPath))) {
    return { configPath, content: null };
  }
  const content = await readFile(configPath, "utf-8");
  return { configPath, content };
}
