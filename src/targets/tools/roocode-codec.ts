/**
 * RooCode Tool Codec (Bidirectional)
 * Handles both import from and export to RooCode format
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
import { ensureDir, outputFile, pathExists } from "../../utils/fs.js";
import { RooCodeCommandsConverter } from "../commands/roocode-commands-converter.js";
import { RooCodeRulesConverter } from "../rules/roocode-rules-converter.js";
import type { ToolCodec } from "./types.js";

export class RooCodeCodec implements ToolCodec {
  name = "roocode" as const;

  // =============================================================================
  // INPUT: Tool format → Canonical
  // =============================================================================

  /**
   * Detect if path contains a RooCode tool directory
   */
  async detect(basePath: string): Promise<ToolDirectoryInfo | null> {
    // Check two scenarios:
    // 1. basePath itself is .roo directory (user provided the tool dir directly)
    // 2. basePath contains .roo directory (standard case)
    let rooDir: string;

    // First, check if basePath itself looks like a .roo directory
    const rulesInBase = path.join(basePath, "rules");
    const commandsInBase = path.join(basePath, "commands");
    const mcpInBase = path.join(basePath, "mcp.json");

    const hasRooStructure =
      (await pathExists(rulesInBase)) ||
      (await pathExists(commandsInBase)) ||
      (await pathExists(mcpInBase));

    if (hasRooStructure && path.basename(basePath) === ".roo") {
      rooDir = basePath;
    } else {
      rooDir = path.join(basePath, ".roo");

      if (!(await pathExists(rooDir))) {
        return null;
      }

      // Check if it's a directory
      try {
        const stats = await stat(rooDir);
        if (!stats.isDirectory()) {
          return null;
        }
      } catch {
        return null;
      }
    }

    // Determine scope (global vs project)
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const isGlobal = homeDir && basePath === homeDir;

    // Check for rules, commands, and MCP
    const rulesDir = path.join(rooDir, "rules");
    const commandsDir = path.join(rooDir, "commands");
    const mcpFile = path.join(rooDir, "mcp.json");

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
      toolName: "roocode",
      path: rooDir,
      scope: isGlobal ? "global" : "project",
      hasRules,
      hasCommands,
      hasMCP,
      ruleCount,
      commandCount,
    };
  }

  /**
   * Import rules from RooCode format to canonical format
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
   * Import commands from RooCode format to canonical format
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
   * Import MCP configuration from RooCode format
   */
  async importMCP(toolPath: string): Promise<Record<string, MCP> | null> {
    const mcpFile = path.join(toolPath, "mcp.json");

    if (!(await pathExists(mcpFile))) {
      return null;
    }

    try {
      const content = await readFile(mcpFile, "utf-8");
      const config = JSON.parse(content);

      // RooCode format: { "mcpServers": { "server1": {...}, "server2": {...} } }
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
   * Sync AGENTS.md for RooCode (no-op, RooCode reads from root)
   */
  async syncAgentsMd(_cwd: string): Promise<void> {
    // RooCode supports AGENTS.md natively at root; no-op
  }

  /**
   * Sync rules from canonical format to RooCode format
   */
  async syncRules(
    rules: Map<string, CanonicalRule>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".roo", "rules");
    const converter = new RooCodeRulesConverter();

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
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync commands from canonical format to RooCode format
   */
  async syncCommands(
    commands: Map<string, CanonicalCommand>,
    cwd: string,
  ): Promise<void> {
    const commandsDir = path.join(cwd, ".roo", "commands");
    const converter = new RooCodeCommandsConverter();

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
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync MCP configuration to RooCode format
   */
  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const rooDir = path.join(cwd, ".roo");

    await ensureDir(rooDir);
    const mcpFile = path.join(rooDir, "mcp.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
