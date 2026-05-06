import { isToolName } from "../../constants.js";
import type { AgentSyncConfig } from "../../types/schemas.js";

type Mcp = NonNullable<AgentSyncConfig["mcp"]>;

function mergeMcp(base: Mcp | undefined, overlay: Mcp): Mcp {
  return { ...base, ...overlay };
}

function mergeExtends(base: string[] | undefined, overlay: string[]): string[] {
  return [...(base ?? []), ...overlay];
}

function mergeProfiles(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...overlay };
}

function applyLayer(merged: AgentSyncConfig, config: AgentSyncConfig): void {
  if (config.tools) {
    merged.tools = config.tools.filter(isToolName);
  }
  if (config.mcp) {
    merged.mcp = mergeMcp(merged.mcp, config.mcp);
  }
  if (config.extends) {
    merged.extends = mergeExtends(merged.extends, config.extends);
  }
  if (config.profile) {
    merged.profile = config.profile;
  }
  if (config.profiles) {
    merged.profiles = mergeProfiles(
      merged.profiles,
      config.profiles,
    ) as AgentSyncConfig["profiles"];
  }
}

/**
 * Merge N configs ordered most-specific first.
 * - tools: most-specific wins (first non-undefined)
 * - mcp: per-key merge, specific overrides general
 * - extends: accumulate all
 */
export function mergeConfigChain(chain: AgentSyncConfig[]): AgentSyncConfig {
  if (chain.length === 0) {
    return {};
  }
  if (chain.length === 1) {
    return { ...chain[0] };
  }

  // Start from root (last) and overlay each level toward most-specific
  const reversed = [...chain].reverse();
  const merged: AgentSyncConfig = {};

  for (const config of reversed) {
    applyLayer(merged, config);
  }

  return merged;
}
