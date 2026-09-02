/**
 * Rules Sync Module
 *
 * Source: `.agents/rules/**\/*.md` — path-scoped instructions in Claude Code's
 * format (optional `description`, optional `paths` list of globs).
 *
 * A rule reaches a tool only when that tool can honor the rule's load
 * condition. Tools that cannot warn instead of receiving something different
 * from what the author wrote.
 */

import * as path from "node:path";
import fg from "fast-glob";
import type { CanonicalRule, ToolProvider } from "../tools/types.js";
import { splitFrontmatter } from "../utils/frontmatter.js";
import { pathExists, readFile } from "../utils/fs.js";
import type { SyncMode } from "./write-file.js";

/** Options for rule sync behavior */
export interface RulesSyncOptions {
  mode?: SyncMode;
}

/** Result of syncing rules to a single tool */
export interface RuleSyncResult {
  tool: string;
  ruleCount: number;
  rules: string[];
  warnings: string[];
}

function emptyRuleResult(provider: ToolProvider): RuleSyncResult {
  return {
    tool: provider.name,
    ruleCount: 0,
    rules: [],
    warnings: [],
  };
}

function unsupportedRuleResult(
  provider: ToolProvider,
  count: number,
): RuleSyncResult {
  return {
    ...emptyRuleResult(provider),
    warnings: [
      `rules are not synced to ${provider.displayName}; ${count} rule(s) skipped ` +
        `(its always-on instruction channel, ${provider.paths.docsFile}, is synced)`,
    ],
  };
}

function attachLoadWarnings(
  results: RuleSyncResult[],
  loadWarnings: string[],
): RuleSyncResult[] {
  if (loadWarnings.length > 0 && results[0]) {
    results[0].warnings.unshift(...loadWarnings);
  }
  return results;
}

/**
 * Normalize a frontmatter `paths` value.
 *
 * Returns `undefined` only when the key is absent or unusable — never for an
 * empty list, which stays a (vacuous) load condition rather than becoming
 * "always apply".
 */
function normalizePaths(value: unknown): {
  paths?: string[];
  warning?: string;
} {
  if (value === undefined || value === null) return {};
  if (typeof value === "string") return { paths: [value] };
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === "string");
    if (strings.length !== value.length) {
      return {
        paths: strings,
        warning: "non-string entries in `paths` were ignored",
      };
    }
    return { paths: strings };
  }
  return { warning: "`paths` must be a string or a list of strings — ignored" };
}

/**
 * Read every canonical rule from `.agents/rules/`.
 * Returns an empty list (not an error) when the directory does not exist.
 */
export async function loadCanonicalRules(cwd: string): Promise<{
  rules: CanonicalRule[];
  warnings: string[];
}> {
  const rulesDir = path.join(cwd, ".agents", "rules");
  if (!(await pathExists(rulesDir))) return { rules: [], warnings: [] };

  const files = (
    await fg("**/*.md", {
      cwd: rulesDir,
      absolute: false,
      followSymbolicLinks: true,
    })
  ).sort();

  const rules: CanonicalRule[] = [];
  const warnings: string[] = [];

  for (const relPath of files) {
    const sourcePath = path.join(rulesDir, relPath);
    const raw = await readFile(sourcePath, "utf-8");
    const { fm, body } = splitFrontmatter(raw);
    const name = relPath.replace(/\.md$/, "");
    const { paths, warning } = normalizePaths(fm?.paths);
    if (warning) warnings.push(`rule "${name}": ${warning}`);
    if (paths && paths.length === 0) {
      warnings.push(
        `rule "${name}": empty \`paths\` list matches no files — it will never load`,
      );
    }
    rules.push({
      name,
      relPath,
      description:
        typeof fm?.description === "string" ? fm.description : undefined,
      paths,
      raw,
      body,
      sourcePath,
    });
  }

  return { rules, warnings };
}

/**
 * Sync rules to all configured tools.
 *
 * Providers without `capabilities.rules` get one warning naming their
 * already-synced instruction channel, rather than silence that reads as
 * "nothing to do".
 */
export async function syncRules(
  providers: ToolProvider[],
  cwd: string,
  options?: RulesSyncOptions,
): Promise<RuleSyncResult[]> {
  const mode = options?.mode ?? "copy";
  const { rules, warnings: loadWarnings } = await loadCanonicalRules(cwd);
  const results: RuleSyncResult[] = [];

  if (rules.length === 0) {
    return providers.map(emptyRuleResult);
  }

  for (const provider of providers) {
    if (!(provider.capabilities.rules && provider.rulesFormat)) {
      results.push(unsupportedRuleResult(provider, rules.length));
      continue;
    }

    const { written, warnings } = await provider.rulesFormat.writeRules(
      rules,
      cwd,
      mode,
    );

    results.push({
      tool: provider.name,
      ruleCount: written.length,
      rules: written,
      warnings,
    });
  }

  // Malformed-source warnings describe the canonical files, not any one tool.
  // Attach them once, to the first result, so N tools don't repeat the same
  // line N times — and so they still surface when no tool supports rules.
  return attachLoadWarnings(results, loadWarnings);
}

/** Read-only rule projection for dry-run. */
export async function previewRules(
  providers: ToolProvider[],
  cwd: string,
): Promise<RuleSyncResult[]> {
  const { rules, warnings: loadWarnings } = await loadCanonicalRules(cwd);
  if (rules.length === 0) return providers.map(emptyRuleResult);

  const results: RuleSyncResult[] = [];
  for (const provider of providers) {
    if (!(provider.capabilities.rules && provider.rulesFormat)) {
      results.push(unsupportedRuleResult(provider, rules.length));
      continue;
    }
    await provider.rulesFormat.preflightRules?.(rules, cwd);
    const projection = provider.rulesFormat.previewRules(rules);
    results.push({
      tool: provider.name,
      ruleCount: projection.written.length,
      rules: projection.written,
      warnings: projection.warnings,
    });
  }
  return attachLoadWarnings(results, loadWarnings);
}
