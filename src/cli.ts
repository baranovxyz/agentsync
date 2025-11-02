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
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import esMain from "es-main";
import { discoverCommand } from "./commands/discover.js";
import { updateGitignore } from "./commands/gitignore.js";
import { importCommand } from "./commands/import.js";
import { init } from "./commands/init.js";
import { addMCP as addMcp } from "./commands/mcp/add.js";
import { listMCP as listMcp } from "./commands/mcp/list.js";
import { removeMCP as removeMcp } from "./commands/mcp/remove.js";
import { handleAddPresetCommand } from "./commands/preset/add.js";
import { clearCache } from "./commands/preset/cache-clear.js";
import { listPresets } from "./commands/preset/list.js";
import { removePreset } from "./commands/preset/remove.js";
import { selectPreset } from "./commands/preset/select.js";
import { statusCommand } from "./commands/status.js";
import { sync } from "./commands/sync.js";

// Set up error handling
// Note: ErrorHandler is a static class, so we don't instantiate it

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, "../package.json");

let version: string;
try {
  const packageJsonContent = await readFile(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(packageJsonContent);
  version = packageJson.version || "0.0.0";
} catch (error) {
  console.warn("Failed to read version from package.json:", error);
  version = "0.0.0";
}

// Create program factory for testing
export function createProgram(options?: { exitOverride?: boolean }): Command {
  const program = new Command();

  // Enable exitOverride for testing only
  if (options?.exitOverride) {
    program.exitOverride();
  }

  program
    .name("agentsync")
    .description(
      "The missing infrastructure layer for AI coding agent configuration management",
    )
    .version(version);

  // Init command
  program
    .command("init")
    .description("Initialize AgentSync in the current project")
    .option(
      "--tools <tools>",
      "Comma-separated list of tools (cursor,claude,cline,roocode)",
    )
    .action((options) => {
      const tools = options.tools
        ? options.tools.split(",").map((t: string) => t.trim())
        : undefined;
      init({ tools });
    });

  // Sync command
  program
    .command("sync")
    .description("Sync AGENTS.md to your tools")
    .option("-d, --dry-run", "Preview changes without writing files")
    .option("-p, --pull", "Pull latest presets from sources")
    .option("-t, --tool <tool>", "Sync only to a specific tool")
    .option(
      "--no-tool-detection",
      "Disable automatic tool directory detection (for debugging)",
    )
    .action(async (options) => {
      await sync({
        dryRun: options.dryRun,
        pull: options.pull,
        tool: options.tool,
        noToolDetection: !options.toolDetection,
      });
    });

  // Status command
  program
    .command("status")
    .description("Show AgentSync configuration status")
    .action(async () => {
      await statusCommand();
    });

  // Discover command
  program
    .command("discover")
    .description("Discover tool directories in project and global scope")
    .action(async () => {
      await discoverCommand();
    });

  // Gitignore command
  program
    .command("gitignore")
    .description("Update .gitignore based on current config")
    .action(async () => {
      await updateGitignore();
    });

  // Import command
  program
    .command("import <source>")
    .description("Import rules, commands, and MCP from existing tool directory")
    .option("-t, --tool <tool>", "Specify tool type (cursor, claude, cline)")
    .option("-o, --output <path>", "Output directory (default: .agentsync)")
    .option("-c, --confirm", "Show preview and ask for confirmation")
    .option("-v, --verbose", "Show detailed file list in preview")
    .action(async (source, options) => {
      await importCommand({
        source,
        tool: options.tool,
        output: options.output,
        confirm: options.confirm,
        verbose: options.verbose,
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

  // mcp sync removed; MCP sync now part of main 'sync' command

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
    .command("select")
    .description("Interactively select presets and file-level selections")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (options) => {
      await selectPreset(options);
    });

  presetCommand
    .command("remove")
    .description("Interactively remove presets and their selections")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (options) => {
      await removePreset(options);
    });

  return program;
}

// Main CLI entry point (only execute if this is the main module)
// Prefer native import.meta.main when available; fall back to es-main for older Node
const isMain =
  typeof import.meta.main === "boolean"
    ? import.meta.main
    : esMain(import.meta);
if (isMain) {
  const program = createProgram();
  program.parse();
}
