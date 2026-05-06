/**
 * Config Add Command
 * Programmatically add tools, MCP servers, presets, skills, and commands
 * to the AgentSync configuration. Designed for AI agent consumption with
 * clear validation errors on bad input.
 */

import * as path from "node:path";
import { isToolName, SUPPORTED_TOOLS } from "../../constants.js";
import { ConfigError, ValidationError } from "../../core/errors.js";
import {
  ExtendsEntrySchema,
  type McpServerConfig,
  McpServerConfigSchema,
} from "../../types/schemas.js";
import { ensureDir, outputFile, pathExists } from "../../utils/fs.js";
import { escapeRegex, resolveConfigPath, VALID_TYPES } from "./shared.js";

type ConfigAddType = (typeof VALID_TYPES)[number];

export interface ConfigAddOptions {
  cwd?: string;
  mcpConfig?: string;
  description?: string;
}

export interface ConfigAddResult {
  type: ConfigAddType;
  name: string;
  action: "added" | "already_exists";
  path?: string;
}

/**
 * Add a tool to the config's tools array.
 */
async function addTool(name: string, cwd: string): Promise<ConfigAddResult> {
  if (!isToolName(name)) {
    throw new ValidationError(
      `Unknown tool "${name}". Supported tools: ${SUPPORTED_TOOLS.join(", ")}`,
      undefined,
      {
        suggestion: `agentsync config add tool ${SUPPORTED_TOOLS[0]}`,
        validValues: [...SUPPORTED_TOOLS],
        provided: name,
      },
    );
  }

  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    // No config file yet — create one with just this tool
    await ensureDir(path.dirname(configPath));
    await outputFile(configPath, `tools = ["${name}"]\n`, {
      encoding: "utf-8",
    });
    return { type: "tool", name, action: "added", path: configPath };
  }

  // Check if tool is already in the tools array
  const toolsMatch = content.match(/^tools\s*=\s*\[([^\]]*)\]/m);
  if (toolsMatch) {
    const existing = toolsMatch[1];
    // Check if already present (match quoted name)
    if (new RegExp(`["']${name}["']`).test(existing)) {
      return { type: "tool", name, action: "already_exists", path: configPath };
    }
    // Add to existing array
    const trimmed = existing.trim();
    const newList = trimmed.length > 0 ? `${trimmed}, "${name}"` : `"${name}"`;
    const updated = content.replace(
      /^(tools\s*=\s*\[)[^\]]*(\])/m,
      `$1${newList}$2`,
    );
    await outputFile(configPath, updated, { encoding: "utf-8" });
    return { type: "tool", name, action: "added", path: configPath };
  }

  // No tools line found — append it
  const newContent = `${content.trimEnd()}\ntools = ["${name}"]\n`;
  await outputFile(configPath, newContent, { encoding: "utf-8" });
  return { type: "tool", name, action: "added", path: configPath };
}

/**
 * Add an MCP server to the config.
 */
async function addMcp(
  name: string,
  options: ConfigAddOptions,
  cwd: string,
): Promise<ConfigAddResult> {
  if (!options.mcpConfig) {
    throw new ConfigError(
      `MCP server "${name}" requires --mcp-config flag with server config`,
      undefined,
      `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(options.mcpConfig);
  } catch {
    throw new ValidationError(
      `Invalid JSON in --mcp-config flag: ${options.mcpConfig}`,
      undefined,
      {
        suggestion: `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@org/server"]}'`,
        provided: options.mcpConfig,
      },
    );
  }

  const result = McpServerConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ValidationError(
      `Invalid MCP server config:\n${issues}\n\nExpected: { command, args?, env? } or { url, headers? }`,
      result.error,
      {
        suggestion: `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@org/server"]}'`,
        validFormats: [
          '{"command":"npx","args":["-y","@org/server"]}',
          '{"url":"http://localhost:3000/mcp"}',
        ],
      },
    );
  }

  const mcpConfig = result.data;
  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    // No config file — create with just this MCP server
    await ensureDir(path.dirname(configPath));
    const toml = buildMcpTomlSection(name, mcpConfig);
    await outputFile(configPath, toml, { encoding: "utf-8" });
    return { type: "mcp", name, action: "added", path: configPath };
  }

  // Check if MCP server already exists
  const sectionRegex = new RegExp(`^\\[mcp\\.${escapeRegex(name)}\\]`, "m");
  if (sectionRegex.test(content)) {
    return { type: "mcp", name, action: "already_exists", path: configPath };
  }

  // Append MCP server section
  const tomlSection = buildMcpTomlSection(name, mcpConfig);
  const newContent = `${content.trimEnd()}\n\n${tomlSection}`;
  await outputFile(configPath, newContent, { encoding: "utf-8" });
  return { type: "mcp", name, action: "added", path: configPath };
}

/**
 * Build a TOML section string for an MCP server.
 */
/**
 * Append a TOML sub-table with key-value pairs if non-empty.
 */
function appendTomlSubTable(
  lines: string[],
  sectionHeader: string,
  record: Record<string, string>,
): void {
  if (Object.keys(record).length === 0) return;
  lines.push("");
  lines.push(sectionHeader);
  for (const [key, value] of Object.entries(record)) {
    lines.push(`${key} = "${value}"`);
  }
}

