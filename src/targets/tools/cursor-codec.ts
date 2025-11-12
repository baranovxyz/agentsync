/**
 * Cursor Tool Codec (Bidirectional)
 * Handles both import from and export to Cursor format
 */

import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { MCP } from "../../core/mcp/tokens.js";
import {
  addMCPToToolConfig,
  disableMCPInToolConfig,
  removeMCPFromToolConfig,
} from "../../core/mcp/tool-config.js";
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
import { CursorCommandsConverter } from "../commands/cursor-commands-converter.js";
import { CursorRulesConverter } from "../rules/cursor-rules-converter.js";
import type { ToolCodec } from "./types.js";

export class CursorCodec implements ToolCodec {
  name = "cursor" as const;

  // =============================================================================
  // INPUT: Tool format → Canonical
  // =============================================================================

  /**
   * Detect if path contains a Cursor tool directory
   */
  async detect(basePath: string): Promise<ToolDirectoryInfo | null> {
    // Check two scenarios:
    // 1. basePath itself is .cursor directory (user provided the tool dir directly)
    // 2. basePath contains .cursor directory (standard case)
    let cursorDir: string;

    // First, check if basePath itself looks like a .cursor directory
    const rulesInBase = path.join(basePath, "rules");
    const commandsInBase = path.join(basePath, "commands");
    const mcpInBase = path.join(basePath, "mcp.json");

    const hasCursorStructure =
      (await pathExists(rulesInBase)) ||
      (await pathExists(commandsInBase)) ||
      (await pathExists(mcpInBase));

    if (hasCursorStructure && path.basename(basePath) === ".cursor") {
      cursorDir = basePath;
    } else {
      cursorDir = path.join(basePath, ".cursor");

      if (!(await pathExists(cursorDir))) {
        return null;
      }

      // Check if it's a directory
      try {
        const stats = await stat(cursorDir);
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
    const rulesDir = path.join(cursorDir, "rules");
    const commandsDir = path.join(cursorDir, "commands");
    const mcpFile = path.join(cursorDir, "mcp.json");

    const hasRules = await pathExists(rulesDir);
    const hasCommands = await pathExists(commandsDir);
    const hasMCP = await pathExists(mcpFile);

    // Count rules and commands
    let ruleCount = 0;
    let commandCount = 0;

    if (hasRules) {
      const ruleFiles = await fg("**/*.mdc", {
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
      toolName: "cursor",
      path: cursorDir,
      scope: isGlobal ? "global" : "project",
      hasRules,
      hasCommands,
      hasMCP,
      ruleCount,
      commandCount,
    };
  }

  /**
   * Import rules from Cursor format to canonical format
   */
  async importRules(toolPath: string): Promise<Map<string, ImportedRule>> {
    const rulesDir = path.join(toolPath, "rules");
    const rules = new Map<string, ImportedRule>();

    if (!(await pathExists(rulesDir))) {
      return rules;
    }

    // Find all .mdc files recursively
    const ruleFiles = await fg("**/*.mdc", {
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

      // Normalize filename: keep as .md (conceptually .mdc and .md are both markdown)
      const normalizedPath = relPath.replace(/\.mdc$/, ".md");

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
   * Import commands from Cursor format to canonical format
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
   * Import MCP configuration from Cursor format
   */
  async importMCP(toolPath: string): Promise<Record<string, MCP> | null> {
    const mcpFile = path.join(toolPath, "mcp.json");

    if (!(await pathExists(mcpFile))) {
      return null;
    }

    try {
      const content = await readFile(mcpFile, "utf-8");
      const config = JSON.parse(content);

      // Cursor format: { "mcpServers": { "server1": {...}, "server2": {...} } }
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
   * Sync AGENTS.md for Cursor (no-op, Cursor reads from root)
   */
  async syncAgentsMd(_cwd: string): Promise<void> {
    // Cursor supports AGENTS.md natively at root; no-op
  }

  /**
   * Sync rules from canonical format to Cursor format
   */
  async syncRules(
    rules: Map<string, CanonicalRule>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".cursor", "rules");
    const converter = new CursorRulesConverter();

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
   * Sync commands from canonical format to Cursor format
   */
  async syncCommands(
    commands: Map<string, CanonicalCommand>,
    cwd: string,
  ): Promise<void> {
    const commandsDir = path.join(cwd, ".cursor", "commands");
    const converter = new CursorCommandsConverter();

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
   * Sync MCP configuration to Cursor format
   */
  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const cursorDir = path.join(cwd, ".cursor");

    await ensureDir(cursorDir);
    const mcpFile = path.join(cursorDir, "mcp.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }

  // =============================================================================
  // MCP Operations: Direct tool config manipulation
  // =============================================================================

  /**
   * Add or update MCP server in tool config (.cursor/mcp.json)
   */
  async addMCP(
    name: string,
    config: MCP,
    cwd: string,
    force?: boolean,
  ): Promise<void> {
    const cursorDir = path.join(cwd, ".cursor");
    await ensureDir(cursorDir);
    const mcpFile = path.join(cursorDir, "mcp.json");
    await addMCPToToolConfig(mcpFile, name, config, force);
  }

  /**
   * Disable (remove) MCP server from tool config
   */
  async disableMCP(name: string, cwd: string): Promise<void> {
    const cursorDir = path.join(cwd, ".cursor");
    const mcpFile = path.join(cursorDir, "mcp.json");
    await disableMCPInToolConfig(mcpFile, name);
  }

  /**
   * Remove MCP server from tool config
   */
  async removeMCP(name: string, cwd: string): Promise<void> {
    const cursorDir = path.join(cwd, ".cursor");
    const mcpFile = path.join(cursorDir, "mcp.json");
    await removeMCPFromToolConfig(mcpFile, name);
  }
}
