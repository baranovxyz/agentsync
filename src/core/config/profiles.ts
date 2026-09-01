import { minimatch } from "minimatch";
import type { AgentSyncConfig, ProfileConfig } from "../../types/schemas.js";
import { ConfigError } from "../errors.js";

export interface SelectionContext {
  explicit?: string;
  envVar?: string;
  repoRelativePath?: string;
  envFlags?: Readonly<Record<string, string | undefined>>;
}

/** Return the profile name whose env key appears in envFlags, or undefined. */
function matchByEnvFlags(
  profiles: Record<string, ProfileConfig>,
  envFlags: Readonly<Record<string, string | undefined>>,
): string | undefined {
  for (const [name, profile] of Object.entries(profiles)) {
    if (profile.env && Object.hasOwn(envFlags, profile.env)) return name;
  }
  return undefined;
}

/** Return true if repoRelativePath matches any of the profile's path patterns. */
function pathMatchesProfile(
  profile: ProfileConfig,
  repoRelativePath: string,
): boolean {
  if (!profile.paths) return false;
  const normalizedPath = repoRelativePath.replaceAll("\\", "/");
  return profile.paths.some((pattern) =>
    minimatch(normalizedPath, pattern.replaceAll("\\", "/"), { dot: true }),
  );
}

/** Return the profile name whose paths match repoRelativePath, or undefined. */
function matchByPath(
  profiles: Record<string, ProfileConfig>,
  repoRelativePath: string,
): string | undefined {
  for (const [name, profile] of Object.entries(profiles)) {
    if (pathMatchesProfile(profile, repoRelativePath)) return name;
  }
  return undefined;
}

/**
 * Select the active profile name from a set of profiles and a selection context.
 *
 * Priority order:
 * 1. Explicit name (e.g. --profile flag)
 * 2. Env-var name (e.g. $AGENTSYNC_PROFILE)
 * 3. envFlags auto-detect (profile.env key present in envFlags)
 * 4. Path prefix match (profile.paths)
 */
export function selectProfile(
  profiles: Record<string, ProfileConfig>,
  ctx: SelectionContext,
): string | undefined {
  if (ctx.explicit) {
    if (profiles[ctx.explicit]) return ctx.explicit;
    throw unknownProfileError(ctx.explicit, "--profile", profiles);
  }
  if (ctx.envVar) {
    if (profiles[ctx.envVar]) return ctx.envVar;
    throw unknownProfileError(ctx.envVar, "AGENTSYNC_PROFILE", profiles);
  }
  const envMatch = ctx.envFlags
    ? matchByEnvFlags(profiles, ctx.envFlags)
    : undefined;
  if (envMatch) return envMatch;
  if (ctx.repoRelativePath) return matchByPath(profiles, ctx.repoRelativePath);
  return undefined;
}

function unknownProfileError(
  name: string,
  source: "--profile" | "AGENTSYNC_PROFILE",
  profiles: Record<string, ProfileConfig>,
): ConfigError {
  const available = Object.keys(profiles);
  return new ConfigError(
    `Unknown profile "${name}" from ${source}`,
    undefined,
    available.length > 0
      ? `Choose one of: ${available.join(", ")}`
      : "Define a [profiles.<name>] entry or omit the profile selector",
  );
}

/**
 * Merge a profile's overrides into a base config.
 *
 * - tools: replaced by profile value
 * - mcp: filtered to the profile's server names
 * - extends: filtered to the profile's preset sources
 * - All other base fields are preserved unchanged.
 */

/** Filter MCP config to the profile's server-name allowlist. */
function filterMcp(
  mcp: AgentSyncConfig["mcp"],
  names: string[],
): AgentSyncConfig["mcp"] {
  if (!mcp) return undefined;
  const allowed = new Set(names);
  const result = Object.fromEntries(
    Object.entries(mcp).filter(([name]) => allowed.has(name)),
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

function filterExtends(
  sources: string[] | undefined,
  allowedSources: string[],
): string[] | undefined {
  if (!sources) return undefined;
  const allowed = new Set(allowedSources);
  return sources.filter((source) => allowed.has(source));
}

export function applyProfile<T extends AgentSyncConfig>(
  config: T,
  profile: ProfileConfig | undefined,
): T {
  if (!profile) return config;
  return {
    ...config,
    ...(profile.tools ? { tools: profile.tools } : {}),
    ...(profile.mcp ? { mcp: filterMcp(config.mcp, profile.mcp) } : {}),
    ...(profile.extends
      ? { extends: filterExtends(config.extends, profile.extends) }
      : {}),
  };
}
