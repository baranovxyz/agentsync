import * as path from "node:path";
import yaml from "js-yaml";
import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";
import { isToolName, SUPPORTED_TOOLS } from "../../constants.js";
import { ConfigError, ValidationError } from "../../core/errors.js";
import {
  ExtendsEntrySchema,
  McpServerConfigSchema,
} from "../../types/schemas.js";
import {
  ensureDir,
  outputFile,
  parseJsonValidated,
  pathExists,
} from "../../utils/fs.js";
import { appendTomlSection } from "./mcp-toml-editor.js";
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
import { addTomlStringArrayItem } from "./toml-string-array-editor.js";

export interface ConfigAddOptions {
  cwd?: string;
  mcpConfig?: string;
  description?: string;
}

export interface ConfigAddResult {
  type: ConfigType;
  name: string;
  action: "added" | "already_exists";
  path?: string;
}

function createMarkdownContent(name: string, description: string): string {
  const frontmatter = yaml
    .dump({ description }, { lineWidth: -1, noRefs: true })
    .trimEnd();
  return `---\n${frontmatter}\n---\n\n# ${name}\n`;
}

async function addArrayItem(
  type: ArrayConfigType,
  name: string,
  cwd: string,
): Promise<ConfigAddResult> {
  const resolved = await resolveConfigPath(cwd);
  const { configPath, content } = resolved;
  const edit = addTomlStringArrayItem(
    content ?? "",
    ARRAY_CONFIG_KEYS[type],
    name,
    configPath,
  );
  if (!edit.changed) {
    return { type, name, action: "already_exists", path: configPath };
  }
  if (content === null) await ensureDir(path.dirname(configPath));
  await outputFile(configPath, edit.content, { encoding: "utf-8" });
  return { type, name, action: "added", path: configPath };
}

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

  return addArrayItem("tool", name, cwd);
}

function parseMcpConfig(name: string, serialized: string | undefined) {
  if (!serialized) {
    throw new ConfigError(
      `MCP server "${name}" requires --mcp-config flag with server config`,
      undefined,
      `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJsonValidated(serialized, z.unknown());
  } catch {
    throw new ValidationError(
      `Invalid JSON in --mcp-config flag: ${serialized}`,
      undefined,
      {
        suggestion: `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@org/server"]}'`,
        provided: serialized,
      },
    );
  }

  const validation = McpServerConfigSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ValidationError(
      `Invalid MCP server config:\n${issues}\n\nExpected: { command, args?, env? } or { url, headers? }`,
      validation.error,
      {
        suggestion: `agentsync config add mcp ${name} --mcp-config '{"command":"npx","args":["-y","@org/server"]}'`,
        validFormats: [
          '{"command":"npx","args":["-y","@org/server"]}',
          '{"url":"http://localhost:3000/mcp"}',
        ],
      },
    );
  }
  return validation.data;
}

async function addMcp(
  name: string,
  options: ConfigAddOptions,
  cwd: string,
): Promise<ConfigAddResult> {
  const mcpConfig = parseMcpConfig(name, options.mcpConfig);
  const section = stringifyToml({ mcp: { [name]: mcpConfig } });
  const resolved = await resolveConfigPath(cwd);
  const { configPath, content } = resolved;

  if (content === null) {
    await ensureDir(path.dirname(configPath));
    await outputFile(configPath, section, { encoding: "utf-8" });
    return { type: "mcp", name, action: "added", path: configPath };
  }

  if (resolved.config.mcp && Object.hasOwn(resolved.config.mcp, name)) {
    return { type: "mcp", name, action: "already_exists", path: configPath };
  }

  await outputFile(configPath, appendTomlSection(content, section), {
    encoding: "utf-8",
  });
  return { type: "mcp", name, action: "added", path: configPath };
}

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

  return addArrayItem("preset", source, cwd);
}

async function addMarkdownItem(
  type: FileConfigType,
  name: string,
  description: string | undefined,
  cwd: string,
): Promise<ConfigAddResult> {
  validateConfigItemName(name, type);
  await resolveConfigPath(cwd);
  const itemRoot = getConfigItemPath(cwd, type, name);
  const itemPath =
    type === "skill" ? path.join(itemRoot, "SKILL.md") : itemRoot;
  await validateConfigMutationPath(cwd, itemPath, type);

  if (await pathExists(itemPath)) {
    return { type, name, action: "already_exists", path: itemPath };
  }

  await ensureDir(path.dirname(itemPath));
  const content = createMarkdownContent(name, description || `${name} ${type}`);
  await outputFile(itemPath, content, { encoding: "utf-8" });
  return { type, name, action: "added", path: itemPath };
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
  validateConfigType(type, "add");

  switch (type) {
    case "tool":
      return addTool(name, cwd);
    case "mcp":
      return addMcp(name, options, cwd);
    case "preset":
      return addPreset(name, cwd);
    case "skill":
      return addMarkdownItem("skill", name, options.description, cwd);
    case "command":
      return addMarkdownItem("command", name, options.description, cwd);
  }
}
