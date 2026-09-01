import { outputFile, pathExists, remove } from "../../utils/fs.js";
import { removeTomlMcpServer } from "./mcp-toml-editor.js";
import {
  ARRAY_CONFIG_KEYS,
  type ArrayConfigType,
  type ConfigType,
  type FileConfigType,
  getConfigItemPath,
  resolveConfigPath,
  validateConfigItemName,
  validateConfigMutationPath,
  validateConfigType,
} from "./shared.js";
import { removeTomlStringArrayItem } from "./toml-string-array-editor.js";

export interface ConfigRmOptions {
  cwd?: string;
}

export interface ConfigRmResult {
  type: ConfigType;
  name: string;
  action: "removed" | "not_found";
  path?: string;
}

async function removeArrayItem(
  type: ArrayConfigType,
  name: string,
  cwd: string,
): Promise<ConfigRmResult> {
  const resolved = await resolveConfigPath(cwd);
  const { configPath, content } = resolved;
  if (content === null) {
    return { type, name, action: "not_found" };
  }
  const edit = removeTomlStringArrayItem(
    content,
    ARRAY_CONFIG_KEYS[type],
    name,
    configPath,
  );
  if (!edit.changed) return { type, name, action: "not_found" };
  await outputFile(configPath, edit.content, { encoding: "utf-8" });
  return { type, name, action: "removed", path: configPath };
}

async function removeMcp(name: string, cwd: string): Promise<ConfigRmResult> {
  const resolved = await resolveConfigPath(cwd);
  const { configPath, content } = resolved;

  if (content === null) {
    return { type: "mcp", name, action: "not_found" };
  }

  if (!(resolved.config.mcp && Object.hasOwn(resolved.config.mcp, name))) {
    return { type: "mcp", name, action: "not_found" };
  }

  await outputFile(configPath, removeTomlMcpServer(content, name), {
    encoding: "utf-8",
  });
  return { type: "mcp", name, action: "removed", path: configPath };
}

async function removeFileItem(
  type: FileConfigType,
  name: string,
  cwd: string,
): Promise<ConfigRmResult> {
  validateConfigItemName(name, type);
  await resolveConfigPath(cwd);
  const itemPath = getConfigItemPath(cwd, type, name);
  await validateConfigMutationPath(cwd, itemPath, type);
  if (!(await pathExists(itemPath))) {
    return { type, name, action: "not_found" };
  }
  await remove(itemPath);
  return { type, name, action: "removed", path: itemPath };
}

/**
 * Remove an item from AgentSync configuration.
 *
 * @param type - One of: tool, mcp, preset, skill, command
 * @param name - Name of the item to remove
 * @param options - Additional options
 */
export async function configRm(
  type: string,
  name: string,
  options: ConfigRmOptions = {},
): Promise<ConfigRmResult> {
  const cwd = options.cwd || process.cwd();
  validateConfigType(type, "rm");

  switch (type) {
    case "tool":
      return removeArrayItem("tool", name, cwd);
    case "mcp":
      return removeMcp(name, cwd);
    case "preset":
      return removeArrayItem("preset", name, cwd);
    case "skill":
      return removeFileItem("skill", name, cwd);
    case "command":
      return removeFileItem("command", name, cwd);
  }
}
