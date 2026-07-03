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

function mergeHooks(
  base: NonNullable<AgentSyncConfig["hooks"]> | undefined,
  overlay: NonNullable<AgentSyncConfig["hooks"]>,
): NonNullable<AgentSyncConfig["hooks"]> {
  // Per-event merge with per-id replace: deeper layers replace hooks with
  // matching `id`, others accumulate. Same shape as MCP per-key merge.
  const out: NonNullable<AgentSyncConfig["hooks"]> = {};
  const events = new Set([...Object.keys(base ?? {}), ...Object.keys(overlay)]);
  for (const ev of events) {
    const baseList = base?.[ev] ?? [];
    const overlayList = overlay[ev] ?? [];
    const byId = new Map<string, (typeof baseList)[number]>();
    for (const h of baseList) byId.set(h.id, h);
    for (const h of overlayList) byId.set(h.id, h);
    out[ev] = Array.from(byId.values());
  }
  return out;
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
  if (config.hooks) {
    merged.hooks = mergeHooks(merged.hooks, config.hooks);
  }
  // permissions / statusline / output_style: deeper layer wins wholesale
  if (config.permissions) {
    merged.permissions = config.permissions;
  }
  if (config.statusline) {
    merged.statusline = config.statusline;
  }
  if (config.output_style) {
    merged.output_style = config.output_style;
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
