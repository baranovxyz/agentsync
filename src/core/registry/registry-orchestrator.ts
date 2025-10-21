/**
 * Registry orchestrator - coordinates all preset loading operations
 */

import { GitHubResolver } from "./github-resolver.js";
import { PresetLoader } from "./preset-loader.js";
import { Merger, type MergedPresets } from "./merger.js";
import { SelectivePresetLoader } from "./selective-preset-loader.js";
import { normalizeExtends } from "../../types/schemas.js";
import { validateConfig } from "../../types/schemas.js";
import type { PresetSelection } from "../../types/index.js";
import { readFile } from "node:fs/promises";
import * as path from "path";

export class RegistryOrchestrator {
  private githubResolver = new GitHubResolver();
  private presetLoader = new PresetLoader();
  private selectivePresetLoader = new SelectivePresetLoader();
  private merger = new Merger();

  /**
   * Load and merge all presets from config
   */
  async loadAndMerge(
    cwd: string,
    options?: {
      update?: boolean;
    }
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      // No presets, return empty
      return {
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };
    }

    // 3. Resolve all GitHub sources (clone if needed)
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        this.githubResolver.resolve(entry.source, { update: options?.update })
      )
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) =>
        this.presetLoader.load(
          entry.source,
          resolvedPaths[i],
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          }
        )
      )
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
    selections: Record<string, PresetSelection>,
    options?: {
      update?: boolean;
    }
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      // No presets, return empty
      return {
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };
    }

    // 3. Resolve all GitHub sources (clone if needed)
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        this.githubResolver.resolve(entry.source, { update: options?.update })
      )
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) =>
        this.presetLoader.load(
          entry.source,
          resolvedPaths[i],
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          }
        )
      )
    );

    // 5. Apply selective filtering to presets that have selections
    const filteredResults = await Promise.all(
      presets.map(async (preset) => {
        if (!preset) {
          // Handle undefined preset
          return {
            commands: new Map(),
            rules: new Map(),
            mcps: {},
          };
        }

        const selection = selections[preset.source];
        if (selection) {
          return this.selectivePresetLoader.loadSelective(preset, selection);
        } else {
          // No selection for this preset, return all content
          return {
            commands: new Map(preset.commands),
            rules: new Map(preset.rules),
            mcps: { ...preset.mcps },
          };
        }
      })
    );

    // 6. Merge all filtered results
    const merged =
      this.selectivePresetLoader.mergeFilteredPresets(filteredResults);

    return merged;
  }

  /**
   * Validate selections against preset content
   */
  async validateSelections(
    cwd: string,
    selections: Record<string, PresetSelection>,
    options?: {
      update?: boolean;
    }
  ): Promise<{ valid: boolean; errors: string[] }> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      return { valid: true, errors: [] };
    }

    // 3. Resolve all GitHub sources (clone if needed)
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) =>
        this.githubResolver.resolve(entry.source, { update: options?.update })
      )
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) =>
        this.presetLoader.load(
          entry.source,
          resolvedPaths[i],
          entry.namespace,
          {
            include: entry.include,
            exclude: entry.exclude,
          }
        )
      )
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
          selection
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
