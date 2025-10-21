/**
 * Rules sync target
 * Syncs rules to Cursor and Claude Code
 */

import * as path from 'path';
import { outputFile } from '../utils/fs.js';
import { CursorRulesConverter } from './rules/cursor-rules-converter.js';
import { ClaudeRulesConverter } from './rules/claude-rules-converter.js';
import type { ToolName } from '../types/index.js';

export class RulesSyncTarget {
  private cursorConverter = new CursorRulesConverter();
  private claudeConverter = new ClaudeRulesConverter();

  /**
   * Sync rules to specified tools
   */
  async sync(
    rules: Map<string, string>,
    tools: ToolName[],
    cwd: string = process.cwd()
  ): Promise<void> {
    for (const tool of tools) {
      if (tool === 'cursor') {
        await this.syncToCursor(rules, cwd);
      } else if (tool === 'claude') {
        await this.syncToClaude(rules, cwd);
      }
      // Other tools deferred to v0.4.0+
    }
  }

  /**
   * Sync to Cursor (.cursor/rules/*.mdc)
   */
  private async syncToCursor(
    rules: Map<string, string>,
    cwd: string
  ): Promise<void> {
    const rulesDir = path.join(cwd, '.cursor', 'rules');

    for (const [namespacedFilename, content] of rules) {
      const converted = this.cursorConverter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: 'utf-8' });
    }
  }

  /**
   * Sync to Claude Code (.claude/rules/*.md)
   */
  private async syncToClaude(
    rules: Map<string, string>,
    cwd: string
  ): Promise<void> {
    const rulesDir = path.join(cwd, '.claude', 'rules');

    for (const [namespacedFilename, content] of rules) {
      const converted = this.claudeConverter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: 'utf-8' });
    }
  }
}
