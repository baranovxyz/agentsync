/**
 * Selective Preset Loader - loads and filters preset content based on file-level selections
 */

import type { Preset, PresetSelection } from "../../types/index.js";
import { isMatch } from "micromatch";

/**
 * Result of selective preset loading
 */
export interface SelectivePresetResult {
  commands: Map<string, string>;
  rules: Map<string, string>;
  mcps: Record<string, any>;
}

/**
 * Validation result for preset selection
 */
export interface SelectionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Selective preset loader that can filter preset content based on selections
 */
export class SelectivePresetLoader {
  /**
   * Load preset content selectively based on selection criteria
   */
  async loadSelective(
    preset: Preset,
    selection?: PresetSelection
  ): Promise<SelectivePresetResult> {
    const result: SelectivePresetResult = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    if (!selection) {
      // If no selection provided, return all content
      return {
        commands: new Map(preset.commands),
        rules: new Map(preset.rules),
        mcps: { ...preset.mcps },
      };
    }

    // Filter rules based on selection
    if (selection.rules) {
      for (const [filename, content] of preset.rules.entries()) {
        if (this.matchesPattern(filename, selection.rules)) {
          result.rules.set(filename, content);
        }
      }
    }

    // Filter commands based on selection
    if (selection.commands) {
      for (const [filename, content] of preset.commands.entries()) {
        if (this.matchesPattern(filename, selection.commands)) {
          result.commands.set(filename, content);
        }
      }
    }

    // Filter MCPs based on selection
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
   * Merge multiple filtered preset results
   * Later presets override earlier ones for conflicting keys
   */
  mergeFilteredPresets(
    results: SelectivePresetResult[]
  ): SelectivePresetResult {
    const merged: SelectivePresetResult = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    for (const result of results) {
      // Merge commands (later results override earlier ones)
      for (const [filename, content] of result.commands.entries()) {
        merged.commands.set(filename, content);
      }

      // Merge rules (later results override earlier ones)
      for (const [filename, content] of result.rules.entries()) {
        merged.rules.set(filename, content);
      }

      // Merge MCPs (later results override earlier ones)
      Object.assign(merged.mcps, result.mcps);
    }

    return merged;
  }

  /**
   * Validate that selection patterns match existing content in preset
   */
  async validateSelection(
    preset: Preset,
    selection: PresetSelection
  ): Promise<SelectionValidationResult> {
    const errors: string[] = [];

    // Validate rule file patterns
    if (selection.rules) {
      // Check for specific file patterns that don't exist
      if (selection.rules.include) {
        for (const pattern of selection.rules.include) {
          // If pattern looks like a specific file (not a glob), check if it exists
          if (
            !pattern.includes("*") &&
            !pattern.includes("?") &&
            !pattern.includes("[")
          ) {
            if (!preset.rules.has(pattern)) {
              errors.push(
                `Rule file '${pattern}' not found in preset '${preset.source}'`
              );
            }
          } else {
            // For glob patterns, check if any files match
            const hasMatches = Array.from(preset.rules.keys()).some(
              (filename) => isMatch(filename, pattern)
            );
            if (!hasMatches) {
              errors.push(`No rule files match include pattern: ${pattern}`);
            }
          }
        }
      }
    }

    // Validate command file patterns
    if (selection.commands) {
      // Check for specific file patterns that don't exist
      if (selection.commands.include) {
        for (const pattern of selection.commands.include) {
          // If pattern looks like a specific file (not a glob), check if it exists
          if (
            !pattern.includes("*") &&
            !pattern.includes("?") &&
            !pattern.includes("[")
          ) {
            if (!preset.commands.has(pattern)) {
              errors.push(
                `Command file '${pattern}' not found in preset '${preset.source}'`
              );
            }
          } else {
            // For glob patterns, check if any files match
            const hasMatches = Array.from(preset.commands.keys()).some(
              (filename) => isMatch(filename, pattern)
            );
            if (!hasMatches) {
              errors.push(`No command files match include pattern: ${pattern}`);
            }
          }
        }
      }
    }

    // Validate MCP names
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
   * Check if filename matches file selection patterns
   */
  private matchesPattern(
    filename: string,
    fileSelection: NonNullable<PresetSelection["rules" | "commands"]>
  ): boolean {
    if (!fileSelection.include || fileSelection.include.length === 0) {
      return false;
    }

    // Check if file matches any include pattern
    const isIncluded = fileSelection.include.some((pattern) =>
      isMatch(filename, pattern)
    );

    if (!isIncluded) {
      return false;
    }

    // Check if file is excluded by any exclude pattern
    if (fileSelection.exclude && fileSelection.exclude.length > 0) {
      const isExcluded = fileSelection.exclude.some((pattern) =>
        isMatch(filename, pattern)
      );

      return !isExcluded;
    }

    return true;
  }

  /**
   * Get statistics about what would be loaded with a selection
   */
  async getSelectionStats(
    preset: Preset,
    selection?: PresetSelection
  ): Promise<{
    totalCommands: number;
    selectedCommands: number;
    totalRules: number;
    selectedRules: number;
    totalMcps: number;
    selectedMcps: number;
  }> {
    const totalCommands = preset.commands.size;
    const totalRules = preset.rules.size;
    const totalMcps = Object.keys(preset.mcps).length;

    if (!selection) {
      return {
        totalCommands,
        selectedCommands: totalCommands,
        totalRules,
        selectedRules: totalRules,
        totalMcps,
        selectedMcps: totalMcps,
      };
    }

    let selectedCommands = 0;
    let selectedRules = 0;
    let selectedMcps = 0;

    // Count selected rules
    if (selection.rules) {
      for (const [filename] of preset.rules.entries()) {
        if (this.matchesPattern(filename, selection.rules)) {
          selectedRules++;
        }
      }
    }

    // Count selected commands
    if (selection.commands) {
      for (const [filename] of preset.commands.entries()) {
        if (this.matchesPattern(filename, selection.commands)) {
          selectedCommands++;
        }
      }
    }

    // Count selected MCPs
    if (selection.mcps) {
      for (const mcpName of selection.mcps) {
        if (preset.mcps[mcpName]) {
          selectedMcps++;
        }
      }
    }

    return {
      totalCommands,
      selectedCommands,
      totalRules,
      selectedRules,
      totalMcps,
      selectedMcps,
    };
  }

  /**
   * Check if a selection would result in empty content
   */
  async isEmptySelection(
    preset: Preset,
    selection?: PresetSelection
  ): Promise<boolean> {
    const stats = await this.getSelectionStats(preset, selection);
    return (
      stats.selectedCommands === 0 &&
      stats.selectedRules === 0 &&
      stats.selectedMcps === 0
    );
  }
}

/**
 * Default selective preset loader instance
 */
export const selectivePresetLoader = new SelectivePresetLoader();
