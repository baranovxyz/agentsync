import { dirname, join, resolve } from "node:path";
import { pathExists } from "../../utils/fs.js";

const TOML_CONFIG = ".agents/agentsync.toml";
const MAX_WALK_DEPTH = 50;

export interface ConfigDiscovery {
  chain: string[];
  repoRoot: string;
}

/**
 * Walk up from `startDir` to the git root, collecting every
 * `.agents/agentsync.toml` found.
 * Returns paths ordered most-specific first, root last.
 */
export async function discoverConfigContext(
  startDir: string,
): Promise<ConfigDiscovery> {
  const chain: string[] = [];
  const start = resolve(startDir);
  let current = start;
  let depth = 0;

  while (depth++ < MAX_WALK_DEPTH) {
    const tomlPath = join(current, TOML_CONFIG);

    if (await pathExists(tomlPath)) {
      chain.push(tomlPath);
    }

    // Stop at git root (.git can be a directory or a file in worktrees)
    if (await pathExists(join(current, ".git"))) {
      return { chain, repoRoot: current };
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const rootConfig = chain.at(-1);
  return {
    chain,
    repoRoot: rootConfig ? dirname(dirname(rootConfig)) : start,
  };
}

export async function discoverConfigChain(startDir: string): Promise<string[]> {
  return (await discoverConfigContext(startDir)).chain;
}
