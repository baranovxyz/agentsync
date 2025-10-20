/**
 * Merger - combines multiple libraries with namespace-based conflict prevention
 */

import type { Library } from '../../types/library.js';
import type { MCP } from '../mcp/tokens.js';

/**
 * Merged result from all libraries
 */
export interface MergedLibraries {
  /** Namespaced commands: Map<"team:commit.md", content> */
  commands: Map<string, string>;

  /** Namespaced rules: Map<"team:typescript.md", content> */
  rules: Map<string, string>;

  /** Merged MCP servers */
  mcps: Record<string, MCP>;
}

export class Merger {
  /**
   * Merge multiple libraries with namespace-based conflict prevention
   */
  merge(libraries: Library[]): MergedLibraries {
    const result: MergedLibraries = {
      commands: new Map(),
      rules: new Map(),
      mcps: {},
    };

    // Process libraries in order (last-wins within namespace)
    for (const library of libraries) {
      // Merge commands
      for (const [filename, content] of library.commands) {
        const namespacedKey = `${library.namespace}:${filename}`;
        result.commands.set(namespacedKey, content);
      }

      // Merge rules
      for (const [filename, content] of library.rules) {
        const namespacedKey = `${library.namespace}:${filename}`;
        result.rules.set(namespacedKey, content);
      }

      // Merge MCPs (no namespace, just override)
      result.mcps = {
        ...result.mcps,
        ...library.mcps,
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
  validateNoCollisions(libraries: Library[]): void {
    const namespaces = libraries.map((lib) => lib.namespace);
    const duplicates = namespaces.filter(
      (ns, i) => namespaces.indexOf(ns) !== i
    );

    if (duplicates.length > 0) {
      throw new Error(
        `Namespace collision detected: ${duplicates.join(', ')}\n\n` +
          `Each library must have a unique namespace. ` +
          `Override with: extends: [{source: "...", namespace: "unique-name"}]`
      );
    }
  }
}
