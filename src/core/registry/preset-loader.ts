/**
 * Preset loader - loads rules, commands, and MCPs from cached GitHub repos
 * Parses all content into canonical format (frontmatter + markdown)
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { CanonicalCommand, CanonicalRule } from "../../types/canonical.js";
import type { Preset, PresetMetadata } from "../../types/preset.js";
import {
  generateCommandFrontmatter,
  generateRuleFrontmatter,
  parseFrontmatter,
  validateCommandFrontmatter,
  validateRuleFrontmatter,
} from "../../utils/frontmatter.js";
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

    // Load commands (parse into canonical format)
    const commands = await this.loadCommands(
      path.join(cachePath, "commands"),
      source,
      filters,
    );

    // Load rules (parse into canonical format)
    const rules = await this.loadRules(
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
   * Load commands from directory and parse into canonical format
   */
  private async loadCommands(
    dir: string,
    source?: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    },
  ): Promise<Map<string, CanonicalCommand>> {
    const result = new Map<string, CanonicalCommand>();

    if (!(await pathExists(dir))) {
      return result;
    }

    // Get list of files to load
    const files = await this.getFilteredFiles(dir, source, filters);

    // Load and parse each file
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = await readFile(filePath, "utf-8");

      // Parse frontmatter
      const { frontmatter, markdown } = parseFrontmatter(content);

      // Validate or auto-generate frontmatter
      if (validateCommandFrontmatter(frontmatter)) {
        result.set(file, { frontmatter, markdown });
      } else {
        console.warn(
          `Warning: ${file} in ${source || "preset"} missing or invalid frontmatter, auto-generating`,
        );
        const generatedFrontmatter = generateCommandFrontmatter(file);
        result.set(file, { frontmatter: generatedFrontmatter, markdown });
      }
    }

    return result;
  }

  /**
   * Load rules from directory and parse into canonical format
   */
  private async loadRules(
    dir: string,
    source?: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    },
  ): Promise<Map<string, CanonicalRule>> {
    const result = new Map<string, CanonicalRule>();

    if (!(await pathExists(dir))) {
      return result;
    }

    // Get list of files to load
    const files = await this.getFilteredFiles(dir, source, filters);

    // Load and parse each file
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = await readFile(filePath, "utf-8");

      // Parse frontmatter
      const { frontmatter, markdown } = parseFrontmatter(content);

      // Validate or auto-generate frontmatter
      if (validateRuleFrontmatter(frontmatter)) {
        result.set(file, { frontmatter, markdown });
      } else {
        console.warn(
          `Warning: ${file} in ${source || "preset"} missing or invalid frontmatter, auto-generating`,
        );
        const generatedFrontmatter = generateRuleFrontmatter(file);
        result.set(file, { frontmatter: generatedFrontmatter, markdown });
      }
    }

    return result;
  }

  /**
   * Get filtered list of .md files from directory
   * Validates include/exclude patterns and provides helpful error messages
   */
  private async getFilteredFiles(
    dir: string,
    source?: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    },
  ): Promise<string[]> {
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
    validateIncludeMatches(includePatterns, files, source || "unknown", dir);

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

    return files;
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
