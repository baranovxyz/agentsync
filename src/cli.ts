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
      }

      if (result.inactive.length > 0) {
        console.log(pc.gray(`○ Available but not active (${result.inactive.length}):`));
        for (const name of result.inactive) {
          const mcp = result.mcps[name];
          console.log(pc.gray(`  ${name} - ${mcp.args.join(' ')}`));
        }
        console.log();
      }

      console.log(pc.gray("To add an MCP: agentsync mcp add <name>"));
      console.log(pc.gray("To sync: agentsync mcp sync"));
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

// Sync command (AGENTS.md sync - existing functionality)
program
  .command("sync")
  .description("One-time sync of AGENTS.md to all configured tools")
  .option(
    "--tool <name>",
    "Sync only specific tool (cursor, claude, cline, windsurf, copilot)"
  )
  .option("--dry-run", "Preview changes without applying them")
  .option("-f, --force", "Force sync even if validation fails")
  .option("--skip-validation", "Skip AGENTS.md validation")
  .option("--skip-security", "Skip security checks (NOT RECOMMENDED)")
  .action(async (options) => {
    try {
      // TODO: Implement sync command
      console.log(pc.yellow("⚠️  Sync command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Watch command
program
  .command("watch")
  .description("Watch mode with auto-sync (<5s latency)")
  .option("--tool <name>", "Watch and sync only specific tool")
  .option("--debounce <ms>", "Debounce time in milliseconds", "500")
  .option("--ignore <patterns>", "Comma-separated ignore patterns")
  .action(async (options) => {
    try {
      // TODO: Implement watch command
      console.log(pc.yellow("⚠️  Watch command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Validate command
program
  .command("validate")
  .description("Validate AGENTS.md against specification")
  .option("--strict", "Enable strict mode (enforce best practices)")
  .option("--fix", "Automatically fix issues where possible")
  .option("--show-secrets", "Show detected secrets (for debugging)")
  .action(async (options) => {
    try {
      // TODO: Implement validate command
      console.log(pc.yellow("⚠️  Validate command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Diff command
program
  .command("diff")
  .description("Preview changes before syncing")
  .option("--tools <tools>", "Comma-separated list of tools to diff")
  .option("-v, --verbose", "Show detailed line-by-line diff")
  .action(async (options) => {
    try {
      // TODO: Implement diff command
      console.log(pc.yellow("⚠️  Diff command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Migrate command
program
  .command("migrate")
  .description("Import from existing tool configs")
  .option("--symlinks", "Create symlinks to unified AGENTS.md")
  .option("--sources <files>", "Comma-separated list of config files to import")
  .option("-f, --force", "Overwrite existing AGENTS.md")
  .action(async (options) => {
    try {
      // TODO: Implement migrate command
      console.log(pc.yellow("⚠️  Migrate command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Doctor command
program
  .command("doctor")
  .description("Health check with actionable fixes")
  .option("--fix", "Automatically fix issues where possible")
  .option("-v, --verbose", "Show detailed diagnostics")
  .action(async (options) => {
    try {
      // TODO: Implement doctor command
      console.log(pc.yellow("⚠️  Doctor command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

// Status command
program
  .command("status")
  .description("Show sync state and configuration")
  .action(async () => {
    try {
      // TODO: Implement status command
      console.log(pc.yellow("⚠️  Status command not yet implemented"));
    } catch (error) {
      handleError(error as Error);
    }
  });

// Tree command (for monorepos)
program
  .command("tree")
  .description("Visualize monorepo config structure")
  .action(async () => {
    try {
      // TODO: Implement tree command
      console.log(pc.yellow("⚠️  Tree command not yet implemented"));
    } catch (error) {
      handleError(error as Error);
    }
  });

// Audit command
program
  .command("audit")
  .description("Query audit logs")
  .option("--command <name>", "Filter by command")
  .option("--result <type>", "Filter by result (success, failure, partial)")
  .option("--after <days>", "Show logs from last N days (e.g., 7d)")
  .option("--limit <count>", "Limit number of entries", "10")
  .action(async (options) => {
    try {
      // TODO: Implement audit command
      console.log(pc.yellow("⚠️  Audit command not yet implemented"));
      console.log("Options:", options);
    } catch (error) {
      handleError(error as Error);
    }
  });

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
  console.log(
    "  $ agentsync init                    # Interactive setup wizard"
  );
  console.log("  $ agentsync sync                    # Sync to all tools");
  console.log("  $ agentsync sync --dry-run          # Preview changes");
  console.log("  $ agentsync watch                   # Enable auto-sync");
  console.log("  $ agentsync validate --strict       # Check AGENTS.md");
  console.log("  $ agentsync doctor                  # Health check");
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
