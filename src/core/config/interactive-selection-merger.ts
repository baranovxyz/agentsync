/**
 * Apply file-level selections from preset content
 */

import micromatch from "micromatch";
import type {
  CanonicalCommand,
  CanonicalRule,
  SelectionConfig,
} from "../../types/index.js";
import type { Preset } from "../../types/preset.js";

/**
 * Applied selection result in canonical format
 */
export interface AppliedSelection {
  commands: Map<string, CanonicalCommand>;
  rules: Map<string, CanonicalRule>;
  mcps: Record<string, unknown>;
}

/**
 * Apply file-level selections to preset content
 */
export function applySelections(
  preset: Preset,
  selection: SelectionConfig,
): AppliedSelection {
  const result: AppliedSelection = {
    commands: new Map(),
    rules: new Map(),
    mcps: {},
  };

  // Apply rules selection
  if (selection.rules) {
    for (const [filename, content] of preset.rules.entries()) {
      if (matchesPattern(filename, selection.rules)) {
        result.rules.set(filename, content);
      }
    }
  }

  // Apply commands selection
  if (selection.commands) {
    for (const [filename, content] of preset.commands.entries()) {
      if (matchesPattern(filename, selection.commands)) {
        result.commands.set(filename, content);
      }
    }
  }

  // Apply MCPs selection
  if (selection.mcps) {
    for (const mcpName of selection.mcps) {
      if (preset.mcps[mcpName]) {
        result.mcps[mcpName] = preset.mcps[mcpName];
      }
    }
  }

  return result;
}

/**
 * Check if filename matches file selection patterns
 */
function matchesPattern(
  filename: string,
  fileSelection: { include?: string[]; exclude?: string[] },
): boolean {
  if (!fileSelection?.include || fileSelection.include.length === 0) {
    return false;
  }

  // Check if file matches any include pattern
  const isIncluded = fileSelection.include.some((pattern) =>
    simpleGlobMatch(filename, pattern),
  );

  if (!isIncluded) {
    return false;
  }

  // Check if file is excluded by any exclude pattern
  if (fileSelection.exclude && fileSelection.exclude.length > 0) {
    const isExcluded = fileSelection.exclude.some((pattern) =>
      simpleGlobMatch(filename, pattern),
    );

    return !isExcluded;
  }

  return true;
}

/**
 * Simple glob pattern matching
 */
function simpleGlobMatch(filename: string, pattern: string): boolean {
  return micromatch.isMatch(filename, pattern);
}
