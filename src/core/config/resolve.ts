import * as path from "node:path";
import { loadConfigHierarchy, type MergedConfig } from "./hierarchy.js";
import { applyProfile, selectProfile } from "./profiles.js";

export interface ResolveConfigOptions {
  cwd?: string;
  profile?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

function repoRelativePath(cwd: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, cwd);
  return relative || ".";
}

/** Load the complete hierarchy and apply the selected current profile. */
export async function resolveConfig(
  options: ResolveConfigOptions = {},
): Promise<MergedConfig> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const config = await loadConfigHierarchy(cwd);
  const profiles = config.profiles ?? {};
  const profileName = selectProfile(profiles, {
    explicit: options.profile,
    envVar: env.AGENTSYNC_PROFILE,
    envFlags: env,
    repoRelativePath: repoRelativePath(cwd, config._sources.repoRoot),
  });

  return profileName ? applyProfile(config, profiles[profileName]) : config;
}
