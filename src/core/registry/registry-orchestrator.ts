/**
 * Registry orchestrator - coordinates all library loading operations
 */

import { GitHubResolver } from './github-resolver.js';
import { LibraryLoader } from './library-loader.js';
import { Merger, type MergedLibraries } from './merger.js';
import { normalizeExtends } from '../../types/schemas.js';
import { validateConfig } from '../../types/schemas.js';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

export class RegistryOrchestrator {
  private githubResolver = new GitHubResolver();
  private libraryLoader = new LibraryLoader();
  private merger = new Merger();

  /**
   * Load and merge all libraries from config
   */
  async loadAndMerge(
    cwd: string,
    options?: {
      update?: boolean;
    }
  ): Promise<MergedLibraries> {
    // 1. Load config
    const configPath = path.join(cwd, '.agentsync', 'config.json');
    const configContent = await readFile(configPath, 'utf-8');
    const config = validateConfig(JSON.parse(configContent));

    // 2. Normalize extends entries
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      // No libraries, return empty
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

    // 4. Load all libraries
    const libraries = await Promise.all(
      extendsEntries.map((entry, i) =>
        this.libraryLoader.load(entry.source, resolvedPaths[i], entry.namespace, {
          include: entry.include,
          exclude: entry.exclude,
        })
      )
    );

    // 5. Validate no namespace collisions
    this.merger.validateNoCollisions(libraries);

    // 6. Merge all libraries
    const merged = this.merger.merge(libraries);

    return merged;
  }
}
