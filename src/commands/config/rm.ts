/**
 * Config Remove Command
 * Programmatically remove tools, MCP servers, presets, skills, and commands
 * from the AgentSync configuration. Reverse of config add.
 */

import * as path from "node:path";
import { ValidationError } from "../../core/errors.js";
import { outputFile, pathExists, remove } from "../../utils/fs.js";
import { escapeRegex, resolveConfigPath, VALID_TYPES } from "./shared.js";

type ConfigRmType = (typeof VALID_TYPES)[number];

export interface ConfigRmOptions {
  cwd?: string;
}

export interface ConfigRmResult {
  type: ConfigRmType;
  name: string;
  action: "removed" | "not_found";
  path?: string;
}

/**
 * Remove a tool from the tools array.
 */
async function removeTool(name: string, cwd: string): Promise<ConfigRmResult> {
  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    return { type: "tool", name, action: "not_found" };
  }

  const toolsMatch = content.match(/^tools\s*=\s*\[([^\]]*)\]/m);
  if (!toolsMatch) {
    return { type: "tool", name, action: "not_found" };
  }

  const existing = toolsMatch[1];
  // Check if tool is present
  if (!new RegExp(`["']${escapeRegex(name)}["']`).test(existing)) {
    return { type: "tool", name, action: "not_found" };
  }

  // Remove tool from array (handle comma separators)
  const cleaned = existing
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const unquoted = s.replace(/^["']|["']$/g, "");
      return unquoted !== name;
    })
    .join(", ");

  const updated = content.replace(
    /^(tools\s*=\s*\[)[^\]]*(\])/m,
    `$1${cleaned}$2`,
  );
  await outputFile(configPath, updated, { encoding: "utf-8" });
  return { type: "tool", name, action: "removed", path: configPath };
}

/**
 * Remove an MCP server section from the TOML config.
 */
async function removeMcp(name: string, cwd: string): Promise<ConfigRmResult> {
  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    return { type: "mcp", name, action: "not_found" };
  }

  const sectionHeader = `[mcp.${name}]`;
  if (!content.includes(sectionHeader)) {
    return { type: "mcp", name, action: "not_found" };
  }

  // Remove the section and all its content up to the next section or EOF
  const escapedHeader = escapeRegex(sectionHeader);
  // Also handle the optional .env sub-section
  const envHeader = `[mcp.${name}.env]`;
  const headersHeader = `[mcp.${name}.headers]`;

  let updated = content;

  // Remove sub-sections first (env, headers)
  for (const subHeader of [envHeader, headersHeader]) {
    const escapedSub = escapeRegex(subHeader);
    const subRegex = new RegExp(`\\n?${escapedSub}\\n(?:[^\\[\\n].*\\n)*`, "g");
    updated = updated.replace(subRegex, "");
  }

  // Remove main section
  const mainRegex = new RegExp(
    `\\n?${escapedHeader}\\n(?:[^\\[\\n].*\\n)*`,
    "g",
  );
  updated = updated.replace(mainRegex, "");

  // Clean up extra blank lines
  updated = updated.replace(/\n{3,}/g, "\n\n");

  await outputFile(configPath, updated, { encoding: "utf-8" });
  return { type: "mcp", name, action: "removed", path: configPath };
}

/**
 * Remove a preset from the extends array.
 */
async function removePreset(
  source: string,
  cwd: string,
): Promise<ConfigRmResult> {
  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    return { type: "preset", name: source, action: "not_found" };
  }

  const extendsMatch = content.match(/^extends\s*=\s*\[([^\]]*)\]/m);
  if (!extendsMatch) {
    return { type: "preset", name: source, action: "not_found" };
  }

  const existing = extendsMatch[1];
  if (!existing.includes(`"${source}"`)) {
    return { type: "preset", name: source, action: "not_found" };
  }

  // Remove preset from array
  const cleaned = existing
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const unquoted = s.replace(/^["']|["']$/g, "");
      return unquoted !== source;
    })
    .join(", ");

  const updated = content.replace(
    /^(extends\s*=\s*\[)[^\]]*(\])/m,
    `$1${cleaned}$2`,
  );
  await outputFile(configPath, updated, { encoding: "utf-8" });
  return { type: "preset", name: source, action: "removed", path: configPath };
}

/**
 * Remove a skill directory.
 */
async function removeSkill(name: string, cwd: string): Promise<ConfigRmResult> {
  const skillDir = path.join(cwd, ".agents", "skills", name);
  if (!(await pathExists(skillDir))) {
    return { type: "skill", name, action: "not_found" };
  }
  await remove(skillDir);
  return { type: "skill", name, action: "removed", path: skillDir };
}

/**
 * Remove a command file.
 */
async function removeCommand(
  name: string,
  cwd: string,
): Promise<ConfigRmResult> {
  const commandPath = path.join(cwd, ".agents", "commands", `${name}.md`);
  if (!(await pathExists(commandPath))) {
    return { type: "command", name, action: "not_found" };
  }
  await remove(commandPath);
  return { type: "command", name, action: "removed", path: commandPath };
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

  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(
      `Unknown config type "${type}". Valid types: ${VALID_TYPES.join(", ")}`,
      undefined,
      {
        suggestion: `agentsync config rm ${VALID_TYPES[0]} <name>`,
        validValues: [...VALID_TYPES],
        provided: type,
      },
    );
  }

  const validType = type as ConfigRmType;

  switch (validType) {
    case "tool":
      return removeTool(name, cwd);
    case "mcp":
      return removeMcp(name, cwd);
    case "preset":
      return removePreset(name, cwd);
    case "skill":
      return removeSkill(name, cwd);
    case "command":
      return removeCommand(name, cwd);
  }
}
