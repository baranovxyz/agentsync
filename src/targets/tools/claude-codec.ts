/**
 * Claude Tool Codec (Bidirectional)
 * Handles both import from and export to Claude format
 */

import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { MCP } from "../../core/mcp/tokens.js";
import type {
  CanonicalCommand,
  CanonicalRule,
  CommandFrontmatter,
  ImportedCommand,
  ImportedRule,
  RuleFrontmatter,
  ToolDirectoryInfo,
} from "../../types/canonical.js";
import {
  generateCommandFrontmatter,
  generateRuleFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
  validateCommandFrontmatter,
  validateRuleFrontmatter,
} from "../../utils/frontmatter.js";
import { pathExists } from "../../utils/fs.js";
import { ClaudeCommandsConverter } from "../commands/claude-commands-converter.js";
import { ClaudeRulesConverter } from "../rules/claude-rules-converter.js";
import type { ToolCodec } from "./types.js";

export class ClaudeCodec implements ToolCodec {
  name = "claude" as const;

  // =============================================================================
  // INPUT: Tool format → Canonical
  // =============================================================================

  /**
   * Detect if path contains a Claude tool directory
   */
  async detect(basePath: string): Promise<ToolDirectoryInfo | null> {
    const claudeDir = path.join(basePath, ".claude");

    if (!(await pathExists(claudeDir))) {
      return null;
    }

    // Check if it's a directory
    try {
      const stats = await stat(claudeDir);
      if (!stats.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    // Determine scope (global vs project)
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const isGlobal = homeDir && basePath === homeDir;

    // Check for rules, commands, and MCP
    const rulesDir = path.join(claudeDir, "rules");
    const commandsDir = path.join(claudeDir, "commands");
    const mcpFile = path.join(claudeDir, "mcp.json");

    const hasRules = await pathExists(rulesDir);
    const hasCommands = await pathExists(commandsDir);
    const hasMCP = await pathExists(mcpFile);

    // Count rules and commands
    let ruleCount = 0;
    let commandCount = 0;

    if (hasRules) {
      const ruleFiles = await fg("**/*.md", {
        cwd: rulesDir,
        absolute: false,
      });
      ruleCount = ruleFiles.length;
    }

    if (hasCommands) {
      const commandFiles = await fg("**/*.md", {
        cwd: commandsDir,
        absolute: false,
      });
      commandCount = commandFiles.length;
    }

    return {
      toolName: "claude",
      path: claudeDir,
      scope: isGlobal ? "global" : "project",
      hasRules,
      hasCommands,
      hasMCP,
      ruleCount,
      commandCount,
    };
  }

  /**
   * Import rules from Claude format to canonical format
   */
  async importRules(toolPath: string): Promise<Map<string, ImportedRule>> {
    const rulesDir = path.join(toolPath, "rules");
    const rules = new Map<string, ImportedRule>();

    if (!(await pathExists(rulesDir))) {
      return rules;
    }

    // Find all .md files recursively
    const ruleFiles = await fg("**/*.md", {
      cwd: rulesDir,
      absolute: false,
    });

    for (const relPath of ruleFiles) {
      const fullPath = path.join(rulesDir, relPath);
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
          `Warning: ${relPath} missing or invalid frontmatter, auto-generating`,
        );
        ruleFrontmatter = generateRuleFrontmatter(relPath);
      }

      rules.set(relPath, {
        frontmatter: ruleFrontmatter,
        markdown,
        sourcePath: fullPath,
        modifiedTime: stats.mtime,
      });
    }

    return rules;
  }

