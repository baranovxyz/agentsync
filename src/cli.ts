/**
 * Main CLI entry point
 *
 * This file is the main entry point for the `agentsync` CLI. It uses `commander`
 * to parse command-line arguments and execute the corresponding commands.
 *
 * Registered commands (8 leaf commands):
 *   init, sync, doctor, clean
 *   config add, config rm, config ls, config show
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import esMain from "es-main";
import { type CleanResult, cleanCommand } from "./commands/clean.js";
import { configAdd } from "./commands/config/add.js";
import { configLs } from "./commands/config/ls.js";
import { configRm } from "./commands/config/rm.js";
import { configShow } from "./commands/config/show.js";
import { doctor } from "./commands/doctor/index.js";
import { init } from "./commands/init.js";
import { sync } from "./commands/sync.js";
import { formatSafetyNetError, statusToExitCode } from "./core/errors.js";
import {
  type CleanData,
  type ConfigAddData,
  type ConfigRmData,
  cliResult,
  jsonStringify,
  projectFields,
} from "./types/output.js";

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

/** Display clean results in human-readable format. */
async function displayCleanResults(
  results: CleanResult[],
  dryRun: boolean,
  totalFiles: number,
  totalDirs: number,
): Promise<void> {
  const pc = (await import("picocolors")).default;
  if (dryRun) console.log(pc.yellow("\nDry run - no files will be removed\n"));

  for (const result of results) {
    if (result.removedFiles.length + result.removedDirs.length === 0) continue;
    console.log(pc.bold(`${result.tool}:`));
    for (const f of result.removedFiles) console.log(pc.gray(`  - ${f}`));
    for (const d of result.removedDirs) console.log(pc.gray(`  - ${d}/`));
  }

  if (totalFiles === 0 && totalDirs === 0) {
    console.log(pc.gray("\nNothing to clean.\n"));
  } else {
    const verb = dryRun ? "Would remove" : "Removed";
    console.log(
      pc.green(
        `\n${verb} ${totalFiles} file(s) and ${totalDirs} directory/directories.\n`,
      ),
    );
  }
}

/** Detect JSON mode: explicit --json flag OR non-TTY stdout (pipelines, CI). */
function resolveJsonMode(explicitJson?: boolean): boolean {
  return explicitJson || !process.stdout.isTTY;
}

/**
 * Resolve pretty-print for JSON output.
 * - --pretty flag: always pretty-print
 * - --json explicit (no --pretty): minified (agent-optimized default)
 * - Auto-detected JSON (non-TTY, no --json flag): minified
 */
function resolvePretty(
  explicitPretty?: boolean,
  explicitJson?: boolean,
): boolean {
  if (explicitPretty) return true;
  // When --json is not explicit (auto-detected via non-TTY), still minify
  // When --json IS explicit, also minify (agents are the primary consumer)
  // Only pretty-print if --pretty is explicitly set
  if (explicitJson || !process.stdout.isTTY) return false;
  // Human-readable commands that default to JSON (config ls, config show)
  // get pretty-printed in TTY
  return true;
}

