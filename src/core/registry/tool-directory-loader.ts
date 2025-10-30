/**
 * Tool Directory Loader
 * Converts tool directories to Preset format using codecs
 * Acts as adapter between tool format and preset system
 */

import { getCodecRegistry } from "../../targets/codec-registry.js";
import type { CanonicalCommand, CanonicalRule } from "../../types/canonical.js";
import type { Preset } from "../../types/preset.js";

export class ToolDirectoryLoader {
  /**
   * Load tool directory as Preset using codec
   * Returns canonical format, warns on invalid rules/commands but doesn't fail
   * Fails only on invalid MCP configuration
   *
   * @param source - Source identifier (e.g., "fs:~/.cursor")
   * @param toolPath - Resolved path to tool directory
   * @param toolName - Tool name (cursor, claude, cline, roocode)
   * @param namespace - Namespace for the preset
   * @returns Preset with canonical format content
   */
  async load(
    source: string,
    toolPath: string,
    toolName: string,
    namespace: string,
  ): Promise<Preset> {
    const codecRegistry = getCodecRegistry();
    const codec = codecRegistry.get(toolName);

    if (!codec) {
      throw new Error(`No codec found for tool: ${toolName}`);
    }

    // Import using codec (codecs auto-generate frontmatter for invalid files)
    const importedRules = await codec.importRules(toolPath);
    const importedCommands = await codec.importCommands(toolPath);
    const mcps = await codec.importMCP(toolPath);

    // Convert ImportedRule/Command → CanonicalRule/Command (strip metadata)
    const rules = new Map<string, CanonicalRule>();
    for (const [key, imported] of importedRules) {
      rules.set(key, {
        frontmatter: imported.frontmatter,
        markdown: imported.markdown,
      });
    }

    const commands = new Map<string, CanonicalCommand>();
    for (const [key, imported] of importedCommands) {
      commands.set(key, {
        frontmatter: imported.frontmatter,
        markdown: imported.markdown,
      });
    }

    // Validate MCP format (fail if invalid)
    if (mcps !== null && typeof mcps !== "object") {
      throw new Error(
        `Invalid MCP configuration in ${toolPath}: expected object, got ${typeof mcps}`,
      );
    }

    return {
      source,
      namespace,
      path: toolPath,
      commands,
      rules,
      mcps: mcps || {},
    };
  }
}
