/**
 * Import Command
 * Import rules, commands, and MCP from existing tool directories
 */

import * as path from "node:path";
import picocolors from "picocolors";
import { getCodecRegistry, type ToolCodec } from "../targets/codec-registry.js";
import type {
  CanonicalCommand,
  CanonicalRule,
  ImportedCommand,
  ImportedRule,
} from "../types/canonical.js";
import { serializeFrontmatter } from "../utils/frontmatter.js";
import { ensureDir, outputFile } from "../utils/fs.js";
import {
  type DuplicateGroup,
  detectDuplicates,
  formatDuplicateDetails,
  formatDuplicateSummary,
} from "./import/duplicate-detector.js";

const pc = picocolors;

export interface ImportOptions {
  tool?: string;
  source: string;
  output?: string;
}

/**
 * Apply last-wins resolution: keep the last (most recently modified) variant
 */
function applyLastWinsResolution(group: DuplicateGroup): {
  source: string;
  filename: string;
  content: CanonicalRule | CanonicalCommand;
} {
  // Sort by modified time (newest first), then by source name for determinism
  const sorted = [...group.variants].sort((a, b) => {
    if (a.modifiedTime && b.modifiedTime) {
      return b.modifiedTime.getTime() - a.modifiedTime.getTime();
    }
    if (a.modifiedTime) return -1;
    if (b.modifiedTime) return 1;
    return a.source.localeCompare(b.source);
  });

  const winner = sorted[0];
  return {
    source: winner.source,
    filename: winner.filename,
    content: winner.content,
  };
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
  let codec: ToolCodec | undefined;
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

  // Import all rules and commands (for duplicate detection)
  const allRules = new Map<string, Map<string, CanonicalRule | ImportedRule>>();
  const allCommands = new Map<
    string,
    Map<string, CanonicalCommand | ImportedCommand>
  >();

  // Import rules
  let importedRules: Map<string, CanonicalRule> = new Map();
  if (info.hasRules) {
    console.log(pc.cyan("Importing rules..."));
    importedRules = await codec.importRules(info.path);
    allRules.set(
      info.toolName,
      importedRules as Map<string, CanonicalRule | ImportedRule>,
    );
  }

  // Import commands
  let importedCommands: Map<string, CanonicalCommand> = new Map();
  if (info.hasCommands) {
    console.log(pc.cyan("Importing commands..."));
    importedCommands = await codec.importCommands(info.path);
    allCommands.set(
      info.toolName,
      importedCommands as Map<string, CanonicalCommand | ImportedCommand>,
    );
  }

  // Detect duplicates
  const ruleDuplicates = detectDuplicates(allRules);
  const commandDuplicates = detectDuplicates(allCommands);
  const allDuplicates = [...ruleDuplicates, ...commandDuplicates];

  // Warn about duplicates and apply last-wins resolution
  if (allDuplicates.length > 0) {
    console.log(pc.yellow(`\n⚠️  ${formatDuplicateSummary(allDuplicates)}\n`));

    for (const duplicate of allDuplicates) {
      console.log(pc.dim(formatDuplicateDetails(duplicate)));
      const winner = applyLastWinsResolution(duplicate);
      console.log(
        pc.cyan(
          `     → Using: ${winner.source}/${winner.filename} (last-wins resolution)\n`,
        ),
      );
    }

    console.log(
      pc.yellow(
        "Note: Conflicts resolved using 'last-wins' strategy (most recently modified).",
      ),
    );
    console.log(
      pc.gray(
        "      You can manually adjust imported files after import completes.\n",
      ),
    );
  }

  // Apply last-wins to deduped collections
  const finalRules = new Map<string, CanonicalRule>();
  for (const duplicate of ruleDuplicates) {
    const winner = applyLastWinsResolution(duplicate);
    finalRules.set(winner.filename, winner.content);
  }
  // Add non-duplicate rules
  for (const [filename, rule] of importedRules) {
    if (!finalRules.has(filename)) {
      finalRules.set(filename, rule);
    }
  }

  const finalCommands = new Map<string, CanonicalCommand>();
  for (const duplicate of commandDuplicates) {
    const winner = applyLastWinsResolution(duplicate);
    finalCommands.set(winner.filename, winner.content);
  }
  // Add non-duplicate commands
  for (const [filename, command] of importedCommands) {
    if (!finalCommands.has(filename)) {
      finalCommands.set(filename, command);
    }
  }

  // Write rules
  if (finalRules.size > 0) {
    console.log(pc.cyan("Writing rules..."));
    const rulesDir = path.join(outputPath, "rules");
    await ensureDir(rulesDir);

    for (const [filename, rule] of finalRules) {
      const content = serializeFrontmatter(rule.frontmatter, rule.markdown);
      const outputFilePath = path.join(rulesDir, filename);
      await outputFile(outputFilePath, content, { encoding: "utf-8" });
      console.log(pc.green(`  ✓ ${filename}`));
    }
    console.log();
  }

  // Write commands
  if (finalCommands.size > 0) {
    console.log(pc.cyan("Writing commands..."));
    const commandsDir = path.join(outputPath, "commands");
    await ensureDir(commandsDir);

    for (const [filename, command] of finalCommands) {
      const content = serializeFrontmatter(
        command.frontmatter,
        command.markdown,
      );
      const outputFilePath = path.join(commandsDir, filename);
      await outputFile(outputFilePath, content, { encoding: "utf-8" });
      console.log(pc.green(`  ✓ ${filename}`));
    }
    console.log();
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

  // Print summary
  console.log(pc.bold("\n📊 Import Summary"));
  console.log(pc.gray("─".repeat(40)));

  // Rules summary
  if (finalRules.size > 0) {
    const rulesDuplicateNote =
      ruleDuplicates.length > 0
        ? pc.yellow(` (${ruleDuplicates.length} duplicates resolved)`)
        : "";
    console.log(
      pc.green(`  ✓ Imported ${finalRules.size} rules`) + rulesDuplicateNote,
    );
  } else if (info.hasRules) {
    console.log(pc.gray(`  • No rules imported (all were duplicates)`));
  }

  // Commands summary
  if (finalCommands.size > 0) {
    const commandsDuplicateNote =
      commandDuplicates.length > 0
        ? pc.yellow(` (${commandDuplicates.length} duplicates resolved)`)
        : "";
    console.log(
      pc.green(`  ✓ Imported ${finalCommands.size} commands`) +
        commandsDuplicateNote,
    );
  } else if (info.hasCommands) {
    console.log(pc.gray(`  • No commands imported (all were duplicates)`));
  }

  // MCP summary
  if (info.hasMCP) {
    const mcps = await codec.importMCP(info.path);
    if (mcps && Object.keys(mcps).length > 0) {
      console.log(
        pc.green(`  ✓ Imported ${Object.keys(mcps).length} MCP servers`),
      );
    }
  }

  console.log(pc.gray("─".repeat(40)));
  console.log();

  console.log(pc.gray("Next steps:"));
  console.log(pc.gray("  1. Review imported files in ") + pc.cyan(outputPath));
  console.log(
    pc.gray("  2. Run ") +
      pc.cyan("agentsync sync") +
      pc.gray(" to sync to other tools"),
  );
}
