/**
 * Rules sync target
 * Syncs rules to Cursor and Claude Code
 */

import * as path from "node:path";
import type { ToolName } from "../types/index.js";
import { outputFile } from "../utils/fs.js";
import { ClaudeRulesConverter } from "./rules/claude-rules-converter.js";
import { ClineRulesConverter } from "./rules/cline-rules-converter.js";
import { CursorRulesConverter } from "./rules/cursor-rules-converter.js";
import { RooCodeRulesConverter } from "./rules/roocode-rules-converter.js";

export class RulesSyncTarget {
  private cursorConverter = new CursorRulesConverter();
  private claudeConverter = new ClaudeRulesConverter();
  private clineConverter = new ClineRulesConverter();
  private rooCodeConverter = new RooCodeRulesConverter();

  /**
   * Sync rules to specified tools
   */
  async sync(
    rules: Map<string, string>,
    tools: ToolName[],
    cwd: string = process.cwd(),
  ): Promise<void> {
    for (const tool of tools) {
      if (tool === "cursor") {
        await this.syncToCursor(rules, cwd);
      } else if (tool === "claude") {
        await this.syncToClaude(rules, cwd);
      } else if (tool === "cline") {
        await this.syncToCline(rules, cwd);
      } else if (tool === "roocode") {
        await this.syncToRooCode(rules, cwd);
      }
    }
  }

  /**
   * Sync to Cursor (.cursor/rules/*.mdc)
   */
  private async syncToCursor(
    rules: Map<string, string>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".cursor", "rules");

    for (const [namespacedFilename, content] of rules) {
      const converted = this.cursorConverter.convert(
        namespacedFilename,
        content,
      );
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync to Claude Code (.claude/rules/*.md)
   */
  private async syncToClaude(
    rules: Map<string, string>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".claude", "rules");

    for (const [namespacedFilename, content] of rules) {
      const converted = this.claudeConverter.convert(
        namespacedFilename,
        content,
      );
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync to Cline (.clinerules/*.md)
   */
  private async syncToCline(
    rules: Map<string, string>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".clinerules");

    for (const [namespacedFilename, content] of rules) {
      const converted = this.clineConverter.convert(
        namespacedFilename,
        content,
      );
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  /**
   * Sync to RooCode (.roo/rules/*.md)
   */
  private async syncToRooCode(
    rules: Map<string, string>,
    cwd: string,
  ): Promise<void> {
    const rulesDir = path.join(cwd, ".roo", "rules");

    for (const [namespacedFilename, content] of rules) {
      const converted = this.rooCodeConverter.convert(
        namespacedFilename,
        content,
      );
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }
}
