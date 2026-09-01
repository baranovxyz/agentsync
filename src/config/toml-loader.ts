/**
 * TOML Config Loader
 * Parses agentsync.toml and maps to internal config model
 */

import { parse } from "smol-toml";
import { z } from "zod";
import { isToolName, type ToolName } from "../constants.js";
import { ConfigError, ParseError } from "../core/errors.js";
import {
  type AgentSyncConfig,
  AgentSyncConfigSchema,
  type ProfileConfig,
} from "../types/schemas.js";
import type { AgentSyncTomlConfig, McpServerConfig } from "./types.js";

type McpEntry =
  | { command: string; args: string[]; env?: Record<string, string> }
  | { url: string; headers?: Record<string, string> };

/**
 * Narrow read-only projection of the unrelated dallay/Rust config. Foreign
 * MCP and routing fields are deliberately discarded rather than interpreted.
 */
const ForeignTomlConfigSchema = z
  .object({
    default_agents: z.array(z.string()).optional(),
    agents: z
      .record(
        z.string(),
        z.object({ enabled: z.boolean().optional() }).passthrough(),
      )
      .optional(),
  })
  .passthrough()
  .transform(({ default_agents, agents }) => ({
    ...(default_agents ? { default_agents } : {}),
    ...(agents ? { agents } : {}),
  }));

/** True only for the isolated dallay/Rust layout that shares our config path. */
export function isForeignDallayConfig(
  config: AgentSyncTomlConfig | Readonly<Record<string, unknown>>,
): boolean {
  return (
    !Object.hasOwn(config, "tools") &&
    (Object.hasOwn(config, "default_agents") || Object.hasOwn(config, "agents"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTomlDocument(
  tomlString: string,
  label: string,
  filePath: string | undefined,
): Record<string, unknown> {
  try {
    const raw: unknown = parse(tomlString);
    if (isRecord(raw)) return raw;
    throw new ConfigError(
      `${label}: expected a TOML table at the root, but got ${Array.isArray(raw) ? "an array" : typeof raw}`,
      filePath,
      "Ensure the file contains valid TOML key-value pairs or tables",
    );
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ParseError(
      `Failed to parse ${label}: ${message}`,
      filePath,
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Parse raw TOML string into typed config with runtime validation.
 * @param tomlString - Raw TOML content
 * @param filePath - Optional file path for error messages
 */
function parseTomlConfigWithForeignMode(
  tomlString: string,
  filePath?: string,
  allowForeign = false,
): AgentSyncTomlConfig {
  const label = filePath || "TOML input";

  // Handle empty / whitespace-only input
  if (!tomlString.trim()) {
    throw new ConfigError(
      `${label} is empty`,
      filePath,
      'Add a current tool list such as: tools = ["claude"]',
    );
  }

  const raw = parseTomlDocument(tomlString, label, filePath);

  const format =
    allowForeign && isForeignDallayConfig(raw) ? "foreign" : "current";

  // Validate structure with Zod
  const result = (
    format === "foreign" ? ForeignTomlConfigSchema : AgentSyncConfigSchema
  ).safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `${label} has invalid structure:\n${issues}`,
      filePath,
      format === "foreign"
        ? "Use a string array for default_agents and boolean enabled values under [agents.<id>]; foreign MCP and routing fields are ignored"
        : "Use current top-level tools, extends (string array), mcp, profiles, hooks, permissions, statusline, and output_style keys",
    );
  }

  return result.data;
}

/** Parse a strict current AgentSync document. */
export function parseTomlConfig(
  tomlString: string,
  filePath?: string,
): AgentSyncTomlConfig {
  return parseTomlConfigWithForeignMode(tomlString, filePath);
}

/**
 * Parse the shared project `.agents/agentsync.toml` path, including the
 * isolated read-only dallay/Rust selector projection.
 */
export function parseProjectTomlConfig(
  tomlString: string,
  filePath?: string,
): AgentSyncTomlConfig {
  return parseTomlConfigWithForeignMode(tomlString, filePath, true);
}

/**
 * Resolve the tool list.
 *
 * Current configs read only `tools`. An isolated dallay/Rust config reads
 * `default_agents`, then enabled `[agents.*]` keys. Unrecognized foreign ids
 * are dropped because that project legitimately names tools we do not support.
 *
 * An empty `default_agents` falls through to enabled `[agents.*]` entries.
 * Once both selectors are exhausted, an explicit empty result prevents a
 * parent or global current config from supplying unrelated tools.
 */
function mapTools(toml: AgentSyncTomlConfig): ToolName[] | undefined {
  // Current format: tools = ["claude", "cursor"]
  if (toml.tools) return toml.tools;
  if (!isForeignDallayConfig(toml)) return undefined;

  const fromDefaultAgents = toml.default_agents?.filter(isToolName);
  if (fromDefaultAgents?.length) return fromDefaultAgents;

  const enabledAgents = Object.entries(toml.agents ?? {})
    .filter(([, agent]) => agent?.enabled !== false)
    .map(([name]) => name)
    .filter(isToolName);
  if (enabledAgents.length) return enabledAgents;

  return [];
}

function mapMcpServer(server: McpServerConfig): McpEntry {
  if ("command" in server) {
    return {
      command: server.command,
      args: server.args ?? [],
      ...(server.env ? { env: server.env } : {}),
    };
  }
  return {
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
  };
}

function mapMcpServers(
  toml: AgentSyncTomlConfig,
): Record<string, McpEntry> | undefined {
  if (isForeignDallayConfig(toml)) return undefined;
  const servers = toml.mcp;
  if (!servers) return undefined;
  const result = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      mapMcpServer(server),
    ]),
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

function mapProfiles(
  toml: AgentSyncTomlConfig,
): Record<string, ProfileConfig> | undefined {
  return toml.profiles && Object.keys(toml.profiles).length > 0
    ? toml.profiles
    : undefined;
}

/**
 * Map TOML config to AgentSync internal config model
 */
export function tomlToInternalConfig(
  toml: AgentSyncTomlConfig,
): AgentSyncConfig {
  return {
    tools: mapTools(toml),
    mcp: mapMcpServers(toml),
    profiles: mapProfiles(toml),
    extends: toml.extends,
    hooks: toml.hooks,
    permissions: toml.permissions,
    statusline: toml.statusline,
    output_style: toml.output_style,
  };
}
