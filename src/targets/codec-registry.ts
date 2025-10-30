/**
 * Codec Registry
 * Central registry for all tool codecs
 */

import { ClaudeCodec } from "./tools/claude-codec.js";
import { ClineCodec } from "./tools/cline-codec.js";
import { CursorCodec } from "./tools/cursor-codec.js";
import { RooCodeCodec } from "./tools/roocode-codec.js";
import type { ToolCodec } from "./tools/types.js";

// Re-export ToolCodec type for convenience
export type { ToolCodec };

/**
 * Singleton registry for tool codecs
 */
class CodecRegistry {
  private codecs = new Map<string, ToolCodec>();

  /**
   * Register a codec
   */
  register(codec: ToolCodec): void {
    this.codecs.set(codec.name, codec);
  }

  /**
   * Get a codec by tool name
   */
  get(toolName: string): ToolCodec | undefined {
    return this.codecs.get(toolName);
  }

  /**
   * Get all registered codecs
   */
  getAll(): ToolCodec[] {
    return Array.from(this.codecs.values());
  }

  /**
   * Detect tool type from a directory path
   * Returns the first codec that can handle the directory
   */
  async detect(
    dirPath: string,
  ): Promise<{ toolName: string; codec: ToolCodec } | null> {
    for (const codec of this.codecs.values()) {
      const info = await codec.detect(dirPath);
      if (info) {
        return { toolName: codec.name, codec };
      }
    }
    return null;
  }

  /**
   * Detect tool directories in global scope (~/.cursor, ~/.claude, etc.)
   * @returns Array of detected global tool directories
   */
  async detectGlobal(): Promise<
    Array<{
      toolName: string;
      codec: ToolCodec;
      info: import("../types/canonical.js").ToolDirectoryInfo;
    }>
  > {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      return [];
    }

    const detected: Array<{
      toolName: string;
      codec: ToolCodec;
      info: import("../types/canonical.js").ToolDirectoryInfo;
    }> = [];

    for (const codec of this.codecs.values()) {
      const info = await codec.detect(homeDir);
      if (info && info.scope === "global") {
        detected.push({ toolName: codec.name, codec, info });
      }
    }

    return detected;
  }

  /**
   * Detect tool directories in project scope (./.cursor, ./.claude, etc.)
   * @param cwd - Project directory to scan
   * @returns Array of detected project tool directories
   */
  async detectProject(cwd: string): Promise<
    Array<{
      toolName: string;
      codec: ToolCodec;
      info: import("../types/canonical.js").ToolDirectoryInfo;
    }>
  > {
    const detected: Array<{
      toolName: string;
      codec: ToolCodec;
      info: import("../types/canonical.js").ToolDirectoryInfo;
    }> = [];

    for (const codec of this.codecs.values()) {
      const info = await codec.detect(cwd);
      if (info && info.scope === "project") {
        detected.push({ toolName: codec.name, codec, info });
      }
    }

    return detected;
  }
}

// Singleton instance
let registry: CodecRegistry | null = null;

/**
 * Get the global codec registry instance
 * Automatically registers all available codecs on first access
 */
export function getCodecRegistry(): CodecRegistry {
  if (!registry) {
    registry = new CodecRegistry();

    // Register all codecs
    registry.register(new CursorCodec());
    registry.register(new ClaudeCodec());
    registry.register(new ClineCodec());
    registry.register(new RooCodeCodec());
  }

  return registry;
}

/**
 * Reset the registry (mainly for testing)
 */
export function resetCodecRegistry(): void {
  registry = null;
}
