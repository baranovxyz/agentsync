/**
 * Registry orchestrator - coordinates all preset loading operations
 */

import { GitHubResolver } from "./github-resolver.js";
import { PresetLoader } from "./preset-loader.js";
import { Merger, type MergedPresets } from "./merger.js";
import { normalizeExtends } from "../../types/schemas.js";
import { validateConfig } from "../../types/schemas.js";
import { readFile } from "node:fs/promises";
import * as path from "path";

export class RegistryOrchestrator {
  private githubResolver = new GitHubResolver();
  private presetLoader = new PresetLoader();
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
}
