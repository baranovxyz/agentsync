/**
 * Interactive Selection Configuration Merger
 * Handles merging configurations across the three-level hierarchy
 * and applying file-level selections from presets
 */

import type { SelectionConfig } from "../../types/index.js";
import type { Preset } from "../../types/preset.js";
import { isMatch } from "micromatch";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";

/**
 * Merged configuration result
 */
export interface MergedConfig {
  presets: string[];
  selections: Record<string, SelectionConfig>;
  overrides: Record<string, any>;
  tools: string[];
}

/**
 * Applied selection result
 */
export interface AppliedSelection {
  commands: Map<string, string>;
  rules: Map<string, string>;
  mcps: Record<string, any>;
}

/**
 * Configuration merger for interactive selection system
 */
export class ConfigMerger {
  /**
   * Apply file-level selections to preset content
   */
  applySelections(
    preset: Preset,
    selection: SelectionConfig
  ): AppliedSelection {
    const result: AppliedSelection = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    // Apply rules selection
    if (selection.rules) {
      for (const [filename, content] of preset.rules.entries()) {
        if (this.matchesPattern(filename, selection.rules)) {
          result.rules.set(filename, content);
        }
      }
    }

    // Apply commands selection
    if (selection.commands) {
      for (const [filename, content] of preset.commands.entries()) {
        if (this.matchesPattern(filename, selection.commands)) {
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
  private matchesPattern(
    filename: string,
    fileSelection: { include?: string[]; exclude?: string[] }
  ): boolean {
    if (
      !fileSelection ||
      !fileSelection.include ||
      fileSelection.include.length === 0
    ) {
      return false;
    }

    // Check if file matches any include pattern
    const isIncluded = fileSelection.include.some((pattern) =>
      this.simpleGlobMatch(filename, pattern)
    );

    if (!isIncluded) {
      return false;
    }

    // Check if file is excluded by any exclude pattern
    if (fileSelection.exclude && fileSelection.exclude.length > 0) {
      const isExcluded = fileSelection.exclude.some((pattern) =>
        this.simpleGlobMatch(filename, pattern)
      );

      return !isExcluded;
    }

    return true;
  }

  /**
   * Simple glob pattern matching
   * Supports * and ** patterns, can be replaced with fast-glob if needed
   */
  private simpleGlobMatch(filename: string, pattern: string): boolean {
    return isMatch(filename, pattern);
  }

  /**
   * Validate that all selected MCPs exist in the preset
   */
  validateMCPSelection(
    preset: Preset,
    selection: SelectionConfig
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (selection.mcps) {
      for (const mcpName of selection.mcps) {
        if (!preset.mcps[mcpName]) {
          errors.push(
            `MCP server '${mcpName}' not found in preset '${preset.source}'`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get effective selections for a preset after merging all levels
   */
  getEffectiveSelection(
    presetSource: string,
    mergedConfig: MergedConfig
  ): SelectionConfig | undefined {
    return mergedConfig.selections[presetSource];
  }

  /**
   * Check if a preset has any selections configured
   */
  hasSelections(presetSource: string, mergedConfig: MergedConfig): boolean {
    const selection = mergedConfig.selections[presetSource];
    if (!selection) return false;

    return !!(
      (selection.rules?.include && selection.rules.include.length > 0) ||
      (selection.commands?.include && selection.commands.include.length > 0) ||
      (selection.mcps && selection.mcps.length > 0)
    );
  }

  /**
   * Get all presets that have selections configured
   */
  getPresetsWithSelections(mergedConfig: MergedConfig): string[] {
    return Object.keys(mergedConfig.selections).filter((presetSource) =>
      this.hasSelections(presetSource, mergedConfig)
    );
  }

  /**
   * Merge multiple applied selections from different presets
   */
  mergeAppliedSelections(
    appliedSelections: AppliedSelection[]
  ): AppliedSelection {
    const merged: AppliedSelection = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    for (const selection of appliedSelections) {
      // Merge commands (later selections override earlier ones)
      for (const [filename, content] of selection.commands.entries()) {
        merged.commands.set(filename, content);
      }

      // Merge rules (later selections override earlier ones)
      for (const [filename, content] of selection.rules.entries()) {
        merged.rules.set(filename, content);
      }

      // Merge MCPs (later selections override earlier ones)
      Object.assign(merged.mcps, selection.mcps);
    }

    return merged;
  }

  async saveSelectionsForProject(
    cwd: string,
    selections: Record<string, SelectionConfig>
  ): Promise<void> {
    const configPath = path.join(
      cwd,
      ".agentsync",
      "interactive-selections.json"
    );
    let config: any;

    try {
      const content = await readFile(configPath, "utf-8");
      config = JSON.parse(content);
    } catch (error) {
      // If file doesn't exist or is invalid, create a new one
      config = { version: "2.0" };
    }

    // Update project-level selections
    config.project = {
      ...config.project,
      selections,
    };

    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}
