/**
 * Main CLI entry point
 *
 * This file is the main entry point for the `agentsync` CLI. It uses `commander`
 * to parse command-line arguments and execute the corresponding commands.
 *
 * Each command is defined in its own file under `src/commands` and is
 * responsible for its own logic. This file just wires everything up.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import picocolors from "picocolors";
import { init } from "./commands/init.js";
import { addMCP as addMcp } from "./commands/mcp/add.js";
import { listMCP as listMcp } from "./commands/mcp/list.js";
import { removeMCP as removeMcp } from "./commands/mcp/remove.js";
import { syncMCP as syncMcp } from "./commands/mcp/sync.js";
import { handleAddPresetCommand } from "./commands/preset/add.js";
import { clearCache } from "./commands/preset/cache-clear.js";
import { interactiveRemovePreset } from "./commands/preset/interactive-remove.js";
import { interactiveSelectPreset } from "./commands/preset/interactive-select.js";
import { listPresets } from "./commands/preset/list.js";
import { sync } from "./commands/sync.js";

const pc = picocolors;

// Set up error handling
// Note: ErrorHandler is a static class, so we don't instantiate it

// Main CLI entry point
const program = new Command();

program
  .name("agentsync")
  .description(
    "The missing infrastructure layer for AI coding agent configuration management",
  )
  .version("0.2.0-alpha.12");

// Init command
program
  .command("init")
  .description("Initialize AgentSync in the current project")
  .option("-t, --template <template>", "Template to use for AGENTS.md")
  .action((options) => {
    init({ template: options.template });
  });

// Sync command
program
  .command("sync")
  .description("Sync AGENTS.md to your tools")
  .option("-d, --dry-run", "Preview changes without writing files")
  .option("-u, --update", "Update GitHub caches (re-clone repositories)")
  .option("-t, --tool <tool>", "Sync only to a specific tool")
  .option("-s, --selections", "Sync with interactive selections")
  .action(async (options) => {
    let selections;
    if (options.selections) {
      try {
        const projectConfigContent = await readFile(
          path.join(process.cwd(), ".agentsync", "interactive-selections.json"),
          "utf-8",
        );
        const projectConfig = JSON.parse(projectConfigContent);
        if (projectConfig.project?.selections) {
          selections = projectConfig.project.selections;
        }
      } catch {
        // Silently continue if selections can't be loaded
      }
    }

    await sync({
      dryRun: options.dryRun,
      update: options.update,
      tool: options.tool,
      selections,
    });
  });

// MCP commands
const mcpCommand = program.command("mcp").description("Manage MCP servers");

mcpCommand
  .command("add <name>")
  .description("Add a new MCP server")
  .action(async (name) => {
    await addMcp(name);
  });

mcpCommand
  .command("remove <name>")
  .description("Remove an MCP server")
  .action(async (name) => {
    await removeMcp(name);
  });

mcpCommand
  .command("list")
  .description("List all MCP servers")
  .action(async () => {
    await listMcp();
  });

mcpCommand
  .command("sync")
  .description("Sync MCP configurations to tools")
  .option("-t, --tool <tool>", "Sync only to a specific tool")
  .option("-d, --dry-run", "Preview changes without writing files")
  .action(async (options) => {
    await syncMcp(options);
  });

// Preset commands
const presetCommand = program
  .command("preset")
  .description("Manage preset libraries");

presetCommand
  .command("add <source>")
  .description("Add a preset from a GitHub source")
  .option("-s, --selection", "Configure selection for the preset")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (source, options) => {
    await handleAddPresetCommand(source, options);
  });

presetCommand
  .command("list")
  .description("List all configured presets")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    await listPresets(options);
  });

presetCommand
  .command("cache-clear")
  .description("Clear preset cache")
  .option("-a, --all", "Clear all caches")
  .action(async (options) => {
    await clearCache(options);
  });

presetCommand
  .command("interactive-select")
  .description("Interactively select presets and file-level selections")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options) => {
    await interactiveSelectPreset(options);
  });

presetCommand
  .command("interactive-remove")
  .description("Interactively remove presets and their selections")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options) => {
    await interactiveRemovePreset(options);
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (err) {
  if (err instanceof Error) {
    console.error(pc.red(`✗ ${err.message}`));
    process.exit(1);
  }
  throw err;
}
