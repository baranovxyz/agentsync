/**
 * Commands sync target
 * Syncs commands to Cursor and Claude Code
 */

import * as path from 'path';
import { outputFile } from 'fs-extra';
import { CursorCommandsConverter } from './commands/cursor-commands-converter.js';
import { ClaudeCommandsConverter } from './commands/claude-commands-converter.js';
import type { ToolName } from '../types/index.js';

export class CommandsSyncTarget {
  private cursorConverter = new CursorCommandsConverter();
  private claudeConverter = new ClaudeCommandsConverter();

  /**
   * Sync commands to specified tools
   */
  async sync(
    commands: Map<string, string>,
    tools: ToolName[],
    cwd: string = process.cwd()
  ): Promise<void> {
    for (const tool of tools) {
      if (tool === 'cursor') {
        await this.syncToCursor(commands, cwd);
      } else if (tool === 'claude') {
        await this.syncToClaude(commands, cwd);
      }
    }
  }

  private async syncToCursor(
    commands: Map<string, string>,
    cwd: string
  ): Promise<void> {
    const commandsDir = path.join(cwd, '.cursor', 'commands');

    for (const [namespacedFilename, content] of commands) {
      const converted = this.cursorConverter.convert(
        namespacedFilename,
        content
      );
      const outputPath = path.join(commandsDir, converted.filename);
      await outputFile(outputPath, converted.content, 'utf-8');
    }
  }

  private async syncToClaude(
    commands: Map<string, string>,
    cwd: string
  ): Promise<void> {
    const commandsDir = path.join(cwd, '.claude', 'commands');

    for (const [namespacedFilename, content] of commands) {
      const converted = this.claudeConverter.convert(
        namespacedFilename,
        content
      );
      const outputPath = path.join(commandsDir, converted.filename);
      await outputFile(outputPath, converted.content, 'utf-8');
    }
  }
}
