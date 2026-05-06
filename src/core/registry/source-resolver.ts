/**
 * Unified source resolver using plugin architecture
 * Handles different source types through registered plugins
 */

import {
  ErrorCategory,
  SourceResolutionError,
  ValidationError,
  wrapError,
} from "../errors.js";
import { FilesystemSourcePlugin } from "./filesystem-source-plugin.js";
import { GitHubResolver } from "./github-resolver.js";
import { GitHubSourcePlugin } from "./github-source-plugin.js";
import type { ResolveOptions, SourceType } from "./source-plugin.js";
import { SourcePluginRegistry } from "./source-plugin-registry.js";

// Legacy export for backward compatibility
export type { SourceType };
export type SourceResolveOptions = ResolveOptions;

/**
 * Unified source resolver that uses plugins to handle different source types
 * Supports GitHub repositories and local filesystem paths out of the box
 */
export class SourceResolver {
  private registry: SourcePluginRegistry;

  constructor() {
    this.registry = new SourcePluginRegistry();

    // Register built-in plugins
    this.registry.register(new GitHubSourcePlugin(new GitHubResolver()));
    this.registry.register(new FilesystemSourcePlugin());
  }

  /**
   * Resolve a source string to a local filesystem path
   * @param source - Source string (github:org/repo, fs:path, or filesystem path)
   * @param options - Resolution options
   * @returns Resolved local path
   */
  async resolve(
    source: string,
    options?: SourceResolveOptions,
  ): Promise<string> {
    try {
      // Intentional: validateSource checks format, then getPlugin resolves — separate concerns
      this.validateSource(source);

      const plugin = this.registry.getPlugin(source);

      if (!plugin) {
        const supportedTypes = this.registry.getSupportedTypes();
        throw new SourceResolutionError(
          `Unsupported source type: ${source}\n` +
            `Supported types: ${supportedTypes.join(", ")}`,
          source,
        );
      }

      // Resolve using the appropriate plugin
      return await plugin.resolve(source, options);
    } catch (error) {
      if (
        error instanceof SourceResolutionError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      throw wrapError(
        error,
        `Failed to resolve source: ${source}`,
        ErrorCategory.NETWORK,
        { source, options },
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
        source,
      );
    }

    const plugin = this.registry.getPlugin(source);

    if (!plugin) {
      throw new SourceResolutionError(
        `Invalid source format: ${source}. Supported formats:\n` +
          `- GitHub: github:org/repo[@ref]\n` +
          `- Filesystem: fs:./path, /absolute/path, or ./relative/path`,
        source,
      );
    }

    // Validate using the appropriate plugin
    plugin.validate(source);
  }

  /**
   * Get the type of a source string
   * @param source - Source string
   * @returns Source type or "unknown" if no plugin can handle it
   */
  getSourceType(source: string): SourceType | "unknown" {
    const plugin = this.registry.getPlugin(source);
    return plugin ? plugin.getType() : "unknown";
  }
}
