/**
 * Cursor Tool Converter
 */

import * as path from "node:path";
import type { MCP } from "../../core/mcp/tokens.js";
import { outputFile, ensureDir } from "../../utils/fs.js";
import { CursorRulesConverter } from "../rules/cursor-rules-converter.js";
import { CursorCommandsConverter } from "../commands/cursor-commands-converter.js";
import type { ToolConverter } from "./types.js";

export class CursorToolConverter implements ToolConverter {
  name = "cursor" as const;

  async syncAgents(_cwd: string): Promise<void> {
    // Cursor supports AGENTS.md natively; no-op
  }

  async syncRules(rules: Map<string, string>, cwd: string): Promise<void> {
    const rulesDir = path.join(cwd, ".cursor", "rules");
    const converter = new CursorRulesConverter();

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
    const commandsDir = path.join(cwd, ".cursor", "commands");
    const converter = new CursorCommandsConverter();

    for (const [namespacedFilename, content] of commands) {
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(commandsDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const cursorDir = path.join(cwd, ".cursor");
    await ensureDir(cursorDir);
    const mcpFile = path.join(cursorDir, "mcp.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
