/**
 * Main Sync Command
 * Thin orchestrator: builds a plan, executes it, formats output.
 */

import ora from "ora";
import picocolors from "picocolors";
import { AgentSyncError, ExitCode, statusToExitCode } from "../core/errors.js";
import {
  executeSyncPlan,
  previewSharedOutputLifecycle,
  type SyncResult,
} from "../sync/execute.js";
import {
  extensionWarnings,
  loadCanonicalRules,
  previewAgents,
  previewCommands,
  previewDocs,
  previewExtensions,
  previewManagedMCP,
  previewRules,
  previewSkills,
} from "../sync/index.js";
import {
  discoverProviderStateOwners,
  manifestOwnedToolNames,
  readManifest,
} from "../sync/manifest.js";
import { buildSyncPlan, type SyncPlanOptions } from "../sync/plan.js";
import { planToolStructuredLifecycle } from "../sync/structured-providers.js";
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
  "rules",
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
      const profileName = options.profile ?? process.env.AGENTSYNC_PROFILE;
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

    const previousManifest = await readManifest(cwd);
    const discoveredStateOwners =
      options.tool === undefined ? await discoverProviderStateOwners(cwd) : [];
    const hasPriorLifecycle =
      options.tool === undefined &&
      (manifestOwnedToolNames(previousManifest).length > 0 ||
        discoveredStateOwners.length > 0);
    if (hasPriorLifecycle && plan.providers.length === 0) {
      plan.warnings = plan.warnings.filter(
        (warning) => !warning.startsWith("No tools configured --"),
      );
    }

    // 2. Execute, dry-run, or no-tools
    if (!options.dryRun && (plan.providers.length > 0 || hasPriorLifecycle)) {
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
    result = await executeSyncPlan(plan, {
      link: options.link,
      cwd,
      filtered: options.tool !== undefined,
    });
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
    if (result.totalRules > 0) {
      console.log(pc.green(`  ✔ Synced ${result.totalRules} rules`));
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
      rules: result.totalRules,
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
  }
  if (plan.presetErrors.length > 0) {
    process.exitCode = statusToExitCode("partial");
  }
}

// ── Dry-Run Path ─────────────────────────────────────────────

type ResolvedSyncPlan = Awaited<ReturnType<typeof buildSyncPlan>>;

interface DryRunProjection {
  details: SyncToolDetail[];
  mcpServerNames: string[];
  totals: { skills: number; commands: number; agents: number; rules: number };
  warnings: string[];
  hasPriorLifecycle: boolean;
}

async function previewSyncPlan(
  plan: ResolvedSyncPlan,
  cwd: string,
  mode: "copy" | "link",
  filtered: boolean,
): Promise<DryRunProjection> {
  const previousManifest = await readManifest(cwd);
  const discoveredStateOwners = filtered
    ? await discoverProviderStateOwners(cwd, plan.tools)
    : await discoverProviderStateOwners(cwd);
  const { rules: canonicalRules } = await loadCanonicalRules(cwd);
  const structuredLifecycle = await planToolStructuredLifecycle({
    cwd,
    providers: plan.providers,
    previousReceipts: previousManifest?.structured_owners,
    desired: { extensions: plan.extensions, rules: canonicalRules },
    preserveUnselected: filtered,
  });
  const [
    skills,
    commands,
    agents,
    rules,
    extensions,
    mcp,
    sharedLifecycleWarnings,
  ] = await Promise.all([
    previewSkills(plan.providers, cwd, plan.presetSkills, {
      mode,
      globalDirs: plan.hierarchySkillDirs,
    }),
    previewCommands(plan.providers, cwd, plan.presetCommands, {
      mode,
      globalDirs: plan.hierarchyCommandDirs,
    }),
    previewAgents(plan.providers, cwd, plan.presetAgents, {
      mode,
      globalDirs: plan.hierarchyAgentDirs,
    }),
    previewRules(plan.providers, cwd),
    previewExtensions(plan.providers, plan.extensions, cwd, {
      protectedDependencies: structuredLifecycle.protectedDependencies,
    }),
    previewManagedMCP(plan.providers, plan.mcpServers, cwd, {
      previousOwners: previousManifest?.mcp_owners,
      filtered,
    }),
    previewSharedOutputLifecycle(
      plan,
      cwd,
      previousManifest,
      filtered,
      structuredLifecycle.protectedDependencies,
    ),
    previewDocs(plan.providers, cwd),
  ]);
  const byTool = {
    skills: new Map(skills.map((result) => [result.tool, result.skills])),
    commands: new Map(commands.map((result) => [result.tool, result.commands])),
    agents: new Map(agents.map((result) => [result.tool, result.agents])),
    rules: new Map(rules.map((result) => [result.tool, result.rules])),
  };
  const mcpServerNames = Object.keys(plan.mcpServers);
  const mcpByTool = new Map(
    mcp.results.map((result) => [result.tool, result.servers]),
  );
  const details: SyncToolDetail[] = plan.providers.map((provider) => ({
    tool: provider.name,
    skills: byTool.skills.get(provider.name) ?? [],
    commands: byTool.commands.get(provider.name) ?? [],
    agents: byTool.agents.get(provider.name) ?? [],
    rules: byTool.rules.get(provider.name) ?? [],
    mcp: mcpByTool.get(provider.name) ?? [],
  }));
  const warnings = [
    ...skills.flatMap((result) => result.warnings),
    ...commands.flatMap((result) => result.warnings),
    ...agents.flatMap((result) => result.warnings),
    ...rules.flatMap((result) => result.warnings),
    ...extensionWarnings(extensions),
    ...mcp.warnings,
    ...structuredLifecycle.warnings,
    ...sharedLifecycleWarnings,
  ];
  const totals = details.reduce(
    (total, detail) => ({
      skills: total.skills + detail.skills.length,
      commands: total.commands + detail.commands.length,
      agents: total.agents + detail.agents.length,
      rules: total.rules + detail.rules.length,
    }),
    { skills: 0, commands: 0, agents: 0, rules: 0 },
  );
  return {
    details,
    mcpServerNames: plan.providers.some((provider) => provider.mcpFormat)
      ? mcpServerNames
      : [],
    totals,
    warnings,
    hasPriorLifecycle:
      manifestOwnedToolNames(previousManifest).length > 0 ||
      discoveredStateOwners.length > 0,
  };
}

