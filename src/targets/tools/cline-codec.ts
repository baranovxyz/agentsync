/**
 * Cline Tool Codec (Bidirectional)
 * Handles both import from and export to Cline format
 * Note: Cline uses flat structure with underscore separators
 */

import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { MCP } from "../../core/mcp/tokens.js";
import type {
  CanonicalCommand,
  CanonicalRule,
  ImportedCommand,
  ImportedRule,
  RuleFrontmatter,
  ToolDirectoryInfo,
} from "../../types/canonical.js";
import {
  generateRuleFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
  validateRuleFrontmatter,
} from "../../utils/frontmatter.js";
import {
  ensureDir,
  outputFile,
  pathExists,
  remove,
  symlink,
} from "../../utils/fs.js";
import { ClineRulesConverter } from "../rules/cline-rules-converter.js";
import type { ToolCodec } from "./types.js";

export class ClineCodec implements ToolCodec {
  name = "cline" as const;

  // =============================================================================
  // INPUT: Tool format → Canonical
  // =============================================================================

  /**
   * Detect if path contains a Cline tool directory
   */
  async detect(basePath: string): Promise<ToolDirectoryInfo | null> {
    const clineDir = path.join(basePath, ".clinerules");

    if (!(await pathExists(clineDir))) {
      return null;
    }

    // Check if it's a directory
    try {
      const stats = await stat(clineDir);
      if (!stats.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    // Determine scope (global vs project)
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const isGlobal = homeDir && basePath === homeDir;

    // Cline only has rules (flat .md files), no separate commands directory
    // Count .md files (excluding AGENTS.md symlink)
    let ruleCount = 0;
    try {
      const mdFiles = await fg("*.md", {
        cwd: clineDir,
        absolute: false,
      });
      // Exclude AGENTS.md if it exists (it's a symlink)
      ruleCount = mdFiles.filter((f) => f !== "AGENTS.md").length;
    } catch {
      ruleCount = 0;
    }

    return {
      toolName: "cline",
      path: clineDir,
      scope: isGlobal ? "global" : "project",
      hasRules: ruleCount > 0,
      hasCommands: false, // Cline doesn't have separate commands
      hasMCP: false, // Cline doesn't have MCP support yet
      ruleCount,
      commandCount: 0,
    };
  }

  /**
   * Import rules from Cline format to canonical format
   * Cline uses flat structure with underscore separators for namespaces
   */
  async importRules(toolPath: string): Promise<Map<string, ImportedRule>> {
    const rules = new Map<string, ImportedRule>();

    if (!(await pathExists(toolPath))) {
      return rules;
    }

    // Find all .md files in flat structure (exclude AGENTS.md)
    const ruleFiles = await fg("*.md", {
      cwd: toolPath,
      absolute: false,
    });

    for (const filename of ruleFiles) {
      // Skip AGENTS.md symlink
      if (filename === "AGENTS.md") {
        continue;
      }

      const fullPath = path.join(toolPath, filename);
      const content = await readFile(fullPath, "utf-8");
      const stats = await stat(fullPath);

      // Parse frontmatter
      const { frontmatter, markdown } = parseFrontmatter(content);

      // Validate or auto-generate frontmatter
      let ruleFrontmatter: RuleFrontmatter;
      if (validateRuleFrontmatter(frontmatter)) {
        ruleFrontmatter = frontmatter;
      } else {
        console.warn(
          `Warning: ${filename} missing or invalid frontmatter, auto-generating`,
        );
        ruleFrontmatter = generateRuleFrontmatter(filename);
      }

      // Convert flat filename with underscores to nested path
      // Example: company_typescript.md → company/typescript.md
      const normalizedPath = filename.replace(/_/g, "/");

      rules.set(normalizedPath, {
        frontmatter: ruleFrontmatter,
        markdown,
        sourcePath: fullPath,
        modifiedTime: stats.mtime,
      });
    }

    return rules;
  }

  /**
   * Import commands from Cline format
   * Cline doesn't have separate commands, returns empty
   */
  async importCommands(
    _toolPath: string,
  ): Promise<Map<string, ImportedCommand>> {
    return new Map();
  }

  /**
   * Import MCP configuration from Cline format
   * Cline doesn't support MCP yet, returns null
   */
  async importMCP(_toolPath: string): Promise<Record<string, MCP> | null> {
    return null;
  }

  // =============================================================================
  // OUTPUT: Canonical → Tool format
  // =============================================================================

  /**
   * Sync AGENTS.md for Cline (create .clinerules/AGENTS.md symlink)
   */
  async syncAgentsMd(cwd: string): Promise<void> {
    const clinerulesMdPath = path.join(cwd, ".clinerules", "AGENTS.md");
    const agentsMdPath = path.join(cwd, "AGENTS.md");

    // Check if AGENTS.md exists
    if (!(await pathExists(agentsMdPath))) {
      return;
    }

    // Ensure .clinerules directory exists
    await ensureDir(path.join(cwd, ".clinerules"));

    // Remove existing symlink/file if it exists
    if (await pathExists(clinerulesMdPath)) {
      try {
        await remove(clinerulesMdPath);
      } catch {
        // Ignore if we can't remove it
      }
    }

    // Create symlink .clinerules/AGENTS.md → ../AGENTS.md
    try {
      await symlink("../AGENTS.md", clinerulesMdPath);
    } catch (error) {
      // Ignore if symlink can't be created
      console.warn(
        `Could not create .clinerules/AGENTS.md symlink: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Sync rules from canonical format to Cline format
   * Cline uses flat structure with underscore separators
   */
  async syncRules(
    rules: Map<string, CanonicalRule>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".clinerules");
    const converter = new ClineRulesConverter();

    for (const [namespacedFilename, canonicalRule] of rules) {
      // Serialize canonical format to string with frontmatter
      const content = serializeFrontmatter(
        canonicalRule.frontmatter,
        canonicalRule.markdown,
      );

      // Convert using existing converter (handles flat structure with underscores)
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);

      // Use outputFile from fs utils to ensure directories exist
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync commands from canonical format to Cline format
   * Cline doesn't have separate commands, no-op
   */
  async syncCommands(
    _commands: Map<string, CanonicalCommand>,
    _cwd: string,
  ): Promise<void> {
    // Cline doesn't support separate commands
  }

  /**
   * Sync MCP configuration to Cline format
   * Cline doesn't support MCP yet, no-op
   */
  async syncMCP(_mcps: Record<string, MCP>, _cwd: string): Promise<void> {
    // Cline doesn't support MCP yet
  }
}
