/**
 * Selective Preset Loader - loads and filters preset content based on file-level selections
 */

import micromatch from "micromatch";
import type {
  CanonicalCommand,
  CanonicalRule,
  Extends,
  Preset,
  SelectionConfig,
} from "../../types/index.js";
import {
  ErrorCategory,
  ErrorHandler,
  SelectiveLoadingError,
} from "../errors.js";
import type { MCP } from "../mcp/tokens.js";

/**
 * Result of selective preset loading in canonical format
 */
export interface SelectivePresetResult {
  commands: Map<string, CanonicalCommand>;
  rules: Map<string, CanonicalRule>;
  mcps: Record<string, MCP>;
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
   * Load and filter presets based on extends array with select criteria
   */
  async load(
    extendsEntries: Extends[],
    presets: Preset[],
  ): Promise<SelectivePresetResult> {
    try {
      if (!extendsEntries || extendsEntries.length === 0) {
        return {
          commands: new Map(),
          rules: new Map(),
          mcps: {},
        };
      }

      if (!presets || presets.length !== extendsEntries.length) {
        throw new SelectiveLoadingError(
          "Presets array length must match extends entries length",
          "",
          "load",
        );
      }

      // Process each preset with its selection criteria
      const filteredResults = await Promise.all(
        extendsEntries.map(async (entry, index) => {
          const preset = presets[index];
          if (!preset) {
            return {
              commands: new Map(),
              rules: new Map(),
              mcps: {},
            };
          }

          // Extract selection criteria from the extends entry
          let selection: SelectionConfig | undefined;
          if (typeof entry !== "string" && (entry.include || entry.exclude)) {
            // Build selection from include/exclude arrays
            selection = {
              rules: {
                include: entry.include,
                exclude: entry.exclude,
              },
              commands: {
                include: entry.include,
                exclude: entry.exclude,
              },
            };
          }

          // Apply selective filtering if selection criteria exists
          if (selection) {
            return this.loadSelective(preset, selection);
          } else {
            // No selection criteria, return all content
            return {
              commands: new Map(preset.commands),
              rules: new Map(preset.rules),
              mcps: { ...preset.mcps },
            };
          }
        }),
      );

      // Merge all filtered results with namespace formatting
      return this.mergeFilteredPresetsWithNamespaces(filteredResults, presets);
    } catch (error) {
      if (error instanceof SelectiveLoadingError) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        "Failed to load presets with select criteria",
        ErrorCategory.PARSE,
        { extendsEntries, presets },
      );
    }
  }

  /**
   * Load preset content selectively based on selection criteria
   */
  async loadSelective(
    preset: Preset,
    selection?: SelectionConfig,
  ): Promise<SelectivePresetResult> {
    try {
      // Validate preset structure
      if (!preset || typeof preset !== "object") {
        throw new SelectiveLoadingError(
          "Invalid preset data provided",
          undefined,
          "preset",
        );
      }

      if (!(preset.rules && preset.commands && preset.mcps)) {
        throw new SelectiveLoadingError(
          "Preset data is missing required properties",
          preset.source,
          "preset",
        );
      }

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

      // Validate selection structure
      if (typeof selection !== "object") {
        throw new SelectiveLoadingError(
          "Invalid selection data provided",
          preset?.source,
          "selection",
        );
      }

      // Filter rules based on selection
      if (selection.rules) {
        if (typeof selection.rules !== "object") {
          throw new SelectiveLoadingError(
            "Invalid rules selection configuration",
            preset?.source,
            "rules",
          );
        }

        for (const [filename, content] of preset.rules.entries()) {
          if (this.matchesPattern(filename, selection.rules)) {
            result.rules.set(filename, content);
          }
        }
      }

      // Filter commands based on selection
      if (selection.commands) {
        if (typeof selection.commands !== "object") {
          throw new SelectiveLoadingError(
            "Invalid commands selection configuration",
            preset?.source,
            "commands",
          );
        }

        for (const [filename, content] of preset.commands.entries()) {
          if (this.matchesPattern(filename, selection.commands)) {
            result.commands.set(filename, content);
          }
        }
      }

      // Filter MCPs based on selection
      if (selection.mcps) {
        if (!Array.isArray(selection.mcps)) {
          throw new SelectiveLoadingError(
            "Invalid MCPs selection configuration",
            preset?.source,
            "mcps",
          );
        }

        for (const mcpName of selection.mcps) {
          if (preset.mcps[mcpName]) {
            result.mcps[mcpName] = preset.mcps[mcpName];
          }
        }
      }

      return result;
    } catch (error) {
      if (error instanceof SelectiveLoadingError) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        "Failed to load preset content selectively",
        ErrorCategory.PARSE,
        { presetSource: preset?.source, selection },
      );
    }
  }

  /**
   * Merge multiple filtered preset results
   * Later presets override earlier ones for conflicting keys
   */
  mergeFilteredPresets(
    results: SelectivePresetResult[],
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
   * Merge multiple filtered preset results with namespace formatting
   * This is used when we need to maintain the namespace_filename format
   */
  mergeFilteredPresetsWithNamespaces(
    results: SelectivePresetResult[],
    presets: Preset[],
  ): SelectivePresetResult {
    const merged: SelectivePresetResult = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const preset = presets[i];

      if (!preset) continue;

      // Merge commands with namespace formatting
      for (const [filename, content] of result.commands.entries()) {
        const namespacedKey = `${preset.namespace}_${filename}`;
        merged.commands.set(namespacedKey, content);
      }

      // Merge rules with namespace formatting
      for (const [filename, content] of result.rules.entries()) {
        const namespacedKey = `${preset.namespace}_${filename}`;
        merged.rules.set(namespacedKey, content);
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
    selection: SelectionConfig,
  ): Promise<SelectionValidationResult> {
    const errors: string[] = [];

    // Validate rule file patterns
    if (selection.rules) {
      // Check for specific file patterns that don't exist
      if (selection.rules.include) {
        for (const pattern of selection.rules.include) {
          // If pattern looks like a specific file (not a glob), check if it exists
          if (
            !(
              pattern.includes("*") ||
              pattern.includes("?") ||
              pattern.includes("[")
            )
          ) {
            const found = Array.from(preset.rules.keys()).some((filename) =>
              this.simpleGlobMatch(filename, pattern),
            );
            if (!found) {
              errors.push(
                `Rule file not found for include pattern '${pattern}' in preset '${preset.source}'`,
              );
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
            !(
              pattern.includes("*") ||
              pattern.includes("?") ||
              pattern.includes("[")
            )
          ) {
            const found = Array.from(preset.commands.keys()).some((filename) =>
              this.simpleGlobMatch(filename, pattern),
            );
            if (!found) {
              errors.push(
                `Command file not found for include pattern '${pattern}' in preset '${preset.source}'`,
              );
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
            `MCP server '${mcpName}' not found in preset '${preset.source}'`,
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
    fileSelection: { include?: string[]; exclude?: string[] },
  ): boolean {
    if (!fileSelection?.include || fileSelection.include.length === 0) {
      return false;
    }

    // Check if file matches any include pattern
    const isIncluded = fileSelection.include.some((pattern) =>
      this.simpleGlobMatch(filename, pattern),
    );

    if (!isIncluded) {
      return false;
    }

    // Check if file is excluded by any exclude pattern
    if (fileSelection.exclude && fileSelection.exclude.length > 0) {
      const isExcluded = fileSelection.exclude.some((pattern) =>
        this.simpleGlobMatch(filename, pattern),
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
    return micromatch.isMatch(filename, pattern);
  }

  /**
   * Get statistics about the selection
   */
  async getSelectionStats(
    preset: Preset,
    selection: SelectionConfig,
  ): Promise<{
    rules: { included: number; excluded: number; total: number };
    commands: { included: number; excluded: number; total: number };
    mcps: { included: number; excluded: number; total: number };
  }> {
    const result = await this.loadSelective(preset, selection);

    return {
      rules: {
        included: result.rules.size,
        excluded: preset.rules.size - result.rules.size,
        total: preset.rules.size,
      },
      commands: {
        included: result.commands.size,
        excluded: preset.commands.size - result.commands.size,
        total: preset.commands.size,
      },
      mcps: {
        included: Object.keys(result.mcps).length,
        excluded:
          Object.keys(preset.mcps).length - Object.keys(result.mcps).length,
        total: Object.keys(preset.mcps).length,
      },
    };
  }

  /**
   * Check if a selection is empty
   */
  async isEmptySelection(selection: SelectionConfig): Promise<boolean> {
    return (
      (!selection.rules?.include || selection.rules.include.length === 0) &&
      (!selection.commands?.include ||
        selection.commands.include.length === 0) &&
      (!selection.mcps || selection.mcps.length === 0)
    );
  }
}
