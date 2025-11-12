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
import { disableMCP } from "./commands/mcp/disable.js";
import { enableMCP } from "./commands/mcp/enable.js";
import { listMCP as listMcp } from "./commands/mcp/list.js";
import { removeMCP } from "./commands/mcp/remove.js";
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
    .command("enable <name>")
    .description("Enable MCP server (ephemeral or managed mode)")
    .option(
      "-t, --tool <tool>",
      "Sync to specific tool (claude, cursor, cline, roocode)",
    )
    .option("--json <json>", "Inline MCP config as JSON")
    .option("--transport <type>", "Transport type (stdio, http, sse)")
    .option(
      "--env <var>",
      "Environment variable KEY=value (repeatable)",
      (val: string, prev: string[]) => (prev ? [...prev, val] : [val]),
    )
    .option(
      "--header <header>",
      "HTTP header NAME:VALUE (repeatable)",
      (val: string, prev: string[]) => (prev ? [...prev, val] : [val]),
    )
    .option("-u, --url <url>", "URL for http/sse transport")
    .option("--preset <preset>", "Load from preset (github:owner/repo)")
    .option("-s, --scope <scope>", "Scope for persistent mode (global/project)")
    .option("-f, --force", "Force overwrite if exists")
    .action(async (name, options) => {
      // Parse env and headers
      const env: Record<string, string> = {};
      if (options.env) {
        for (const pair of options.env) {
          const [key, value] = pair.split("=");
          if (key && value) env[key] = value;
        }
      }

      const headers: Record<string, string> = {};
      if (options.header) {
        for (const pair of options.header) {
          const [key, value] = pair.split(":");
          if (key && value) headers[key.trim()] = value.trim();
        }
      }

      const result = await enableMCP(name, {
        tool: options.tool,
        json: options.json,
        transport: options.transport,
        env: Object.keys(env).length > 0 ? env : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        url: options.url,
        preset: options.preset,
        scope: options.scope,
        force: options.force,
      });

      const modeLabel =
        result.mode === "ephemeral"
          ? " (ephemeral)"
          : result.mode === "persistent"
            ? " (persistent)"
            : "";

      if (result.enabled) {
        console.log(`✓ Enabled MCP server '${name}'${modeLabel}`);
        if (result.syncedToTools) {
          console.log(`  Synced to: ${result.syncedToTools.join(", ")}`);
        }
      }
    });

  mcpCommand
    .command("disable <name>")
    .description("Disable MCP server (managed or ephemeral mode)")
    .option("-t, --tool <tool>", "Ephemeral mode: remove from tool config")
    .action(async (name, options) => {
      const result = await disableMCP(name, { tool: options.tool });
      if (result.disabled) {
        const mode =
          result.mode === "ephemeral" ? " (ephemeral)" : " (managed)";
        console.log(`✓ Disabled MCP server '${name}'${mode}`);
      } else if (result.alreadyDisabled) {
        console.log(`MCP server '${name}' is already disabled`);
      }
    });

  mcpCommand
    .command("remove <name>")
    .description("Remove MCP server from tool config")
    .option(
      "-t, --tool <tool>",
      "Tool to remove from (claude, cursor, cline, roocode)",
    )
    .option(
      "-s, --scope <scope>",
      "Scope to remove from registry (global/project)",
    )
    .option("--from-registry", "Also remove from config registry")
    .action(async (name, options) => {
      const result = await removeMCP(name, {
        tool: options.tool,
        scope: options.scope,
        fromRegistry: options.fromRegistry,
      });

      if (result.removed) {
        if (result.removedFromTool) {
          console.log(
            `✓ Removed MCP server '${name}' from ${options.tool} config`,
          );
        }
        if (result.removedFromConfig) {
          console.log(`✓ Removed MCP server '${name}' from config registry`);
        }
      }
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
