/**
 * Preset loader - loads rules, commands, and MCPs from cached GitHub repos
 */

import * as path from "path";
import { pathExists } from "../../utils/fs.js";
import { readFile } from "node:fs/promises";
import fg from "fast-glob";
import type { Preset, PresetMetadata } from "../../types/preset.js";
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
    }
  ): Promise<Preset> {
    // Load optional metadata
    const metadata = await this.loadMetadata(cachePath);

    // Override namespace if metadata specifies
    const finalNamespace = metadata?.namespace || namespace;

    // Load commands
    const commands = await this.loadMarkdownFiles(
      path.join(cachePath, "commands"),
      filters
    );

    // Load rules
    const rules = await this.loadMarkdownFiles(
      path.join(cachePath, "rules"),
      filters
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
    cachePath: string
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
   */
  private async loadMarkdownFiles(
    dir: string,
    filters?: {
      include?: string[];
      exclude?: string[];
    }
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    if (!(await pathExists(dir))) {
      return result;
    }

    // Build glob pattern
    const includePatterns = filters?.include || ["**/*.md"];
    const excludePatterns = filters?.exclude || [];

    // Find files
    const files = await fg(includePatterns, {
      cwd: dir,
      ignore: excludePatterns,
      absolute: false,
    });

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
