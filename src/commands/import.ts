/**
 * Import Command
 * Import rules, commands, and MCP from existing tool directories
 */

import * as path from "node:path";
import picocolors from "picocolors";
import { getCodecRegistry } from "../targets/codec-registry.js";
import { serializeFrontmatter } from "../utils/frontmatter.js";
import { ensureDir, outputFile } from "../utils/fs.js";

const pc = picocolors;

export interface ImportOptions {
  tool?: string;
  source: string;
  output?: string;
}

/**
 * Import rules and commands from a tool directory
 */
export async function importCommand(options: ImportOptions): Promise<void> {
  console.log(pc.blue("📥 Importing from tool directory...\n"));

  const sourcePath = path.resolve(options.source);
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(process.cwd(), ".agentsync");

  console.log(pc.gray(`Source: ${sourcePath}`));
  console.log(pc.gray(`Output: ${outputPath}\n`));

  // Get codec registry
  const registry = getCodecRegistry();

  // Detect tool type or use specified tool
  let codec;
  if (options.tool) {
    codec = registry.get(options.tool);
    if (!codec) {
      throw new Error(`Unknown tool: ${options.tool}`);
    }
  } else {
    const detected = await registry.detect(sourcePath);
    if (!detected) {
      throw new Error(
        `Could not detect tool type at ${sourcePath}. Try specifying --tool explicitly.`,
      );
    }
    codec = detected.codec;
    console.log(pc.green(`✓ Detected tool: ${detected.toolName}\n`));
  }

  // Detect and display info
  const info = await codec.detect(sourcePath);
  if (!info) {
    throw new Error(`No tool directory found at ${sourcePath}`);
  }

  console.log(pc.bold("Tool Directory Info:"));
  console.log(pc.gray(`  Tool: ${info.toolName}`));
  console.log(pc.gray(`  Scope: ${info.scope}`));
  console.log(pc.gray(`  Rules: ${info.ruleCount || 0}`));
  console.log(pc.gray(`  Commands: ${info.commandCount || 0}`));
  console.log(pc.gray(`  MCP: ${info.hasMCP ? "Yes" : "No"}\n`));

  // Import rules
  if (info.hasRules) {
    console.log(pc.cyan("Importing rules..."));
    const rules = await codec.importRules(info.path);

    const rulesDir = path.join(outputPath, "rules");
    await ensureDir(rulesDir);

    for (const [filename, rule] of rules) {
      const content = serializeFrontmatter(rule.frontmatter, rule.markdown);
      const outputFilePath = path.join(rulesDir, filename);
      await outputFile(outputFilePath, content, { encoding: "utf-8" });
      console.log(pc.green(`  ✓ ${filename}`));
    }

    console.log(pc.green(`\n✓ Imported ${rules.size} rules\n`));
  }

  // Import commands
  if (info.hasCommands) {
    console.log(pc.cyan("Importing commands..."));
    const commands = await codec.importCommands(info.path);

    const commandsDir = path.join(outputPath, "commands");
    await ensureDir(commandsDir);

    for (const [filename, command] of commands) {
      const content = serializeFrontmatter(
        command.frontmatter,
        command.markdown,
      );
      const outputFilePath = path.join(commandsDir, filename);
      await outputFile(outputFilePath, content, { encoding: "utf-8" });
      console.log(pc.green(`  ✓ ${filename}`));
    }

    console.log(pc.green(`\n✓ Imported ${commands.size} commands\n`));
  }

  // Import MCP
  if (info.hasMCP) {
    console.log(pc.cyan("Importing MCP configuration..."));
    const mcps = await codec.importMCP(info.path);

    if (mcps && Object.keys(mcps).length > 0) {
      const mcpFile = path.join(outputPath, "mcp.json");
      await outputFile(mcpFile, JSON.stringify({ mcpServers: mcps }, null, 2), {
        encoding: "utf-8",
      });
      console.log(
        pc.green(`  ✓ Imported ${Object.keys(mcps).length} MCP servers\n`),
      );
    }
  }

  console.log(pc.green("✅ Import complete!\n"));
  console.log(pc.gray("Next steps:"));
  console.log(pc.gray("  1. Review imported files in ") + pc.cyan(outputPath));
  console.log(
    pc.gray("  2. Run ") +
      pc.cyan("agentsync sync") +
      pc.gray(" to sync to other tools"),
  );
}
