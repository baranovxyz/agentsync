/**
 * AGENTS.md Sync Target
 * Creates symlinks for tools that need them (Claude and Cline)
 */

import { symlink } from "node:fs/promises";
import * as path from "node:path";
import type { ToolName } from "../types/index.js";
import { ensureDir, pathExists } from "../utils/fs.js";

export class AgentsSyncTarget {
  /**
   * Sync AGENTS.md symlinks for specified tools
   */
  async sync(tools: ToolName[], cwd: string): Promise<void> {
    for (const tool of tools) {
      if (tool === "claude") {
        await this.createClaudeSymlink(cwd);
      } else if (tool === "cline") {
        await this.createClineSymlink(cwd);
      }
      // Cursor and RooCode have native support - no action needed
    }
  }

  /**
   * Create symlink for Claude: CLAUDE.md → AGENTS.md
   */
  private async createClaudeSymlink(cwd: string): Promise<void> {
    const target = "AGENTS.md";
    const link = path.join(cwd, "CLAUDE.md");

    // Check if symlink already exists
    if (await pathExists(link)) {
      return;
    }

    try {
      await symlink(target, link);
    } catch (error) {
      // Ignore if symlink already exists or other errors
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Create symlink for Cline: .clinerules/AGENTS.md → ../AGENTS.md
   */
  private async createClineSymlink(cwd: string): Promise<void> {
    const linkDir = path.join(cwd, ".clinerules");
    const link = path.join(linkDir, "AGENTS.md");
    const target = "../AGENTS.md";

    // Check if symlink already exists
    if (await pathExists(link)) {
      return;
    }

    try {
      await ensureDir(linkDir);
      await symlink(target, link);
    } catch (error) {
      // Ignore if symlink already exists or other errors
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}
