/**
 * RooCode Tool Converter
 */

import * as path from "node:path";
import type { MCP } from "../../core/mcp/tokens.js";
import { ensureDir, outputFile } from "../../utils/fs.js";
import { RooCodeCommandsConverter } from "../commands/roocode-commands-converter.js";
import { RooCodeRulesConverter } from "../rules/roocode-rules-converter.js";
import type { ToolConverter } from "./types.js";

export class RooCodeToolConverter implements ToolConverter {
  name = "roocode" as const;

  async syncAgents(_cwd: string): Promise<void> {
    // RooCode supports AGENTS.md natively; no-op
  }

  async syncRules(rules: Map<string, string>, cwd: string): Promise<void> {
    const rulesDir = path.join(cwd, ".roo", "rules");
    const converter = new RooCodeRulesConverter();

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
    const commandsDir = path.join(cwd, ".roo", "commands");
    const converter = new RooCodeCommandsConverter();

    for (const [namespacedFilename, content] of commands) {
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(commandsDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const rooDir = path.join(cwd, ".roo");
    await ensureDir(rooDir);
    const mcpFile = path.join(rooDir, "mcp.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
