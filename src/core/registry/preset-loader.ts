/**
 * Preset loader - loads rules, commands, and MCPs from cached GitHub repos
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { Preset, PresetMetadata } from "../../types/preset.js";
import { pathExists } from "../../utils/fs.js";
import {
  normalizePatterns,
  validateIncludeMatches,
  warnIfExcludeMatched,
} from "../../utils/path-normalization.js";
import type { MCP } from "../mcp/tokens.js";

export class PresetLoader {
  /**
   * Load preset from cached repo
   */
  async load(
    source: string,
    cachePath: string,
    namespace: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    },
  ): Promise<Preset> {
    // Load optional metadata
    const metadata = await this.loadMetadata(cachePath);

    // Override namespace if metadata specifies
    const finalNamespace = metadata?.namespace || namespace;

    // Load commands
    const commands = await this.loadMarkdownFiles(
      path.join(cachePath, "commands"),
      source,
      filters,
    );

    // Load rules
    const rules = await this.loadMarkdownFiles(
      path.join(cachePath, "rules"),
      source,
      filters,
    );

    // Load MCPs
    const mcps = await this.loadMCPs(cachePath);

    return {
      source,
      namespace: finalNamespace,
      path: cachePath,
      commands,
      rules,
      mcps,
      metadata,
    };
  }

  /**
   * Load .agentsync/preset.json if exists
   */
  private async loadMetadata(
    cachePath: string,
  ): Promise<PresetMetadata | undefined> {
    const metadataPath = path.join(cachePath, ".agentsync", "preset.json");

    if (!(await pathExists(metadataPath))) {
      return undefined;
    }

    const content = await readFile(metadataPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Load all .md files from directory
   * Validates include/exclude patterns and provides helpful error messages
   */
  private async loadMarkdownFiles(
    dir: string,
    source?: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    },
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    if (!(await pathExists(dir))) {
      return result;
    }

    // Normalize patterns for consistent handling
    const includePatterns = filters?.include
      ? normalizePatterns(filters.include)
      : ["**/*.md"];
    const excludePatterns = filters?.exclude
      ? normalizePatterns(filters.exclude)
      : [];

    // Find files with include patterns
    const files = await fg(includePatterns, {
      cwd: dir,
      ignore: excludePatterns,
      absolute: false,
    });

    // Validate include patterns matched something
    validateIncludeMatches(
      includePatterns,
      files,
      source || "unknown",
      dir,
    );

    // Warn if exclude patterns matched nothing
    if (excludePatterns.length > 0) {
      // Get all files with include patterns to count
      const allFiles = await fg(includePatterns, {
        cwd: dir,
        absolute: false,
      });

      warnIfExcludeMatched(
        excludePatterns,
        allFiles.length,
        files.length,
        source || "unknown",
        dir,
      );
    }

    // Load content
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = await readFile(filePath, "utf-8");
      result.set(file, content);
    }

    return result;
  }

  /**
   * Load mcp.json if exists
   */
  private async loadMCPs(cachePath: string): Promise<Record<string, MCP>> {
    const mcpPath = path.join(cachePath, "mcp.json");

    if (!(await pathExists(mcpPath))) {
      return {};
    }

    const content = await readFile(mcpPath, "utf-8");
    return JSON.parse(content);
  }
}
