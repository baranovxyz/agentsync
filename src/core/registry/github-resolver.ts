/**
 * GitHub resolver - clones repos to cache with SSH/HTTPS fallback
 */

import { execa } from "execa";
import { FileSystemError } from "../errors.js";
import { CacheManager } from "./cache-manager.js";
import { type GitHubSource, GitHubSourceParser } from "./github-source.js";

export class GitHubResolver {
  private cache: CacheManager;
  private parser = new GitHubSourceParser();

  constructor(cacheManager?: CacheManager) {
    this.cache = cacheManager || new CacheManager();
  }

  /**
   * Resolve GitHub source to local path (clone if needed)
   */
  async resolve(
    sourceString: string,
    options?: {
      update?: boolean; // Force update if already cached
    },
  ): Promise<string> {
    const source = this.parser.parse(sourceString);
    const cachePath = this.cache.getCachePath(source);
    const isCached = await this.cache.isCached(source);

    if (isCached && !options?.update) {
      // Already cached, return path
      return cachePath;
    }

    if (isCached && options?.update) {
      // Update existing clone
      return await this.update(source, cachePath);
    }

    // Clone fresh
    return await this.clone(source, cachePath);
  }

  /**
   * Clone repository
   */
  private async clone(
    source: GitHubSource,
    cachePath: string,
  ): Promise<string> {
    // Try SSH first, fall back to HTTPS
    const sshUrl = `git@github.com:${source.org}/${source.repo}.git`;
    const httpsUrl = `https://github.com/${source.org}/${source.repo}.git`;

    try {
      await execa("git", ["clone", "--branch", source.ref, sshUrl, cachePath]);
      return cachePath;
    } catch (sshError) {
      // SSH failed, try HTTPS
      try {
        await execa("git", [
          "clone",
          "--branch",
          source.ref,
          httpsUrl,
          cachePath,
        ]);
        return cachePath;
      } catch (httpsError) {
        throw new FileSystemError(
          `Failed to clone ${source.org}/${source.repo}`,
          cachePath,
          new Error(
            `Both SSH and HTTPS failed.\n\n` +
              `SSH error: ${(sshError as Error).message}\n` +
              `HTTPS error: ${(httpsError as Error).message}\n\n` +
              `Make sure:\n` +
              `1. Repository exists: https://github.com/${source.org}/${source.repo}\n` +
              `2. You have access (private repos require authentication)\n` +
              `3. Git is installed: git --version`,
          ),
        );
      }
    }
  }

  /**
   * Update existing clone (git pull)
   */
  private async update(
    source: GitHubSource,
    cachePath: string,
  ): Promise<string> {
    try {
      await execa("git", ["pull"], { cwd: cachePath });
      return cachePath;
    } catch (error) {
      throw new FileSystemError(
        `Failed to update ${source.org}/${source.repo}`,
        cachePath,
        error as Error,
      );
    }
  }
}
