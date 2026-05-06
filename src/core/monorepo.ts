import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathExists } from "../utils/fs.js";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".next",
  ".cache",
  "coverage",
  ".turbo",
  ".nx",
]);

/**
 * Recursively find all directories containing `.agents/agentsync.toml`
 * under the given root.
 * Returns absolute paths to the directories (not the config files).
 */
export async function findAgentsSubtrees(root: string): Promise<string[]> {
  const subtrees: string[] = [];
  await walkForAgentsDirs(root, subtrees);
  return subtrees;
}

async function walkForAgentsDirs(
  dir: string,
  results: string[],
): Promise<void> {
  if (await pathExists(join(dir, ".agents", "agentsync.toml"))) {
    results.push(dir);
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkForAgentsDirs(join(dir, entry.name), results);
    }
  } catch {
    // Permission denied or similar — skip
  }
}

/**
 * Given a list of changed files (from git diff), return which
 * .agents subtrees need re-syncing.
 *
 * IMPORTANT: If a parent .agents/ changes, ALL child subtrees must
 * also re-sync because they inherit from the parent config.
 */
export function filterChangedSubtrees(
  allSubtrees: string[],
  changedFiles: string[],
  repoRoot: string,
): string[] {
  const directlyChanged = new Set<string>();
  for (const subtree of allSubtrees) {
    const relSubtree =
      subtree === repoRoot ? "" : subtree.slice(repoRoot.length + 1);
    const agentsPrefix = relSubtree ? `${relSubtree}/.agents/` : ".agents/";
    if (changedFiles.some((f) => f.startsWith(agentsPrefix))) {
      directlyChanged.add(subtree);
    }
  }

  const needsSync = new Set<string>(directlyChanged);
  for (const subtree of allSubtrees) {
    for (const changed of directlyChanged) {
      if (subtree !== changed && subtree.startsWith(`${changed}/`)) {
        needsSync.add(subtree);
      }
    }
  }

  return allSubtrees.filter((s) => needsSync.has(s));
}
