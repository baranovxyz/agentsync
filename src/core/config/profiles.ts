import { isToolName } from "../../constants.js";
import type { AgentSyncConfig, ProfileConfig } from "../../types/schemas.js";

export interface SelectionContext {
  explicit?: string;
  envVar?: string;
  repoRelativePath?: string;
  envFlags?: Record<string, string>;
}

/** Return the profile name whose env key appears in envFlags, or undefined. */
function matchByEnvFlags(
  profiles: Record<string, ProfileConfig>,
  envFlags: Record<string, string>,
): string | undefined {
  for (const [name, profile] of Object.entries(profiles)) {
    if (profile.env && envFlags[profile.env]) return name;
  }
  return undefined;
}

/** Return true if repoRelativePath matches any of the profile's path patterns. */
function pathMatchesProfile(
  profile: ProfileConfig,
  repoRelativePath: string,
): boolean {
  if (!profile.paths) return false;
  // Simplified prefix matching — matches paths starting with the non-glob prefix.
  // Full glob semantics not needed for profile path hints.
  return profile.paths.some((pattern) => {
    const prefix = pattern.replace(/\*\*.*$/, "");
    return repoRelativePath.startsWith(prefix);
  });
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
  if (ctx.explicit && profiles[ctx.explicit]) return ctx.explicit;
  if (ctx.envVar && profiles[ctx.envVar]) return ctx.envVar;
  if (ctx.envFlags) return matchByEnvFlags(profiles, ctx.envFlags);
  if (ctx.repoRelativePath) return matchByPath(profiles, ctx.repoRelativePath);
  return undefined;
}

/**
 * Merge a profile's overrides into a base config.
 *
 * - tools: replaced by profile value
 * - mcp: replaced by profile value (profile.mcp names select servers from base)
 * - extends: replaced by profile value
 * - skills: stored on result for downstream filtering
 * - All other base fields are preserved unchanged.
 */

/** Build replacement MCP config from profile's server name list. */
function replaceMcp(
  mcp: AgentSyncConfig["mcp"],
  names: string[],
): AgentSyncConfig["mcp"] {
  if (!mcp) return undefined;
  const result: Record<string, NonNullable<AgentSyncConfig["mcp"]>[string]> =
    {};
  for (const name of names) {
    if (mcp[name]) {
      result[name] = mcp[name];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function applyProfile(
  config: AgentSyncConfig,
  profile: ProfileConfig | undefined,
): AgentSyncConfig {
  if (!profile) return config;

  const result = { ...config };

  if (profile.tools) {
    result.tools = profile.tools.filter(isToolName);
  }

  if (profile.mcp) {
    result.mcp = replaceMcp(result.mcp, profile.mcp);
  }

  if (profile.extends) {
    result.extends = [...profile.extends];
  }

  return result;
}
