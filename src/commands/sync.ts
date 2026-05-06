/**
 * Main Sync Command
 * Thin orchestrator: builds a plan, executes it, formats output.
 */

import * as path from "node:path";
import fg from "fast-glob";
import ora from "ora";
import picocolors from "picocolors";
import { ConfigError, statusToExitCode } from "../core/errors.js";
import { executeSyncPlan, type SyncResult } from "../sync/execute.js";
import { buildSyncPlan, type SyncPlanOptions } from "../sync/plan.js";
import {
  type CliError,
  cliError,
  cliResult,
  jsonStringify,
  projectFields,
  type SyncData,
  type SyncToolDetail,
} from "../types/output.js";

// Short alias used throughout this file
const pc = picocolors;

/**
 * Main sync command options
 */
export interface MainSyncOptions extends SyncPlanOptions {
  json?: boolean;
  pretty?: boolean;
  fields?: string;
  ci?: boolean;
}

const SYNC_VALID_FIELDS = [
  "tools",
  "skills",
  "commands",
  "agents",
  "mcpServers",
  "details",
] as const;

/**
 * Main sync command
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: thin orchestrator with three code paths
export async function sync(options: MainSyncOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const isJson = options.json || options.ci;

  try {
    // 1. Build the sync plan (config, profile, presets, MCP resolution)
    const spinner = isJson ? null : ora("Loading configuration...").start();

    // biome-ignore lint/suspicious/noImplicitAnyLet: plan type is inferred from buildSyncPlan
    let plan;
    try {
      plan = await buildSyncPlan(options);
    } catch (error) {
      spinner?.fail("Failed to load configuration");
      if (isJson) {
        return emitJsonError("sync", error, options);
      }
      throw error;
    }

    spinner?.succeed("Configuration loaded");

    // Show global config source in human mode
    if (!isJson && plan.config._sources.global) {
      console.log(
        pc.gray(`  Using global config: ${plan.config._sources.global}`),
      );
    }

    // Show active profile in human mode
    if (!isJson && plan.config.profiles) {
      const profileName =
        options.profile ?? process.env.AGENTSYNC_PROFILE ?? plan.config.profile;
      if (profileName && plan.config.profiles[profileName]) {
        console.log(pc.gray(`  Using profile: ${profileName}`));
      }
    }

    // Show plan warnings in human mode
    if (!isJson) {
      for (const w of plan.warnings) {
        console.warn(pc.yellow(`  Warning: ${w}`));
      }
      for (const e of plan.presetErrors) {
        console.warn(pc.yellow(`  Warning: ${e.message}`));
      }
    }

    if (!isJson) {
      if (options.dryRun) {
        console.log(
          pc.yellow("\n📋 Dry run mode - no files will be written\n"),
        );
      }
      console.log(
        pc.gray("Tools: ") +
          (plan.tools.length > 0 ? plan.tools.join(", ") : pc.gray("(none)")),
      );
    }

    // 2. Execute, dry-run, or no-tools
    if (!options.dryRun && plan.providers.length > 0) {
      await executeAndDisplay(plan, options, cwd, isJson);
    } else if (options.dryRun) {
      await dryRunDisplay(plan, options, cwd, isJson);
    } else {
      // No tools configured and not dry-run
      emitNoTools(options, plan.warnings, isJson);
    }
  } catch (error) {
    if (isJson) {
      return emitJsonError("sync", error, options);
    }
    throw error;
  }
}

// ── Execute Path ──────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: display logic with JSON/human branches
async function executeAndDisplay(
  plan: Awaited<ReturnType<typeof buildSyncPlan>>,
  options: MainSyncOptions,
  cwd: string,
  isJson: boolean | undefined,
): Promise<void> {
  const syncSpinner = isJson ? null : ora("Syncing...").start();

  let result: SyncResult;
  try {
    result = await executeSyncPlan(plan, { link: options.link, cwd });
  } catch (error) {
    syncSpinner?.fail("Sync failed");
    throw error;
  }

  syncSpinner?.succeed("Synced all items");

  // Merge warnings from plan and execution
  const allWarnings = [...plan.warnings, ...result.warnings];

  if (!isJson) {
    // Print per-step summaries
    if (result.totalSkills > 0) {
      console.log(pc.green(`  ✔ Synced ${result.totalSkills} skills`));
    }
    if (result.totalCommands > 0) {
      console.log(pc.green(`  ✔ Synced ${result.totalCommands} commands`));
    }
    if (result.totalAgents > 0) {
      console.log(pc.green(`  ✔ Synced ${result.totalAgents} agents`));
    }
    if (result.mcpServerCount > 0) {
      console.log(pc.green(`  ✔ Synced ${result.mcpServerCount} MCP servers`));
    }

    if (allWarnings.length > 0) {
      console.log(
        pc.yellow(
          `\n⚠ ${allWarnings.length} warning${allWarnings.length === 1 ? "" : "s"} during sync:`,
        ),
      );
      for (const w of allWarnings) {
        console.log(pc.yellow(`  - ${w}`));
      }
      console.log();
    }
    console.log(pc.green("✅ Sync complete!\n"));
  } else {
    const data: SyncData = {
      tools: plan.tools,
      skills: result.totalSkills,
      commands: result.totalCommands,
      agents: result.totalAgents,
      mcpServers: result.mcpServerCount,
      details: result.details,
    };
    const projected = projectFields(data, options.fields, SYNC_VALID_FIELDS);
    const status =
      plan.presetErrors.length > 0
        ? ("partial" as const)
        : ("success" as const);
    const output = cliResult("sync", projected, {
      status,
      errors: plan.presetErrors.length > 0 ? plan.presetErrors : undefined,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    });
    console.log(jsonStringify(output, options.pretty));
    if (status === "partial") process.exitCode = statusToExitCode("partial");
  }
}

// ── Dry-Run Path ─────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dry-run file enumeration with preset traversal
async function dryRunDisplay(
  plan: Awaited<ReturnType<typeof buildSyncPlan>>,
  options: MainSyncOptions,
  cwd: string,
  isJson: boolean | undefined,
): Promise<void> {
  const { pathExists: exists } = await import("../utils/fs.js");
  const projectSkillsDir = path.join(cwd, ".agents", "skills");
  const projectCommandsDir = path.join(cwd, ".agents", "commands");
  const projectAgentsDir = path.join(cwd, ".agents", "agents");

  const plannedSkills = (await exists(projectSkillsDir))
    ? (await fg("*/SKILL.md", { cwd: projectSkillsDir })).map((f) =>
        path.dirname(f),
      )
    : [];
  const plannedCommands = (await exists(projectCommandsDir))
    ? await fg("**/*.md", { cwd: projectCommandsDir })
    : [];
  const plannedAgents = (await exists(projectAgentsDir))
    ? await fg("**/*.md", { cwd: projectAgentsDir })
    : [];

  // Add global user content sources (lowest priority — listed first)
  for (const dir of plan.hierarchySkillDirs) {
    if (await exists(dir)) {
      const files = await fg("*/SKILL.md", { cwd: dir });
      plannedSkills.unshift(...files.map((f) => path.dirname(f)));
    }
  }
  for (const dir of plan.hierarchyCommandDirs) {
    if (await exists(dir)) {
      const files = await fg("**/*.md", { cwd: dir });
      plannedCommands.unshift(...files);
    }
  }
  for (const dir of plan.hierarchyAgentDirs) {
    if (await exists(dir)) {
      const files = await fg("**/*.md", { cwd: dir });
      plannedAgents.unshift(...files);
    }
  }

  // Add preset sources
  if (plan.presetSkills) {
    for (const [ns, dirs] of plan.presetSkills) {
      for (const dir of dirs) {
        if (await exists(dir)) {
          const files = await fg("*/SKILL.md", { cwd: dir });
          plannedSkills.push(...files.map((f) => `${ns}--${path.dirname(f)}`));
        }
      }
    }
  }
  if (plan.presetCommands) {
    for (const [ns, dirs] of plan.presetCommands) {
      for (const dir of dirs) {
        if (await exists(dir)) {
          const files = await fg("**/*.md", { cwd: dir });
          plannedCommands.push(...files.map((f) => path.join(ns, f)));
        }
      }
    }
  }
  if (plan.presetAgents) {
    for (const [ns, dirs] of plan.presetAgents) {
      for (const dir of dirs) {
        if (await exists(dir)) {
          const files = await fg("**/*.md", { cwd: dir });
          plannedAgents.push(...files.map((f) => path.join(ns, f)));
        }
      }
    }
  }

  const mcpServerNames = Object.keys(plan.mcpServers);

  // Native tools (readsAgentsDir=true) read .agents/ directly — no files
  // will be written to them, so show empty arrays in dry-run details.
  const nativeTools = new Set(
    plan.providers.filter((p) => p.readsAgentsDir).map((p) => p.name),
  );
  const details: SyncToolDetail[] = plan.tools.map((tool) => ({
    tool,
    skills: nativeTools.has(tool) ? [] : plannedSkills,
    commands: nativeTools.has(tool) ? [] : plannedCommands,
    agents: nativeTools.has(tool) ? [] : plannedAgents,
    mcp: mcpServerNames,
  }));

  if (!isJson) {
    console.log(
      pc.gray(
        `\n✓ Dry run complete - would sync ${plannedSkills.length} skills, ` +
          `${plannedCommands.length} commands, ${plannedAgents.length} agents, ` +
          `${mcpServerNames.length} MCP servers\n`,
      ),
    );
  } else {
    const data: SyncData = {
      tools: plan.tools,
      skills: plannedSkills.length,
      commands: plannedCommands.length,
      agents: plannedAgents.length,
      mcpServers: mcpServerNames.length,
      details,
    };
    const projected = projectFields(data, options.fields, SYNC_VALID_FIELDS);
    const output = cliResult("sync", projected, {
      warnings: plan.warnings.length > 0 ? plan.warnings : undefined,
    });
    console.log(jsonStringify(output, options.pretty));
  }
}

// ── No-Tools Path ─────────────────────────────────────────────

function emitNoTools(
  options: MainSyncOptions,
  warnings: string[],
  isJson: boolean | undefined,
): void {
  if (isJson) {
    const data: SyncData = {
      tools: [],
      skills: 0,
      commands: 0,
      agents: 0,
      mcpServers: 0,
      details: [],
    };
    const output = cliResult("sync", data, {
      warnings: warnings.length > 0 ? warnings : undefined,
    });
    console.log(jsonStringify(output, options.pretty));
  } else {
    console.log(pc.gray("\nNo tools configured. Nothing to sync.\n"));
  }
}

// ── JSON Error Helper ─────────────────────────────────────────

function emitJsonError(
  command: string,
  error: unknown,
  options: MainSyncOptions,
): void {
  const data: SyncData = {
    tools: [],
    skills: 0,
    commands: 0,
    agents: 0,
    mcpServers: 0,
    details: [],
  };
  const errObj: CliError = {
    code: error instanceof ConfigError ? "CONFIG_ERROR" : "SYNC_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
  const output = cliError(command, data, errObj);
  console.log(jsonStringify(output, options.pretty));
  process.exitCode = statusToExitCode("error", error);
}
