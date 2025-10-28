/**
 * Claude Tool Converter
 */

import { symlink } from "node:fs/promises";
import * as path from "node:path";
import type { MCP } from "../../core/mcp/tokens.js";
import { ensureDir, outputFile, pathExists } from "../../utils/fs.js";
import { ClaudeCommandsConverter } from "../commands/claude-commands-converter.js";
import { ClaudeRulesConverter } from "../rules/claude-rules-converter.js";
import type { ToolConverter } from "./types.js";

export class ClaudeToolConverter implements ToolConverter {
  name = "claude" as const;

  async syncAgents(cwd: string): Promise<void> {
    const target = "AGENTS.md";
    const link = path.join(cwd, "CLAUDE.md");
    if (await pathExists(link)) return;
    try {
      await symlink(target, link);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  async syncRules(rules: Map<string, string>, cwd: string): Promise<void> {
    const rulesDir = path.join(cwd, ".claude", "rules");
    const converter = new ClaudeRulesConverter();

    for (const [namespacedFilename, content] of rules) {
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  async syncCommands(
    commands: Map<string, string>,
    cwd: string,
  ): Promise<void> {
    const commandsDir = path.join(cwd, ".claude", "commands");
    const converter = new ClaudeCommandsConverter();

    for (const [namespacedFilename, content] of commands) {
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(commandsDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const claudeDir = path.join(cwd, ".claude");
    await ensureDir(claudeDir);
    const mcpFile = path.join(claudeDir, "mcp.json");
    await outputFile(mcpFile, `${JSON.stringify(mcps, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
