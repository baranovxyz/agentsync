/**
 * Cline Tool Converter
 */

import { symlink } from "node:fs/promises";
import * as path from "node:path";
import type { MCP } from "../../core/mcp/tokens.js";
import { ensureDir, outputFile, pathExists } from "../../utils/fs.js";
import { ClineRulesConverter } from "../rules/cline-rules-converter.js";
import type { ToolConverter } from "./types.js";

export class ClineToolConverter implements ToolConverter {
  name = "cline" as const;

  async syncAgents(cwd: string): Promise<void> {
    const linkDir = path.join(cwd, ".clinerules");
    const link = path.join(linkDir, "AGENTS.md");
    const target = "../AGENTS.md";
    if (await pathExists(link)) return;
    try {
      await ensureDir(linkDir);
      await symlink(target, link);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  async syncRules(rules: Map<string, string>, cwd: string): Promise<void> {
    const rulesDir = path.join(cwd, ".clinerules");
    const converter = new ClineRulesConverter();

    for (const [namespacedFilename, content] of rules) {
      const converted = converter.convert(namespacedFilename, content);
      const outputPath = path.join(rulesDir, converted.filename);
      await outputFile(outputPath, converted.content, { encoding: "utf-8" });
    }
  }

  async syncCommands(): Promise<void> {
    // Cline does not support commands; no-op
  }

  async syncMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
    const mcpFile = path.join(cwd, "cline_mcp_settings.json");
    const config = { mcpServers: mcps };
    await outputFile(mcpFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
    });
  }
}
