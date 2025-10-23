/**
 * Registry orchestrator - coordinates all preset loading operations
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { SelectionConfig } from "../../types/index.js";
import { validateConfig } from "../../types/schemas.js";
import { GitHubResolver } from "./github-resolver.js";
import { type MergedPresets, Merger } from "./merger.js";
import { PresetLoader } from "./preset-loader.js";
import { SelectivePresetLoader } from "./selective-preset-loader.js";

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
    },
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = config.extends || [];

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
      extendsEntries.map((entry) => {
        const source = typeof entry === "string" ? entry : entry.source;
        return this.githubResolver.resolve(source, { update: options?.update });
      }),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) => {
        const source = typeof entry === "string" ? entry : entry.source;
        const namespace =
          typeof entry === "string" ? "" : (entry as any).namespace;
        return this.presetLoader.load(
          source,
          resolvedPaths[i],
          namespace || "",
          {},
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
      update?: boolean;
    },
  ): Promise<MergedPresets> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = config.extends || [];

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
      extendsEntries.map((entry) => {
        const source = typeof entry === "string" ? entry : entry.source;
        return this.githubResolver.resolve(source, { update: options?.update });
      }),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) => {
        const source = typeof entry === "string" ? entry : entry.source;
        const namespace =
          typeof entry === "string" ? "" : (entry as any).namespace;
        return this.presetLoader.load(
          source,
          resolvedPaths[i],
          namespace || "",
          {},
        );
      }),
    );

    // 5. Create extends entries with selections for SelectivePresetLoader
    const extendsWithSelections = extendsEntries.map((entry) => {
      const source = typeof entry === "string" ? entry : entry.source;
      const selection = selections[source];

      if (selection) {
        return {
          source,
          select: selection,
        };
      } else if (typeof entry !== "string" && entry.select) {
        // Use existing selection from config
        return entry;
      } else {
        // No selection, return as string for backward compatibility
        return source;
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
      update?: boolean;
    },
  ): Promise<{ valid: boolean; errors: string[] }> {
    // 1. Load config
    const configPath = path.join(cwd, ".agentsync", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = config.extends || [];

    if (extendsEntries.length === 0) {
      return { valid: true, errors: [] };
    }

    // 3. Resolve all GitHub sources (clone if needed)
    const resolvedPaths = await Promise.all(
      extendsEntries.map((entry) => {
        const source = typeof entry === "string" ? entry : entry.source;
        return this.githubResolver.resolve(source, { update: options?.update });
      }),
    );

    // 4. Load all presets
    const presets = await Promise.all(
      extendsEntries.map((entry, i) => {
        const source = typeof entry === "string" ? entry : entry.source;
        const namespace =
          typeof entry === "string" ? "" : (entry as any).namespace;
        return this.presetLoader.load(
          source,
          resolvedPaths[i],
          namespace || "",
          {},
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
