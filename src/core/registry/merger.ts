/**
 * Merger - combines multiple presets with namespace-based conflict prevention
 */

import type { Preset } from "../../types/preset.js";
import type { MCP } from "../mcp/tokens.js";

/**
 * Merged result from all presets
 */
export interface MergedPresets {
  /** Namespaced commands: Map<"team:commit.md", content> */
  commands: Map<string, string>;

  /** Namespaced rules: Map<"team:typescript.md", content> */
  rules: Map<string, string>;

  /** Merged MCP servers */
  mcps: Record<string, MCP>;
}

export class Merger {
  /**
   * Merge multiple presets with namespace-based conflict prevention
   */
  merge(presets: Preset[]): MergedPresets {
    const result: MergedPresets = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    // Process presets in order (last-wins within namespace)
    for (const preset of presets) {
      // Merge commands
      for (const [filename, content] of preset.commands) {
        const namespacedKey = `${preset.namespace}:${filename}`;
        result.commands.set(namespacedKey, content);
      }

      // Merge rules
      for (const [filename, content] of preset.rules) {
        const namespacedKey = `${preset.namespace}:${filename}`;
        result.rules.set(namespacedKey, content);
      }

      // Merge MCPs (no namespace, just override)
      result.mcps = {
        ...result.mcps,
        ...preset.mcps,
      };
    }

    // Add project-level MCPs from config
    // This is handled separately by existing MCP system
    // Just pass through for now

    return result;
  }

  /**
   * Check for namespace collisions (should never happen with our design)
   */
  validateNoCollisions(presets: Preset[]): void {
    const namespaces = presets.map((preset) => preset.namespace);
    const duplicates = namespaces.filter(
      (ns, i) => namespaces.indexOf(ns) !== i,
    );

    if (duplicates.length > 0) {
      throw new Error(
        `Namespace collision detected: ${duplicates.join(", ")}\n\n` +
          `Each preset must have a unique namespace. ` +
          `Override with: extends: [{source: "...", namespace: "unique-name"}]`,
      );
    }
  }
}
