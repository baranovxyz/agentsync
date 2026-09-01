/**
 * Source plugin interface for supported GitHub and filesystem preset sources.
 */

export type SourceType = "github" | "filesystem";

/**
 * Options for resolving a source
 */
export interface ResolveOptions {
  /** Working directory for resolving relative paths */
  cwd?: string;
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
}