function buildMcpTomlSection(name: string, config: McpServerConfig): string {
  const lines: string[] = [`[mcp.${name}]`];

  if ("command" in config) {
    lines.push(`command = "${config.command}"`);
    if (config.args && config.args.length > 0) {
      const argsStr = config.args.map((a) => `"${a}"`).join(", ");
      lines.push(`args = [${argsStr}]`);
    }
    if (config.env) {
      appendTomlSubTable(lines, `[mcp.${name}.env]`, config.env);
    }
  } else {
    lines.push(`url = "${config.url}"`);
    if (config.headers) {
      appendTomlSubTable(lines, `[mcp.${name}.headers]`, config.headers);
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Add a preset (extends entry) to the config.
 */
async function addPreset(
  source: string,
  cwd: string,
): Promise<ConfigAddResult> {
  const result = ExtendsEntrySchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw new ValidationError(
      `Invalid preset source "${source}": ${issues}`,
      result.error,
      {
        suggestion: "agentsync config add preset github:org/repo",
        validFormats: [
          "github:org/repo",
          "github:org/repo@ref",
          "fs:./local-presets",
          "./relative/path",
        ],
        provided: source,
      },
    );
  }

  const { configPath, content } = await resolveConfigPath(cwd);

  if (content === null) {
    // No config — create with just this preset
    await ensureDir(path.dirname(configPath));
    await outputFile(configPath, `extends = ["${source}"]\n`, {
      encoding: "utf-8",
    });
    return { type: "preset", name: source, action: "added", path: configPath };
  }

  // Check if preset already exists
  const extendsMatch = content.match(/^extends\s*=\s*\[([^\]]*)\]/m);
  if (extendsMatch) {
    const existing = extendsMatch[1];
    if (existing.includes(`"${source}"`)) {
      return {
        type: "preset",
        name: source,
        action: "already_exists",
        path: configPath,
      };
    }
    // Add to existing array
    const trimmed = existing.trim();
    const newList =
      trimmed.length > 0 ? `${trimmed}, "${source}"` : `"${source}"`;
    const updated = content.replace(
      /^(extends\s*=\s*\[)[^\]]*(\])/m,
      `$1${newList}$2`,
    );
    await outputFile(configPath, updated, { encoding: "utf-8" });
    return { type: "preset", name: source, action: "added", path: configPath };
  }

  // No extends line — append it
  const newContent = `${content.trimEnd()}\nextends = ["${source}"]\n`;
  await outputFile(configPath, newContent, { encoding: "utf-8" });
  return { type: "preset", name: source, action: "added", path: configPath };
}

/**
 * Create a skill directory with SKILL.md.
 */
async function addSkill(
  name: string,
  options: ConfigAddOptions,
  cwd: string,
): Promise<ConfigAddResult> {
  const description = options.description || `${name} skill`;
  const skillDir = path.join(cwd, ".agents", "skills", name);
  const skillPath = path.join(skillDir, "SKILL.md");

  if (await pathExists(skillPath)) {
    return { type: "skill", name, action: "already_exists", path: skillPath };
  }

  const content = `---\ndescription: ${description}\n---\n\n# ${name}\n`;
  await ensureDir(skillDir);
  await outputFile(skillPath, content, { encoding: "utf-8" });
  return { type: "skill", name, action: "added", path: skillPath };
}

/**
 * Create a command markdown file.
 */
async function addCommand(
  name: string,
  options: ConfigAddOptions,
  cwd: string,
): Promise<ConfigAddResult> {
  const description = options.description || `${name} command`;
  const commandsDir = path.join(cwd, ".agents", "commands");
  const commandPath = path.join(commandsDir, `${name}.md`);

  if (await pathExists(commandPath)) {
    return {
      type: "command",
      name,
      action: "already_exists",
      path: commandPath,
    };
  }

  const content = `---\ndescription: ${description}\n---\n\n# ${name}\n`;
  await ensureDir(commandsDir);
  await outputFile(commandPath, content, { encoding: "utf-8" });
  return { type: "command", name, action: "added", path: commandPath };
}

/**
 * Add an item to AgentSync configuration.
 *
 * @param type - One of: tool, mcp, preset, skill, command
 * @param name - Name of the item to add
 * @param options - Additional options (--json for MCP, --description for skill/command)
 */
export async function configAdd(
  type: string,
  name: string,
  options: ConfigAddOptions = {},
): Promise<ConfigAddResult> {
  const cwd = options.cwd || process.cwd();

  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(
      `Unknown config type "${type}". Valid types: ${VALID_TYPES.join(", ")}`,
      undefined,
      {
        suggestion: `agentsync config add ${VALID_TYPES[0]} <name>`,
        validValues: [...VALID_TYPES],
        provided: type,
      },
    );
  }

  const validType = type as ConfigAddType;

  switch (validType) {
    case "tool":
      return addTool(name, cwd);
    case "mcp":
      return addMcp(name, options, cwd);
    case "preset":
      return addPreset(name, cwd);
    case "skill":
      return addSkill(name, options, cwd);
    case "command":
      return addCommand(name, options, cwd);
  }
}
