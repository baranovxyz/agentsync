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
  type ProfileConfig,
  ProfileConfigSchema,
} from "../types/schemas.js";
import type { AgentSyncTomlConfig, McpServerConfig } from "./types.js";

type McpEntry =
  | { command: string; args: string[]; env?: Record<string, string> }
  | { url: string; headers?: Record<string, string> };

/** Zod schema for runtime validation of TOML config structure */
const TomlConfigSchema = z
  .object({
    tools: z.array(z.string()).optional(),
    extends: z.array(z.string()).optional(),
    mcp: z.object({}).passthrough().optional(),
    mcp_servers: z.record(z.string(), z.object({}).passthrough()).optional(),
    agentsync: z.object({}).passthrough().optional(),
    profiles: z.record(z.string(), z.object({}).passthrough()).optional(),
    hooks: z.record(z.string(), z.array(z.object({}).passthrough())).optional(),
    permissions: z.object({}).passthrough().optional(),
    statusline: z.object({}).passthrough().optional(),
    output_style: z.object({}).passthrough().optional(),
  })
  .passthrough();

/**
 * Parse raw TOML string into typed config with runtime validation.
 * @param tomlString - Raw TOML content
 * @param filePath - Optional file path for error messages
 */
export function parseTomlConfig(
  tomlString: string,
  filePath?: string,
): AgentSyncTomlConfig {
  const label = filePath || "TOML input";

  // Handle empty / whitespace-only input
  if (!tomlString.trim()) {
    throw new ConfigError(
      `${label} is empty`,
      filePath,
      "Add at least a [agents] section to your TOML config",
    );
  }

  // Parse raw TOML
  let raw: Record<string, unknown>;
  try {
    raw = parse(tomlString);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new ParseError(
      `Failed to parse ${label}: ${msg}`,
      filePath,
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    );
  }

  // Ensure root is an object (smol-toml should always return one, but guard anyway)
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(
      `${label}: expected a TOML table at the root, but got ${Array.isArray(raw) ? "an array" : typeof raw}`,
      filePath,
      "Ensure the file contains valid TOML key-value pairs or tables",
    );
  }

  // Validate structure with Zod
  const result = TomlConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `${label} has invalid structure:\n${issues}`,
      filePath,
      "Check the TOML config against the expected schema (agents, mcp_servers, agentsync sections)",
    );
  }

  return result.data as AgentSyncTomlConfig;
}

function mapTools(toml: AgentSyncTomlConfig): ToolName[] | undefined {
  // v1 format: tools = ["claude", "cursor"]
  return toml.tools?.filter(isToolName);
}

function mapMcpServer(server: McpServerConfig): McpEntry | null {
  if (server.command) {
    return {
      command: server.command,
      args: server.args || [],
      ...(server.env ? { env: server.env } : {}),
    };
  }
  if (server.url) {
    return {
      url: server.url,
      ...(server.headers ? { headers: server.headers } : {}),
    };
  }
  return null;
}

function mapMcpServers(
  toml: AgentSyncTomlConfig,
): Record<string, McpEntry> | undefined {
  // Accept both [mcp.name] (documented format) and [mcp_servers.name] (legacy)
  const servers = toml.mcp_servers ?? toml.mcp;
  if (!servers || typeof servers !== "object") return undefined;
  const result: Record<string, McpEntry> = {};
  for (const [name, server] of Object.entries(servers)) {
    const mapped = mapMcpServer(server);
    if (mapped) result[name] = mapped;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mapProfiles(
  toml: AgentSyncTomlConfig,
): Record<string, ProfileConfig> | undefined {
  if (!toml.profiles) return undefined;
  const result: Record<string, ProfileConfig> = {};
  for (const [name, profile] of Object.entries(toml.profiles)) {
    result[name] = ProfileConfigSchema.parse(profile);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Map TOML config to AgentSync internal config model
 */
export function tomlToInternalConfig(
  toml: AgentSyncTomlConfig,
): AgentSyncConfig {
  const ext = toml.agentsync;

  // v1 format: top-level extends = [...]; legacy: [agentsync] presets
  const extends_ = toml.extends ?? ext?.presets?.map((p) => p.source);

  return {
    tools: mapTools(toml),
    mcp: mapMcpServers(toml),
    profile: ext?.profile,
    profiles: mapProfiles(toml),
    extends: extends_,
    hooks: toml.hooks as AgentSyncConfig["hooks"],
    permissions: toml.permissions as AgentSyncConfig["permissions"],
    statusline: toml.statusline as AgentSyncConfig["statusline"],
    output_style: toml.output_style as AgentSyncConfig["output_style"],
  };
}
