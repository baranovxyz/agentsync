import { readFile } from "node:fs/promises";
import * as path from "node:path";
import {
  isForeignDallayConfig,
  parseProjectTomlConfig,
} from "../../config/toml-loader.js";
import type { AgentSyncTomlConfig } from "../../config/types.js";
import { ConfigError, ValidationError } from "../../core/errors.js";
import { getProjectConfigPath } from "../../utils/config-creation.js";
import { pathExists } from "../../utils/fs.js";
import { assertSafeProjectOutputPath } from "../../utils/project-output.js";

export const VALID_TYPES = [
  "tool",
  "mcp",
  "preset",
  "skill",
  "command",
] as const;

export type ConfigType = (typeof VALID_TYPES)[number];
export type FileConfigType = "skill" | "command";
export const ARRAY_CONFIG_KEYS = { tool: "tools", preset: "extends" } as const;
export type ArrayConfigType = keyof typeof ARRAY_CONFIG_KEYS;

const WINDOWS_FORBIDDEN_CHARACTERS = '<>:"|?*';
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;

export function isConfigType(type: string): type is ConfigType {
  return VALID_TYPES.some((validType) => validType === type);
}

export function validateConfigType(
  type: string,
  action: "add" | "rm",
): asserts type is ConfigType {
  if (isConfigType(type)) return;

  throw new ValidationError(
    `Unknown config type "${type}". Valid types: ${VALID_TYPES.join(", ")}`,
    undefined,
    {
      suggestion: `agentsync config ${action} ${VALID_TYPES[0]} <name>`,
      validValues: [...VALID_TYPES],
      provided: type,
    },
  );
}

function hasForbiddenWindowsCharacter(name: string): boolean {
  return [...name].some(
    (character) =>
      character.charCodeAt(0) <= 0x1f ||
      WINDOWS_FORBIDDEN_CHARACTERS.includes(character),
  );
}

export function getConfigItemPath(
  cwd: string,
  type: FileConfigType,
  name: string,
): string {
  const itemPath = path.join(cwd, ".agents", `${type}s`, name);
  return type === "skill" ? itemPath : `${itemPath}.md`;
}

/** Keep file-backed config item names to one portable path segment. */
export function validateConfigItemName(
  name: string,
  type: FileConfigType,
): void {
  const isSafe =
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !hasForbiddenWindowsCharacter(name) &&
    !/[ .]$/.test(name) &&
    !WINDOWS_RESERVED_NAME.test(name);

  if (isSafe) return;

  throw new ValidationError(
    `Invalid ${type} name "${name}". Names must be a portable single path segment and cannot use reserved Windows device names, forbidden characters, or a trailing dot or space.`,
    undefined,
    {
      suggestion: `Use a simple ${type} name without path separators, for example "my-${type}"`,
      provided: name,
    },
  );
}

export async function validateConfigMutationPath(
  cwd: string,
  candidate: string,
  type: FileConfigType,
): Promise<void> {
  try {
    await assertSafeProjectOutputPath(cwd, candidate);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    throw new ValidationError(
      `Refusing to mutate ${type} path outside the project: ${candidate}`,
      undefined,
      {
        suggestion: `Replace symlinked .agents/${type === "skill" ? "skills" : "commands"} ancestors with directories inside the project`,
        provided: candidate,
      },
    );
  }
}

type ResolvedConfig =
  | { configPath: string; content: null; config: null }
  | {
      configPath: string;
      content: string;
      config: AgentSyncTomlConfig;
    };

export async function resolveConfigPath(cwd: string): Promise<ResolvedConfig> {
  const configPath = getProjectConfigPath(cwd);
  await assertSafeProjectOutputPath(cwd, configPath);
  if (!(await pathExists(configPath))) {
    return { configPath, content: null, config: null };
  }

  const content = await readFile(configPath, "utf-8");
  const config = parseProjectTomlConfig(content, configPath);
  if (isForeignDallayConfig(config)) {
    throw new ConfigError(
      `Refusing to mutate read-only dallay/Rust config: ${configPath}`,
      configPath,
      "Edit the foreign config directly, or replace it manually with current AgentSync tools, extends, [mcp.*], and [profiles.*] keys; AgentSync does not migrate foreign layouts.",
    );
  }
  return { configPath, content, config };
}
