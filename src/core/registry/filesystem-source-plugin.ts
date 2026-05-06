/**
 * Filesystem source plugin
 * Handles local directory paths as preset sources
 */

import { access, stat } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "../../utils/fs.js";
import { FileSystemError, ValidationError } from "../errors.js";
import type {
  ResolveOptions,
  SourcePlugin,
  SourceType,
} from "./source-plugin.js";

/**
 * Plugin for handling filesystem directory sources
 * Supports fs:, absolute paths, and relative paths (./, ../)
 */
export class FilesystemSourcePlugin implements SourcePlugin {
  getType(): SourceType {
    return "filesystem";
  }

  canHandle(source: string): boolean {
    // Empty string is not a filesystem source
    if (!source || source.trim() === "") {
      return false;
    }

    // Handle fs: prefix
    if (source.startsWith("fs:")) {
      return true;
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
    // This provides backward compatibility with the old implementation
    return (
      !(
        source.includes(":") ||
        source.includes("://") ||
        source.startsWith("http") ||
        source.startsWith("ftp") ||
        source.startsWith("git@") ||
        source.includes(" ")
      ) && source.trim().length > 0
    );
  }

  validate(source: string): void {
    const cleanPath = this.cleanSource(source);

    // Prevent path traversal attacks (except in relative paths starting with ../)
    if (cleanPath.includes("..") && !cleanPath.startsWith("../")) {
      const err = new ValidationError(
        `Path traversal not allowed except in relative paths: ${source}`,
      );
      err.suggestion =
        'Use "../" at the start of the path for relative references, or use an absolute path';
      throw err;
    }

    // Ensure path is not empty after cleaning
    if (!cleanPath || cleanPath.trim() === "") {
      const err = new ValidationError(`Empty path after cleaning: ${source}`);
      err.suggestion =
        "Provide a valid filesystem path, e.g. fs:./my-presets or /absolute/path";
      throw err;
    }
  }

  async resolve(source: string, options?: ResolveOptions): Promise<string> {
    const cleanPath = this.cleanSource(source);
    const cwd = options?.cwd || process.cwd();

    // Resolve relative paths against working directory
    const resolvedPath = path.isAbsolute(cleanPath)
      ? cleanPath
      : path.resolve(cwd, cleanPath);

    // Validate path exists and is accessible
    await this.validatePath(resolvedPath);

    // Tool directory detection removed (codecs deleted).
    // Tool directories are now handled as standard preset directories.

    // Standard preset directory - validate structure
    await this.validatePresetStructure(resolvedPath);

    return resolvedPath;
  }

  /**
   * Remove fs: prefix if present
   */
  private cleanSource(source: string): string {
    return source.startsWith("fs:") ? source.slice(3) : source;
  }

  /**
   * Validate that path exists and is a directory
   */
  private async validatePath(resolvedPath: string): Promise<void> {
    try {
      await access(resolvedPath);
      const stats = await stat(resolvedPath);

      if (!stats.isDirectory()) {
        throw new FileSystemError(
          `Filesystem source must be a directory: ${resolvedPath}`,
          resolvedPath,
        );
      }
    } catch (error) {
      // If it's already a FileSystemError, re-throw it
      if (error instanceof FileSystemError) {
        throw error;
      }

      // Otherwise wrap the access/stat error
      throw new FileSystemError(
        `Filesystem source not accessible: ${resolvedPath}`,
        resolvedPath,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Validate preset structure (warn if no skills/, commands/, agents/, or mcp.json)
   */
  private async validatePresetStructure(resolvedPath: string): Promise<void> {
    const [hasSkills, hasCommands, hasAgents, hasMcp] = await Promise.all([
      pathExists(path.join(resolvedPath, "skills")),
      pathExists(path.join(resolvedPath, "commands")),
      pathExists(path.join(resolvedPath, "agents")),
      pathExists(path.join(resolvedPath, "mcp.json")),
    ]);

    if (!(hasSkills || hasCommands || hasAgents || hasMcp)) {
      console.warn(
        `Warning: Filesystem preset at ${resolvedPath} has no skills/, commands/, agents/, or mcp.json`,
      );
    }
  }
}