function emitHumanDryRun(projection: DryRunProjection): void {
  if (projection.warnings.length > 0) {
    console.log(
      pc.yellow(
        `\n⚠ ${projection.warnings.length} warning${projection.warnings.length === 1 ? "" : "s"} during dry run:`,
      ),
    );
    for (const warning of projection.warnings) {
      console.log(pc.yellow(`  - ${warning}`));
    }
    console.log();
  }
  const { totals } = projection;
  console.log(
    pc.gray(
      `\n✓ Dry run complete - would sync ${totals.skills} skills, ` +
        `${totals.commands} commands, ${totals.agents} agents, ` +
        `${totals.rules} rules, ${projection.mcpServerNames.length} MCP servers\n`,
    ),
  );
}

function emitJsonDryRun(
  plan: ResolvedSyncPlan,
  options: MainSyncOptions,
  projection: DryRunProjection,
): void {
  const data: SyncData = {
    tools: plan.tools,
    skills: projection.totals.skills,
    commands: projection.totals.commands,
    agents: projection.totals.agents,
    rules: projection.totals.rules,
    mcpServers: projection.mcpServerNames.length,
    details: projection.details,
  };
  const projected = projectFields(data, options.fields, SYNC_VALID_FIELDS);
  const noToolsResolved =
    plan.tools.length === 0 && !projection.hasPriorLifecycle;
  const status = noToolsResolved
    ? ("error" as const)
    : plan.presetErrors.length > 0
      ? ("partial" as const)
      : ("success" as const);
  const warnings = [...plan.warnings, ...projection.warnings];
  const output = cliResult("sync", projected, {
    status,
    errors: plan.presetErrors.length > 0 ? plan.presetErrors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
  console.log(jsonStringify(output, options.pretty));
}

async function dryRunDisplay(
  plan: ResolvedSyncPlan,
  options: MainSyncOptions,
  cwd: string,
  isJson: boolean | undefined,
): Promise<void> {
  const projection = await previewSyncPlan(
    plan,
    cwd,
    options.link ? "link" : "copy",
    options.tool !== undefined,
  );
  const noToolsResolved =
    plan.tools.length === 0 && !projection.hasPriorLifecycle;
  if (noToolsResolved) {
    process.exitCode = ExitCode.USER_ERROR;
  } else if (plan.presetErrors.length > 0) {
    process.exitCode = statusToExitCode("partial");
  }
  if (isJson) emitJsonDryRun(plan, options, projection);
  else emitHumanDryRun(projection);
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
      rules: 0,
      mcpServers: 0,
      details: [],
    };
    const output = cliResult("sync", data, {
      status: "error",
      warnings: warnings.length > 0 ? warnings : undefined,
    });
    console.log(jsonStringify(output, options.pretty));
  } else {
    console.log(pc.gray("\nNo tools configured. Nothing to sync.\n"));
  }
  process.exitCode = ExitCode.USER_ERROR;
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
    rules: 0,
    mcpServers: 0,
    details: [],
  };
  const typedError = error instanceof AgentSyncError ? error : undefined;
  const errObj: CliError = {
    code: typedError?.code ?? "SYNC_ERROR",
    message: error instanceof Error ? error.message : String(error),
    suggestion: typedError?.suggestion,
    context: typedError?.context,
  };
  const output = cliError(command, data, errObj);
  console.log(jsonStringify(output, options.pretty));
  process.exitCode = statusToExitCode("error", error);
}
