/**
 * Interactive Selection Configuration Merger
 * Handles merging configurations across the three-level hierarchy
 * and applying file-level selections from presets
 */

import type {
  InteractiveSelectionConfig,
  PresetSelection,
  FileSelection,
} from "../../types/index.js";
import type { Preset } from "../../types/preset.js";
import { isMatch } from "micromatch";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";
import { validateInteractiveSelectionConfig } from "../../types/schemas.js";

/**
 * Merged configuration result
 */
export interface MergedConfig {
  presets: string[];
  selections: Record<string, PresetSelection>;
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
   * Merge configurations from user/project/local levels
   * Priority order: user -> project -> local (later levels override earlier ones)
   */
  mergeConfig(config: InteractiveSelectionConfig): MergedConfig {
    const presets: string[] = [];
    const selections: Record<string, PresetSelection> = {};
    const overrides: Record<string, any> = {};
    const tools: string[] = [];

    // Collect presets from user level
    if (config.user?.presets) {
      presets.push(...config.user.presets);
    }

    // Merge selections in priority order: user -> project -> local
    // Later levels override earlier ones for the same preset, but merge at field level
    if (config.user?.defaultSelections) {
      for (const [preset, selection] of Object.entries(
        config.user.defaultSelections
      )) {
        selections[preset] = { ...selection };
      }
    }
    if (config.project?.selections) {
      for (const [preset, selection] of Object.entries(
        config.project.selections
      )) {
        // Merge with existing selection if it exists
        const existing = selections[preset] || {};
        selections[preset] = {
          ...existing,
          ...selection,
        };
      }
    }
    if (config.local?.selections) {
      for (const [preset, selection] of Object.entries(
        config.local.selections
      )) {
        // Merge with existing selection if it exists
        const existing = selections[preset] || {};
        selections[preset] = {
          ...existing,
          ...selection,
        };
      }
    }

    // Merge overrides in priority order: project -> local
    if (config.project?.overrides) {
      Object.assign(overrides, config.project.overrides);
    }
    if (config.local?.overrides) {
      Object.assign(overrides, config.local.overrides);
    }

    // Collect tools from project level
    if (config.project?.tools) {
      tools.push(...config.project.tools);
    }

    return { presets, selections, overrides, tools };
  }

  /**
   * Apply file-level selections to preset content
   */
  applySelections(
    preset: Preset,
    selection: PresetSelection
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
    fileSelection: FileSelection
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
    selection: PresetSelection
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
  ): PresetSelection | undefined {
    return mergedConfig.selections[presetSource];
  }

  /**
   * Check if a preset has any selections configured
   */
  hasSelections(presetSource: string, mergedConfig: MergedConfig): boolean {
    const selection = mergedConfig.selections[presetSource];
    if (!selection) return false;

    return !!(
      (selection.rules && selection.rules.include.length > 0) ||
      (selection.commands && selection.commands.include.length > 0) ||
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

  /**
   * Load selections for a project from the interactive selection config
   */
  async loadSelectionsForProject(
    cwd: string
  ): Promise<Record<string, PresetSelection>> {
    const configPath = path.join(
      cwd,
      ".agentsync",
      "interactive-selection.json"
    );

    try {
      const configContent = await readFile(configPath, "utf-8");
      const config = validateInteractiveSelectionConfig(
        JSON.parse(configContent)
      );
      const mergedConfig = this.mergeConfig(config);
      return mergedConfig.selections;
    } catch (error) {
      // If file doesn't exist or is invalid, return empty selections
      return {};
    }
  }

  /**
   * Save selections for a project to the interactive selection config
   */
  async saveSelectionsForProject(
    cwd: string,
    selections: Record<string, PresetSelection>
  ): Promise<void> {
    const configPath = path.join(
      cwd,
      ".agentsync",
      "interactive-selection.json"
    );

    try {
      let config: InteractiveSelectionConfig;

      try {
        // Load existing config
        const configContent = await readFile(configPath, "utf-8");
        config = validateInteractiveSelectionConfig(JSON.parse(configContent));
      } catch {
        // Create new config if file doesn't exist
        config = { version: "2.0" };
      }

      // Ensure project config exists
      if (!config.project) {
        config.project = {};
      }

      // Update selections
      config.project.selections = selections;

      // Save updated config
      await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
      throw new Error(`Failed to save selections: ${(error as Error).message}`);
    }
  }
}

/**
 * Default merger instance
 */
export const configMerger = new ConfigMerger();

/**
 * Load selections for a project (convenience function)
 */
export async function loadSelectionsForProject(
  cwd: string
): Promise<Record<string, PresetSelection>> {
  return configMerger.loadSelectionsForProject(cwd);
}

/**
 * Save selections for a project (convenience function)
 */
export async function saveSelectionsForProject(
  cwd: string,
  selections: Record<string, PresetSelection>
): Promise<void> {
  return configMerger.saveSelectionsForProject(cwd, selections);
}