  /**
   * Import commands from Claude format to canonical format
   */
  async importCommands(
    toolPath: string,
  ): Promise<Map<string, ImportedCommand>> {
    const commandsDir = path.join(toolPath, "commands");
    const commands = new Map<string, ImportedCommand>();

    if (!(await pathExists(commandsDir))) {
      return commands;
    }

    // Find all .md files recursively
    const commandFiles = await fg("**/*.md", {
      cwd: commandsDir,
      absolute: false,
    });

    for (const relPath of commandFiles) {
      const fullPath = path.join(commandsDir, relPath);
      const content = await readFile(fullPath, "utf-8");
      const stats = await stat(fullPath);

      // Parse frontmatter
      const { frontmatter, markdown } = parseFrontmatter(content);

      // Validate or auto-generate frontmatter
      let commandFrontmatter: CommandFrontmatter;
      if (validateCommandFrontmatter(frontmatter)) {
        commandFrontmatter = frontmatter;
      } else {
        console.warn(
          `Warning: ${relPath} missing or invalid frontmatter, auto-generating`,
        );
        commandFrontmatter = generateCommandFrontmatter(relPath);
      }

      commands.set(relPath, {
        frontmatter: commandFrontmatter,
        markdown,
        sourcePath: fullPath,
        modifiedTime: stats.mtime,
      });
    }

    return commands;
  }

  /**
   * Import MCP configuration from Claude format
   */
  async importMCP(toolPath: string): Promise<Record<string, MCP> | null> {
    const mcpFile = path.join(toolPath, "mcp.json");

    if (!(await pathExists(mcpFile))) {
      return null;
    }

    try {
      const content = await readFile(mcpFile, "utf-8");
      const config = JSON.parse(content);

      // Claude format: { "mcpServers": { "server1": {...}, "server2": {...} } }
      if (config.mcpServers && typeof config.mcpServers === "object") {
        return config.mcpServers;
      }

      return null;
    } catch (error) {
      console.warn(`Warning: Failed to parse ${mcpFile}:`, error);
      return null;
    }
  }

  // =============================================================================
  // OUTPUT: Canonical → Tool format
  // =============================================================================

  /**
   * Sync AGENTS.md for Claude (create CLAUDE.md symlink)
   */
  async syncAgentsMd(cwd: string): Promise<void> {
    const { symlink, remove } = await import("../../utils/fs.js");
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    const agentsMdPath = path.join(cwd, "AGENTS.md");

    // Check if AGENTS.md exists
    if (!(await pathExists(agentsMdPath))) {
      return;
    }

    // Remove existing symlink/file if it exists
    if (await pathExists(claudeMdPath)) {
      try {
        await remove(claudeMdPath);
      } catch {
        // Ignore if we can't remove it
      }
    }

    // Create symlink CLAUDE.md → AGENTS.md
    try {
      await symlink(agentsMdPath, claudeMdPath);
    } catch (error) {
      // Ignore if symlink can't be created
      console.warn(
        `Could not create CLAUDE.md symlink: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Sync rules from canonical format to Claude format
   */
  async syncRules(
    rules: Map<string, CanonicalRule>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".claude", "rules");
    const converter = new ClaudeRulesConverter();

    for (const [namespacedFilename, canonicalRule] of rules) {
      // Serialize canonical format to string with frontmatter
      const content = serializeFrontmatter(
        canonicalRule.frontmatter,
        canonicalRule.markdown,
      );

      // Convert using existing converter
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);

      // Use outputFile from fs utils to ensure directories exist
      const { outputFile } = await import("../../utils/fs.js");
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync commands from canonical format to Claude format
   */
  async syncCommands(
    commands: Map<string, CanonicalCommand>,
    cwd: string,
  ): Promise<void> {
    const commandsDir = path.join(cwd, ".claude", "commands");
    const converter = new ClaudeCommandsConverter();

    for (const [namespacedFilename, canonicalCommand] of commands) {
      // Serialize canonical format to string with frontmatter
      const content = serializeFrontmatter(
        canonicalCommand.frontmatter,
        canonicalCommand.markdown,
      );

      // Convert using existing converter
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(commandsDir, converted.filename);

      // Use outputFile from fs utils
      const { outputFile } = await import("../../utils/fs.js");
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync MCP configuration to Claude format
   */
  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const claudeDir = path.join(cwd, ".claude");
    const { ensureDir, outputFile } = await import("../../utils/fs.js");

    await ensureDir(claudeDir);
    const mcpFile = path.join(claudeDir, "mcp.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
