/**
 * Source plugin interface for resolving different preset source types
 * Enables extensible support for GitHub, filesystem, and future source types
 */

export type SourceType = "github" | "filesystem";

// Future source types (v0.4.0+):
// | "git"    - Generic git repositories (GitLab, Bitbucket, self-hosted)
// | "http"   - Direct HTTP downloads

/**
 * Options for resolving a source
 */
export interface ResolveOptions {
  /** Working directory for resolving relative paths */
  cwd?: string;
  /** Disable automatic tool directory detection (for debugging) */
  noToolDetection?: boolean;
}

/**
 * Plugin interface for handling different preset source types
 * Each source type (GitHub, filesystem, etc.) implements this interface
 */
export interface SourcePlugin {
  /**
   * Get the source type this plugin handles
   * @returns The source type identifier
   */
  getType(): SourceType;

  /**
   * Check if this plugin can handle the given source string
   * @param source - Source string to check
   * @returns True if this plugin can handle the source
   */
  canHandle(source: string): boolean;

  /**
   * Validate source format
   * @param source - Source string to validate
   * @throws ValidationError if source format is invalid
   */
  validate(source: string): void;

  /**
   * Resolve source to a local filesystem path
   * @param source - Source string to resolve
   * @param options - Resolution options
   * @returns Promise resolving to local filesystem path
   * @throws Error if resolution fails
   */
  resolve(source: string, options?: ResolveOptions): Promise<string>;

  /**
   * Get cache key for this source (optional, for cacheable sources)
   * @param source - Source string
   * @returns Cache key string, or undefined if not cacheable
   */
  getCacheKey?(source: string): string;
}