// Create program factory for testing
export function createProgram(options?: { exitOverride?: boolean }): Command {
  const program = new Command();

  if (options?.exitOverride) {
    program.exitOverride();
  }

  program
    .name("agentsync")
    .description("Sync AI coding agent configuration across tools")
    .version(version);

  // Init command
  program
    .command("init")
    .description("Initialize AgentSync in the current project")
    .option(
      "--tools <tools>",
      "Comma-separated list of tools (claude,opencode,cursor,roocode,codex,copilot,gemini)",
    )
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .action((options) => {
      const tools = options.tools
        ? options.tools.split(",").map((t: string) => t.trim())
        : undefined;
      init({
        tools,
        json: resolveJsonMode(options.json),
        pretty: resolvePretty(options.pretty, options.json),
      });
    });

  // Sync command
  program
    .command("sync")
    .description("Sync skills, commands, agents, and MCPs to tools")
    .option("-d, --dry-run", "Preview changes without writing files")
    .option("-t, --tool <tool>", "Sync only to a specific tool")
    .option("--copy", "Use file copies for tool outputs (default)")
    .option("--link", "Use symlinks instead of copying files")
    .option("--profile <name>", "Use a specific profile for sync")
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in JSON output",
    )
    .option("--ci", "CI/CD mode: non-interactive, implies --json")
    .option("--no-tool-detection", "Disable automatic tool directory detection")
    .action(async (options) => {
      await sync({
        dryRun: options.dryRun,
        tool: options.tool,
        profile: options.profile,
        link: options.link,
        json: resolveJsonMode(options.json),
        pretty: resolvePretty(options.pretty, options.json),
        fields: options.fields,
        ci: options.ci,
        // Commander's --no-X flags expose as options.X = false (not options.noX)
        noToolDetection: options.toolDetection === false,
      });
    });

  // Clean command
  program
    .command("clean")
    .description("Remove all synced/generated files from tool directories")
    .option("-d, --dry-run", "Preview what would be removed without deleting")
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in JSON output",
    )
    .action(async (options) => {
      const results = await cleanCommand({ dryRun: options.dryRun });
      const totalFiles = results.reduce((n, r) => n + r.removedFiles.length, 0);
      const totalDirs = results.reduce((n, r) => n + r.removedDirs.length, 0);

      if (resolveJsonMode(options.json)) {
        const data: CleanData = {
          dryRun: !!options.dryRun,
          results,
          summary: { files: totalFiles, directories: totalDirs },
        };
        const validFields = ["dryRun", "results", "summary"] as const;
        const projected = projectFields(data, options.fields, validFields);
        console.log(
          jsonStringify(
            cliResult("clean", projected),
            resolvePretty(options.pretty, options.json),
          ),
        );
        return;
      }

      await displayCleanResults(
        results,
        !!options.dryRun,
        totalFiles,
        totalDirs,
      );
    });

  // Doctor command
  program
    .command("doctor")
    .description("Run diagnostics to debug configuration issues")
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in JSON output",
    )
    .action(async (options) => {
      await doctor({
        json: resolveJsonMode(options.json),
        pretty: resolvePretty(options.pretty, options.json),
        fields: options.fields,
      });
    });

  // Config commands
  const configCommand = program
    .command("config")
    .description("Manage AgentSync configuration");

  configCommand
    .command("add <type> <name>")
    .description("Add a tool, MCP server, preset, skill, or command to config")
    .option("--mcp-config <config>", "MCP server config as JSON string")
    .option("-d, --description <desc>", "Description for skill/command")
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .action(async (type, name, options) => {
      const result = await configAdd(type, name, {
        mcpConfig: options.mcpConfig,
        description: options.description,
      });
      if (resolveJsonMode(options.json)) {
        const data: ConfigAddData = {
          type: result.type,
          name: result.name,
          action: result.action === "already_exists" ? "exists" : result.action,
          path: result.path,
        };
        console.log(
          jsonStringify(
            cliResult("config.add", data),
            resolvePretty(options.pretty, options.json),
          ),
        );
        return;
      }
      if (result.action === "added") {
        console.log(`Added ${result.type} "${result.name}"`);
      } else {
        console.log(`${result.type} "${result.name}" already exists`);
      }
    });

  configCommand
    .command("rm <type> <name>")
    .description(
      "Remove a tool, MCP server, preset, skill, or command from config",
    )
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .action(async (type, name, options) => {
      const result = await configRm(type, name);
      if (resolveJsonMode(options.json)) {
        const data: ConfigRmData = {
          type: result.type,
          name: result.name,
          action: result.action,
          path: result.path,
        };
        console.log(
          jsonStringify(
            cliResult("config.rm", data),
            resolvePretty(options.pretty, options.json),
          ),
        );
        return;
      }
      if (result.action === "removed") {
        console.log(`Removed ${result.type} "${result.name}"`);
      } else {
        console.log(`${result.type} "${result.name}" not found`);
      }
    });

  configCommand
    .command("ls [type]")
    .description(
      "List configured items (tools, mcp, presets, skills, commands)",
    )
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in JSON output",
    )
    .action(async (type, options) => {
      const result = await configLs(type);
      if (resolveJsonMode(options.json)) {
        const validFields = [
          "tools",
          "mcp",
          "presets",
          "skills",
          "commands",
        ] as const;
        const projected = projectFields(result, options.fields, validFields);
        const pretty = resolvePretty(options.pretty, options.json);
        console.log(jsonStringify(cliResult("config.ls", projected), pretty));
      } else {
        console.log(jsonStringify(result, resolvePretty(options.pretty)));
      }
    });

  configCommand
    .command("show")
    .description("Dump full resolved config as JSON")
    .option("--json", "Output structured JSON (for AI agents)")
    .option("--pretty", "Pretty-print JSON output (useful in pipes)")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in JSON output",
    )
    .action(async (options) => {
      const config = await configShow();
      if (resolveJsonMode(options.json)) {
        const validFields = ["tools", "mcp", "extends", "profiles"] as const;
        const projected = projectFields(config, options.fields, validFields);
        const pretty = resolvePretty(options.pretty, options.json);
        console.log(jsonStringify(cliResult("config.show", projected), pretty));
      } else {
        console.log(jsonStringify(config, resolvePretty(options.pretty)));
      }
    });

  return program;
}

// Separate handlers for distinct process events — not duplicates
process.on("SIGINT", () => {
  process.exit(130); // 128 + signal 2
});
// Guard against EPIPE on both stdout and stderr (e.g. piping to `head`)
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") return;
  throw err;
});
process.stderr.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") return;
  throw err;
});
process.on("uncaughtException", (err) => {
  const isJson = process.argv.includes("--json") || !process.stdout.isTTY;
  const formatted = formatSafetyNetError(err, isJson);
  if (isJson) {
    // In JSON mode, errors go to stdout as valid JSON
    process.stdout.write(`${formatted}\n`);
  } else {
    process.stderr.write(formatted);
  }
  process.exitCode = statusToExitCode("error", err);
});
process.on("unhandledRejection", (reason) => {
  const isJson = process.argv.includes("--json") || !process.stdout.isTTY;
  const formatted = formatSafetyNetError(reason, isJson);
  if (isJson) {
    process.stdout.write(`${formatted}\n`);
  } else {
    process.stderr.write(formatted);
  }
  process.exitCode = statusToExitCode("error", reason);
});

// Main CLI entry point
const isMain =
  typeof import.meta.main === "boolean"
    ? import.meta.main
    : esMain(import.meta);
if (isMain) {
  const program = createProgram();
  program.parseAsync().catch((error) => {
    if (
      error?.code === "commander.helpDisplayed" ||
      error?.code === "commander.version"
    ) {
      process.exit(0);
    }

    const isJson = process.argv.includes("--json") || !process.stdout.isTTY;
    const formatted = formatSafetyNetError(error, isJson);

    if (isJson) {
      process.stdout.write(`${formatted}\n`);
    } else {
      process.stderr.write(formatted);
    }
    process.exitCode = statusToExitCode("error", error);
  });
}
