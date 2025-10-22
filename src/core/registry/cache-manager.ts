/**
 * Cache manager for GitHub preset clones
 * Stores cloned repos in ~/.agentsync/cache/
 */

import { readdir, stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ensureDir, pathExists, remove } from "../../utils/fs.js";
import { type GitHubSource, GitHubSourceParser } from "./github-source.js";

export class CacheManager {
  private cacheDir: string;
  private parser = new GitHubSourceParser();

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(os.homedir(), ".agentsync", "cache");
  }

  /**
   * Get cache path for a source
   */
  getCachePath(source: GitHubSource): string {
    const key = this.parser.toCacheKey(source);
    return path.join(this.cacheDir, key);
  }

  /**
   * Check if source is cached
   */
  async isCached(source: GitHubSource): Promise<boolean> {
    const cachePath = this.getCachePath(source);

    // Check if directory exists and has .git
    const gitDir = path.join(cachePath, ".git");
    return await pathExists(gitDir);
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    await remove(this.cacheDir);
    await ensureDir(this.cacheDir);
  }

  /**
   * Clear specific cache
   */
  async clear(source: GitHubSource): Promise<void> {
    const cachePath = this.getCachePath(source);
    await remove(cachePath);
  }

  /**
   * Get metadata about cache
   */
  async getCacheMetadata(source: GitHubSource): Promise<{
    exists: boolean;
    size?: number;
    lastUpdated?: Date;
  }> {
    const cachePath = this.getCachePath(source);
    const exists = await this.isCached(source);

    if (!exists) {
      return { exists: false };
    }

    // Get directory stats
    const stats = await stat(cachePath);

    return {
      exists: true,
      size: await this.getDirectorySize(cachePath),
      lastUpdated: stats.mtime,
    };
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;
    const files = await readdir(dir, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        const stats = await stat(filePath);
        size += stats.size;
      }
    }

    return size;
  }
}
