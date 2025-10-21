#!/usr/bin/env node
/**
 * AgentSync CLI - The missing infrastructure layer for AI coding agent configuration management
 */

import { Command } from "commander";
import { handleError } from "./core/error-handler.js";
import pc from "picocolors";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
const packagePath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));

// Create the main program
const program = new Command();

program
  .name("agentsync")
  .description(
    "Sync your AGENTS.md to all your AI coding tools - Cursor, Claude Code, Cline, Windsurf, GitHub Copilot"
  )
  .version(packageJson.version)
  .showHelpAfterError()
  .showSuggestionAfterError();

// Init command
program
  .command("init")
  .description("Initialize AgentSync with interactive setup wizard")
  .option(
    "-t, --template <name>",
    "Use a specific template (react-typescript, nextjs-app, python-fastapi, monorepo-nx)"
  )
  .option(
    "--tools <tools>",
    "Comma-separated list of tools to configure",
    (value) => value.split(",")
  )
  .option(
    "--use-symlinks",
    "Use symlinks for compatibility (recommended)",
    true
  )
  .option("--no-symlinks", "Use file copies instead of symlinks")
  .option("-f, --force", "Overwrite existing configuration")
  .action(async (options) => {
    try {
      const { init } = await import("./commands/init.js");
      await init(options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// MCP Commands (Phase 1)
const mcpCommand = program
  .command("mcp")
  .description("Manage MCP (Model Context Protocol) servers");

mcpCommand
  .command("sync")
  .description("Sync selected MCPs to AI coding tools")
  .option("--tool <name>", "Sync only to specific tool (cursor, claude)")
  .option("--dry-run", "Preview changes without applying them")
  .action(async (options) => {
    try {
      const { syncMCP } = await import("./commands/mcp/sync.js");
      await syncMCP(options);
      console.log(pc.green("✅ MCP sync complete!"));
    } catch (error) {
      handleError(error as Error);
    }
  });

mcpCommand
  .command("list")
  .description("List available and active MCP servers")
  .action(async () => {
    try {
      const { listMCP } = await import("./commands/mcp/list.js");
      const result = await listMCP();

      console.log(pc.cyan(`\nGlobal MCP Registry (${result.total} servers):\n`));

      if (result.active.length > 0) {
        console.log(pc.green(`✓ Active in this project (${result.active.length}):`));
        for (const name of result.active) {
          const mcp = result.mcps[name];
          console.log(pc.green(`  ${name}`) + pc.gray(` - ${mcp.args.join(' ')}`));
        }
        console.log();
      } else {
        console.log(pc.yellow('No MCP servers configured yet\n'));
      }

      if (result.inactive.length > 0) {
        console.log(pc.gray(`○ Available (${result.inactive.length}):`));
        for (const name of result.inactive) {
          const mcp = result.mcps[name];
          console.log(pc.gray(`  ${name} - ${mcp.args.join(' ')}`));
        }
        console.log();
      }

      if (result.active.length === 0) {
        console.log(pc.bold('Get started:'));
        console.log(pc.gray('  1. Add an MCP:   ') + pc.cyan('agentsync mcp add github'));
        console.log(pc.gray('  2. Sync to tools: ') + pc.cyan('agentsync mcp sync'));
      } else {
        console.log(pc.gray('To add an MCP: ') + pc.cyan('agentsync mcp add <name>'));
        console.log(pc.gray('To sync:       ') + pc.cyan('agentsync mcp sync'));
      }
    } catch (error) {
      handleError(error as Error);
    }
  });

mcpCommand
  .command("add <server>")
  .description("Add MCP server to project")
  .action(async (server: string) => {
    try {
      const { addMCP } = await import("./commands/mcp/add.js");
      const result = await addMCP(server);

      if (result.added) {
        console.log(pc.green(`✓ Added '${server}' to .agentsync.json`));

        if (result.requiredEnv.length > 0) {
          console.log(pc.yellow(`\nMCP '${server}' requires environment variables:`));
          for (const varName of result.requiredEnv) {
            console.log(pc.yellow(`  - ${varName}`));
          }
          console.log(pc.gray("\nAdd to .env file:"));
          console.log(pc.gray(`  echo "${result.requiredEnv[0]}=your_token_here" >> .env`));
        }

        console.log(pc.gray("\nRun 'agentsync mcp sync' to apply changes."));
      } else {
        console.log(pc.yellow(`⚠️  '${server}' already in project config`));
      }
    } catch (error) {
      handleError(error as Error);
    }
  });

mcpCommand
  .command("remove <server>")
  .description("Remove MCP server from project")
  .action(async (server: string) => {
    try {
      const { removeMCP } = await import("./commands/mcp/remove.js");
      const result = await removeMCP(server);

      if (result.removed) {
        console.log(pc.green(`✓ Removed '${server}' from .agentsync.json`));
        console.log(pc.gray("\nRun 'agentsync mcp sync' to apply changes."));
      } else {
        console.log(pc.yellow(`⚠️  '${server}' not found in project config`));
      }
    } catch (error) {
      handleError(error as Error);
    }
  });

// Main sync command (v0.3.0-beta)
program
  .command("sync")
  .description("Sync libraries, rules, commands, and MCPs to AI tools")
  .option("--update", "Update GitHub library caches (re-clone)")
  .option("--dry-run", "Preview changes without applying them")
  .option("--tool <name>", "Sync only to specific tool (cursor, claude)")
  .action(async (options) => {
    try {
      const { sync } = await import("./commands/sync.js");
      await sync(options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Library commands (v0.3.0-beta)
const libraryCommand = program
  .command("library")
  .description("Manage GitHub library sources");

libraryCommand
  .command("list")
  .description("List configured library sources")
  .action(async () => {
    try {
      const { listLibraries } = await import("./commands/library/list.js");
      await listLibraries();
    } catch (error) {
      handleError(error as Error);
    }
  });

libraryCommand
  .command("cache-clear")
  .description("Clear library caches")
  .option("--all", "Clear all caches (not just project libraries)")
  .action(async (options) => {
    try {
      const { clearCache } = await import("./commands/library/cache-clear.js");
      await clearCache(options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Phase 2 commands (AGENTS.md sync) - Not yet implemented
// Removed to avoid user confusion. Will be added back as features are completed.

// Add ASCII art logo for fun
const showLogo = () => {
  console.log(
    pc.cyan(`
  ╔═══════════════════════════════════════╗
  ║     AgentSync v${packageJson.version}              ║
  ║  The missing infrastructure layer     ║
  ║  for AI agent configuration sync      ║
  ╚═══════════════════════════════════════╝
  `)
  );
};

// Show logo on help
program.on("--help", () => {
  showLogo();
  console.log("");
  console.log("Examples:");
  console.log("  $ agentsync init                      # Interactive setup wizard");
  console.log("  $ agentsync sync                      # Sync libraries, rules, commands, MCPs");
  console.log("  $ agentsync sync --update             # Update GitHub caches and sync");
  console.log("  $ agentsync sync --dry-run            # Preview sync changes");
  console.log("  $ agentsync library list              # List configured libraries");
  console.log("  $ agentsync library cache-clear       # Clear library caches");
  console.log("  $ agentsync mcp list                  # List available MCPs");
  console.log("  $ agentsync mcp add github            # Add MCP server");
  console.log("");
  console.log("Documentation:");
  console.log("  https://github.com/baranovxyz/agentsync");
});

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  showLogo();
  program.outputHelp();
}
