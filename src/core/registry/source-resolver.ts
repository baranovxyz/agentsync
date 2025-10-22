/**
 * Unified source resolver for GitHub repositories and filesystem paths
 * Handles different source types with a consistent interface
 */

import * as path from "path";
import { access } from "node:fs/promises";
import { GitHubResolver } from "./github-resolver.js";
import { CacheManager } from "./cache-manager.js";
import {
  FileSystemError,
  ValidationError,
  SourceResolutionError,
  ErrorHandler,
  ErrorCategory,
} from "../errors.js";

export type SourceType = "github" | "filesystem" | "unknown";

export interface SourceResolveOptions {
  update?: boolean; // Force update if already cached (for GitHub sources)
}

/**
 * Unified source resolver that can handle both GitHub repositories and local filesystem paths
 */
export class SourceResolver {
  private gitHubResolver: GitHubResolver;
  private cacheManager: CacheManager;

  constructor(cacheManager?: CacheManager) {
    this.cacheManager = cacheManager || new CacheManager();
    this.gitHubResolver = new GitHubResolver(this.cacheManager);
  }

  /**
   * Resolve a source string to a local filesystem path
   * @param source - Source string (github:org/repo or filesystem path)
   * @param options - Resolution options
   * @returns Resolved local path
   */
  async resolve(
    source: string,
    options?: SourceResolveOptions
  ): Promise<string> {
    try {
      // Validate source format first
      this.validateSource(source);

      const sourceType = this.getSourceType(source);

      switch (sourceType) {
        case "github":
          return await this.resolveGitHubSource(source, options);
        case "filesystem":
          return await this.resolveFilesystemSource(source);
        default:
          throw new SourceResolutionError(
            `Unsupported source type: ${source}`,
            source
          );
      }
    } catch (error) {
      if (
        error instanceof SourceResolutionError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        `Failed to resolve source: ${source}`,
        ErrorCategory.NETWORK,
        { source, options }
      );
    }
  }

  /**
   * Validate that a source string has a valid format
   * @param source - Source string to validate
   */
  validateSource(source: string): void {
    if (!source || typeof source !== "string") {
      throw new SourceResolutionError(
        "Source must be a non-empty string",
        source
      );
    }

    const sourceType = this.getSourceType(source);

    if (sourceType === "unknown") {
      throw new SourceResolutionError(
        `Invalid source format: ${source}. Supported formats:\n` +
          `- GitHub: github:org/repo[@ref]\n` +
          `- Filesystem: /absolute/path or ./relative/path`,
        source
      );
    }

    // Additional validation for GitHub sources
    if (sourceType === "github") {
      this.validateGitHubSource(source);
    }
  }

  /**
   * Get the type of a source string
   * @param source - Source string
   * @returns Source type
   */
  getSourceType(source: string): SourceType {
    if (this.isGitHubSource(source)) {
      return "github";
    }

    if (this.isFilesystemSource(source)) {
      return "filesystem";
    }

    return "unknown";
  }

  /**
   * Check if a source string is a GitHub repository
   * @param source - Source string
   * @returns True if GitHub source
   */
  isGitHubSource(source: string): boolean {
    return source.startsWith("github:");
  }

  /**
   * Check if a source string is a filesystem path
   * @param source - Source string
   * @returns True if filesystem source
   */
  isFilesystemSource(source: string): boolean {
    // Empty string is not a filesystem source
    if (!source || source.trim() === "") {
      return false;
    }

    // Check if it's an absolute path
    if (path.isAbsolute(source)) {
      return true;
    }

    // Check if it's a relative path (starts with ./, ../)
    if (source.startsWith("./") || source.startsWith("../")) {
      return true;
    }

    // Check if it's a simple relative path (no colons, no URL-like patterns)
    // But exclude URLs and other protocols, and invalid formats
    return (
      !source.includes(":") &&
      !source.includes("://") &&
      !source.startsWith("http") &&
      !source.startsWith("ftp") &&
      !source.startsWith("git@") &&
      !source.includes(" ") &&
      source.trim().length > 0
    );
  }

  /**
   * Resolve a GitHub source to a local path
   * @param source - GitHub source string
   * @param options - Resolution options
   * @returns Resolved local path
   */
  private async resolveGitHubSource(
    source: string,
    options?: SourceResolveOptions
  ): Promise<string> {
    try {
      return await this.gitHubResolver.resolve(source, options);
    } catch (error) {
      if (error instanceof Error) {
        throw new FileSystemError(
          `Failed to resolve GitHub source: ${source}`,
          undefined,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Resolve a filesystem source to a local path
   * @param source - Filesystem path
   * @returns Resolved local path
   */
  private async resolveFilesystemSource(source: string): Promise<string> {
    let resolvedPath: string;

    // Resolve relative paths against current working directory
    if (path.isAbsolute(source)) {
      resolvedPath = source;
    } else {
      resolvedPath = path.resolve(process.cwd(), source);
    }

    // Check if the path exists and is accessible
    try {
      await access(resolvedPath);
    } catch (error) {
      throw new FileSystemError(
        `Filesystem source not accessible: ${source}`,
        resolvedPath,
        error as Error
      );
    }

    return resolvedPath;
  }

  /**
   * Validate GitHub source format
   * @param source - GitHub source string
   */
  private validateGitHubSource(source: string): void {
    // Basic format validation - more detailed validation happens in GitHubSourceParser
    const githubPattern =
      /^github:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/;

    if (!githubPattern.test(source)) {
      throw new SourceResolutionError(
        `Invalid GitHub source format: ${source}. Expected format: github:org/repo[@ref]`,
        source
      );
    }
  }
}
