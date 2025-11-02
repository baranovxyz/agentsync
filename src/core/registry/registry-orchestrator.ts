/**
 * Registry orchestrator - coordinates all preset loading operations
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { SelectionConfig } from "../../types/index.js";
import { normalizeExtends, validateConfig } from "../../types/schemas.js";
import { type MergedPresets, Merger } from "./merger.js";
import { PresetLoader } from "./preset-loader.js";
import { SelectivePresetLoader } from "./selective-preset-loader.js";
import { SourceResolver } from "./source-resolver.js";
import { ToolDirectoryLoader } from "./tool-directory-loader.js";

export class RegistryOrchestrator {
  private presetLoader = new PresetLoader();
  private selectivePresetLoader = new SelectivePresetLoader();
  private toolDirectoryLoader = new ToolDirectoryLoader();
  private merger = new Merger();

  /**
   * Load and merge all presets from config
   */
  async loadAndMerge(
    cwd: string,
    options?: {
      pull?: boolean;
      noToolDetection?: boolean;
    },
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries (always returns objects with namespace)
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      // No presets, return empty
      return {
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };
    }

    // 3. Resolve all sources using SourceResolver (handles GitHub and filesystem)
    const resolver = new SourceResolver();
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        resolver.resolve(entry.source, {
          pull: options?.pull,
          cwd,
          noToolDetection: options?.noToolDetection,
        }),
      ),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map(async (entry, i) => {
        const resolvedPath = resolvedPaths[i];

        // Check for tool directory marker
        if (resolvedPath.startsWith("tool:")) {
          const parts = resolvedPath.split(":");
          if (parts.length !== 3) {
            throw new Error(`Invalid tool marker format: ${resolvedPath}`);
          }
          const [, toolName, actualPath] = parts;
          return this.toolDirectoryLoader.load(
            entry.source,
            actualPath,
            toolName,
            entry.namespace, // Already required by schema
          );
        }

        // Standard preset
        return this.presetLoader.load(
          entry.source,
          resolvedPath,
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          },
        );
      }),
    );

    // 5. Validate no namespace collisions
    this.merger.validateNoCollisions(presets);

    // 6. Merge all presets
    const merged = this.merger.merge(presets);

    return merged;
  }

  /**
   * Load and merge presets with selective filtering based on selections
   */
  async loadAndMergeSelective(
    cwd: string,
    selections: Record<string, SelectionConfig>,
    options?: {
      pull?: boolean;
      noToolDetection?: boolean;
    },
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries (always returns objects with namespace)
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      // No presets, return empty
      return {
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };
    }

    // 3. Resolve all sources using SourceResolver
    const resolver = new SourceResolver();
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        resolver.resolve(entry.source, {
          pull: options?.pull,
          cwd,
          noToolDetection: options?.noToolDetection,
        }),
      ),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map(async (entry, i) => {
        const resolvedPath = resolvedPaths[i];

        // Check for tool directory marker
        if (resolvedPath.startsWith("tool:")) {
          const parts = resolvedPath.split(":");
          if (parts.length !== 3) {
            throw new Error(`Invalid tool marker format: ${resolvedPath}`);
          }
          const [, toolName, actualPath] = parts;
          return this.toolDirectoryLoader.load(
            entry.source,
            actualPath,
            toolName,
            entry.namespace,
          );
        }

        // Standard preset
        return this.presetLoader.load(
          entry.source,
          resolvedPath,
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          },
        );
      }),
    );

    // 5. Create extends entries with selections for SelectivePresetLoader
    const extendsWithSelections = extendsEntries.map((entry) => {
      const source = typeof entry === "string" ? entry : entry.source;
      const selection = selections[source];

      if (selection) {
        // Merge selection with existing entry, preserving namespace and other fields
        if (typeof entry === "string") {
          return {
            source,
            namespace: "", // String entries don't have namespace
            ...selection,
          };
        } else {
          return {
            ...entry, // Preserve all existing fields including namespace
            ...selection,
          };
        }
      } else {
        // No selection, return as is
        return entry;
      }
    });

    // 6. Use SelectivePresetLoader to load and filter
    return this.selectivePresetLoader.load(extendsWithSelections, presets);
  }

  /**
   * Validate selections against preset content
   */
  async validateSelections(
    cwd: string,
    selections: Record<string, SelectionConfig>,
    options?: {
      pull?: boolean;
      noToolDetection?: boolean;
    },
  ): Promise<{ valid: boolean; errors: string[] }> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries (always returns objects with namespace)
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      return { valid: true, errors: [] };
    }

    // 3. Resolve all sources using SourceResolver
    const resolver = new SourceResolver();
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        resolver.resolve(entry.source, {
          pull: options?.pull,
          cwd,
          noToolDetection: options?.noToolDetection,
        }),
      ),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map(async (entry, i) => {
        const resolvedPath = resolvedPaths[i];

        // Check for tool directory marker
        if (resolvedPath.startsWith("tool:")) {
          const parts = resolvedPath.split(":");
          if (parts.length !== 3) {
            throw new Error(`Invalid tool marker format: ${resolvedPath}`);
          }
          const [, toolName, actualPath] = parts;
          return this.toolDirectoryLoader.load(
            entry.source,
            actualPath,
            toolName,
            entry.namespace,
          );
        }

        // Standard preset
        return this.presetLoader.load(
          entry.source,
          resolvedPath,
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          },
        );
      }),
    );

    // 5. Validate selections
    const allErrors: string[] = [];
    for (const preset of presets) {
      if (!preset) {
        continue; // Skip undefined presets
      }

      const selection = selections[preset.source];
      if (selection) {
        const validation = await this.selectivePresetLoader.validateSelection(
          preset,
          selection,
        );
        if (!validation.valid) {
          allErrors.push(...validation.errors);
        }
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }
}
