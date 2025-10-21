/**
 * Main Sync Command
 * Orchestrates syncing of presets (rules, commands, MCPs) from GitHub to tools
 */

import { RegistryOrchestrator } from "../core/registry/registry-orchestrator.js";
import { RulesSyncTarget } from "../targets/rules-sync-target.js";
import { CommandsSyncTarget } from "../targets/commands-sync-target.js";
import { syncMCP } from "./mcp/sync.js";
import { validateConfig } from "../types/schemas.js";
import { readFile } from "node:fs/promises";
import * as path from "path";
import picocolors from "picocolors";
import ora from "ora";
import AuditLogger, { AuditEventType } from "../core/audit.js";
import { ConfigError, ErrorCategory, ErrorSeverity } from "../core/errors.js";
import type { ToolName } from "../types/index.js";

const pc = picocolors;

/**
 * Main sync command options (v0.3.0-beta)
 */
export interface MainSyncOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Update GitHub caches (re-clone repositories) */
  update?: boolean;
  /** Dry run mode (preview without writing files) */
  dryRun?: boolean;
  /** Sync only to specific tool */
  tool?: string;
}

/**
 * Main sync command
 * Loads config, resolves presets, merges content, syncs to tools
 */
export async function sync(options: MainSyncOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const audit = AuditLogger.getInstance();

  // Log sync start
  await audit.log({
    type: AuditEventType.SYNC_START,
    severity: "info",
    category: "sync",
    message: "Starting sync workflow",
    metadata: { options } as Record<string, unknown>,
  });

  try {
    // 1. Load and validate config
    const spinner = ora("Loading configuration...").start();
    const configPath = path.join(cwd, ".agentsync", "config.json");

    let configContent: string;
    try {
      configContent = await readFile(configPath, "utf-8");
    } catch (error) {
      spinner.fail("Configuration not found");
      throw new ConfigError(
        "AgentSync configuration not found",
        configPath,
        'Run "agentsync init" to initialize AgentSync in this project'
      );
    }

    let config;
    try {
      config = validateConfig(JSON.parse(configContent));
    } catch (error) {
      spinner.fail("Invalid configuration");
      throw new ConfigError(
        `Invalid AgentSync configuration: ${(error as Error).message}`,
        configPath,
        `Check ${configPath} for syntax errors`
      );
    }

    spinner.succeed("Configuration loaded");

    // Determine which tools to sync to
    const targetTools: ToolName[] = options.tool
      ? [options.tool as ToolName]
      : config.tools || [];

    // Validate tool if specified
    if (options.tool) {
      const validTools: ToolName[] = [
        "cursor",
        "claude",
        "cline",
        "windsurf",
        "copilot",
      ];
      if (!validTools.includes(options.tool as ToolName)) {
        throw new ConfigError(
          `Unknown tool: ${options.tool}`,
          "",
          `Valid tools: ${validTools.join(", ")}`
        );
      }
    }

    // Show what we'll do
    if (options.dryRun) {
      console.log(pc.yellow("\n📋 Dry run mode - no files will be written\n"));
    }

    console.log(
      pc.gray("Tools to sync: ") +
        (targetTools.length > 0 ? targetTools.join(", ") : pc.gray("(none)"))
    );
    console.log(pc.gray("Libraries: ") + pc.gray(config.extends?.length || 0));
    console.log(
      pc.gray("MCP servers: ") +
        pc.gray(
          Array.isArray(config.mcpServers)
            ? config.mcpServers.length
            : Object.keys(config.mcpServers || {}).length
        )
    );
    console.log();

    // 2. Load and merge GitHub presets (if any)
    const orchestrator = new RegistryOrchestrator();
    let presetSpinner;

    if (config.extends && config.extends.length > 0) {
      presetSpinner = ora("Loading GitHub libraries...").start();
    }

    let merged;
    try {
      merged = await orchestrator.loadAndMerge(cwd, {
        update: options.update,
      });

      if (presetSpinner) {
        presetSpinner.succeed(
          `Loaded ${config.extends?.length || 0} ${config.extends?.length === 1 ? "library" : "libraries"}`
        );
      }
    } catch (error) {
      if (presetSpinner) {
        presetSpinner.fail("Failed to load libraries");
      }
      throw error;
    }

    // Show what we found
    if (merged.rules.size > 0 || merged.commands.size > 0) {
      console.log(pc.gray(`  Rules: ${merged.rules.size}`));
      console.log(pc.gray(`  Commands: ${merged.commands.size}`));
      console.log();
    }

    // 3. Sync rules to tools
    if (!options.dryRun && targetTools.length > 0 && merged.rules.size > 0) {
      const rulesSpinner = ora("Syncing rules...").start();
      try {
        const rulesSyncTarget = new RulesSyncTarget();
        await rulesSyncTarget.sync(merged.rules, targetTools, cwd);
        rulesSpinner.succeed(`Synced ${merged.rules.size} rules`);
      } catch (error) {
        rulesSpinner.fail("Failed to sync rules");
        throw error;
      }
    } else if (options.dryRun && merged.rules.size > 0) {
      console.log(pc.gray(`Would sync ${merged.rules.size} rules`));
    }

    // 4. Sync commands to tools
    if (!options.dryRun && targetTools.length > 0 && merged.commands.size > 0) {
      const commandsSpinner = ora("Syncing commands...").start();
      try {
        const commandsSyncTarget = new CommandsSyncTarget();
        await commandsSyncTarget.sync(merged.commands, targetTools, cwd);
        commandsSpinner.succeed(`Synced ${merged.commands.size} commands`);
      } catch (error) {
        commandsSpinner.fail("Failed to sync commands");
        throw error;
      }
    } else if (options.dryRun && merged.commands.size > 0) {
      console.log(pc.gray(`Would sync ${merged.commands.size} commands`));
    }

    // 5. Sync MCPs to tools (only if MCP config exists with non-empty servers)
    // Check if we have actual MCP servers to sync
    let hasMcpServers = false;
    if (config.mcpServers) {
      if (Array.isArray(config.mcpServers)) {
        hasMcpServers = config.mcpServers.length > 0;
      } else {
        hasMcpServers = Object.keys(config.mcpServers).length > 0;
      }
    }

    // Also check for personal override files (agentsync.local.json or .agentsync/config.local.json)
    const localMcpPaths = [
      path.join(cwd, "agentsync.local.json"), // Personal overrides
      path.join(cwd, ".agentsync", "config.local.json"), // Backup location
    ];

    let hasLocalMcpConfig = false;
    for (const mcpPath of localMcpPaths) {
      try {
        const content = await readFile(mcpPath, "utf-8");
        const localConfig = JSON.parse(content);
        if (localConfig.mcpServers) {
          if (Array.isArray(localConfig.mcpServers)) {
            hasLocalMcpConfig = localConfig.mcpServers.length > 0;
          } else {
            hasLocalMcpConfig = Object.keys(localConfig.mcpServers).length > 0;
          }
          if (hasLocalMcpConfig) break;
        }
      } catch {
        // File doesn't exist or invalid, try next
      }
    }

    if (
      !options.dryRun &&
      (hasMcpServers || hasLocalMcpConfig) &&
      targetTools.length > 0
    ) {
      const mcpSpinner = ora("Syncing MCP servers...").start();
      try {
        await syncMCP({
          tool: options.tool,
          dryRun: false,
        });
        mcpSpinner.succeed("Synced MCP servers");
      } catch (error) {
        mcpSpinner.fail("Failed to sync MCPs");
        throw error;
      }
    } else if (options.dryRun && hasMcpServers) {
      const mcpCount = Array.isArray(config.mcpServers)
        ? config.mcpServers.length
        : Object.keys(config.mcpServers || {}).length;
      console.log(pc.gray(`Would sync ${mcpCount} MCP servers`));
    }

    // Success!
    if (!options.dryRun) {
      console.log(pc.green("\n✅ Sync complete!\n"));
    } else {
      console.log(pc.gray("\n✓ Dry run complete - no files were written\n"));
    }

    // Log success
    await audit.log({
      type: AuditEventType.SYNC_SUCCESS,
      severity: "info",
      category: "sync",
      message: "Sync workflow completed successfully",
      metadata: {
        ...options,
        rulesCount: merged.rules.size,
        commandsCount: merged.commands.size,
        tools: targetTools,
      },
    });
  } catch (error) {
    // Log error
    await audit.logError(
      error as Error,
      ErrorCategory.SYNC,
      ErrorSeverity.HIGH,
      { command: "sync", options }
    );

    throw error;
  }
}
