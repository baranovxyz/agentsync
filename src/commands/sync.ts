/**
 * Main Sync Command
 * Orchestrates syncing of presets (rules, commands, MCPs) from GitHub to tools
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import ora from "ora";
import picocolors from "picocolors";
import AuditLogger, { AuditEventType } from "../core/audit.js";
import { ConfigError, ErrorCategory, ErrorSeverity } from "../core/errors.js";
import { RegistryOrchestrator } from "../core/registry/registry-orchestrator.js";
import { getConvertersForTools } from "../targets/tools/index.js";
import type { ToolName } from "../types/index.js";
import { validateConfig } from "../types/schemas.js";
import { runSecurityChecks } from "../security/checks/run.js";
import {
  filterSelectedMCPs,
  loadProjectConfig as loadProjectMcpConfig,
} from "../core/mcp/config.js";
import { loadEnv } from "../core/mcp/env.js";
import { loadGlobalRegistry } from "../core/mcp/registry.js";
import { substituteAllMCPs, validateTokens } from "../core/mcp/tokens.js";

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
  /** Selective loading options for presets */
  selections?: Record<string, import("../types/index.js").SelectionConfig>;
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
    } catch (_error) {
      spinner.fail("Configuration not found");
      throw new ConfigError(
        "AgentSync configuration not found",
        configPath,
        'Run "agentsync init" to initialize AgentSync in this project',
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
        `Check ${configPath} for syntax errors`,
      );
    }

    spinner.succeed("Configuration loaded");

    // Early security checks on AGENTS.md (non-intrusive; may block on high severity per config)
    await runSecurityChecks(cwd, config, process.env as Record<string, string>);

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
        "roocode",
      ];
      if (!validTools.includes(options.tool as ToolName)) {
        throw new ConfigError(
          `Unknown tool: ${options.tool}`,
          "",
          `Valid tools: ${validTools.join(", ")}`,
        );
      }
    }

    // Show what we'll do
    if (options.dryRun) {
      console.log(pc.yellow("\n📋 Dry run mode - no files will be written\n"));
    }

    console.log(
      pc.gray("Tools to sync: ") +
        (targetTools.length > 0 ? targetTools.join(", ") : pc.gray("(none)")),
    );
    console.log(pc.gray("Libraries: ") + pc.gray(config.extends?.length || 0));
    console.log(
      pc.gray("MCP servers: ") +
        pc.gray(
          Array.isArray(config.mcpServers)
            ? config.mcpServers.length
            : Object.keys(config.mcpServers || {}).length,
        ),
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
      // Check if any extends entries have selection criteria
      const hasSelections = config.extends?.some(
        (entry) =>
          typeof entry !== "string" && (entry.include || entry.exclude),
      );

      if (
        hasSelections ||
        (options.selections && Object.keys(options.selections).length > 0)
      ) {
        // Use selective loading when selections are present in config or options
        if (options.selections && Object.keys(options.selections).length > 0) {
          // Validate selections first
          const validation = await orchestrator.validateSelections(
            cwd,
            options.selections,
            {
              update: options.update,
            },
          );

          if (!validation.valid) {
            if (presetSpinner) {
              presetSpinner.fail("Invalid selections");
            }
            throw new Error(
              `Invalid selections:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`,
            );
          }
        }

        merged = await orchestrator.loadAndMergeSelective(
          cwd,
          options.selections || {},
          {
            update: options.update,
          },
        );

        if (presetSpinner) {
          const selectionCount =
            config.extends?.filter(
              (entry) =>
                typeof entry !== "string" &&
                (entry.include || entry.exclude),
            ).length || 0;
          presetSpinner.succeed(
            `Loaded ${config.extends?.length || 0} ${config.extends?.length === 1 ? "library" : "libraries"} with ${selectionCount} filter${selectionCount === 1 ? "" : "s"}`,
          );
        }
      } else {
        // Use regular loading for backward compatibility
        merged = await orchestrator.loadAndMerge(cwd, {
          update: options.update,
        });

        if (presetSpinner) {
          presetSpinner.succeed(
            `Loaded ${config.extends?.length || 0} ${config.extends?.length === 1 ? "library" : "libraries"}`,
          );
        }
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

    // 3-5. Sync via unified per-tool converters
    const converters = getConvertersForTools(targetTools);

    // Rules
    if (!options.dryRun && converters.length > 0 && merged.rules.size > 0) {
      const rulesSpinner = ora("Syncing rules...").start();
      try {
        for (const conv of converters) {
          await conv.syncRules(merged.rules, cwd);
        }
        rulesSpinner.succeed(`Synced ${merged.rules.size} rules`);
      } catch (error) {
        rulesSpinner.fail("Failed to sync rules");
        throw error;
      }
    } else if (options.dryRun && merged.rules.size > 0) {
      console.log(pc.gray(`Would sync ${merged.rules.size} rules`));
    }

    // Commands
    if (!options.dryRun && converters.length > 0 && merged.commands.size > 0) {
      const commandsSpinner = ora("Syncing commands...").start();
      try {
        for (const conv of converters) {
          await conv.syncCommands(merged.commands, cwd);
        }
        commandsSpinner.succeed(`Synced ${merged.commands.size} commands`);
      } catch (error) {
        commandsSpinner.fail("Failed to sync commands");
        throw error;
      }
    } else if (options.dryRun && merged.commands.size > 0) {
      console.log(pc.gray(`Would sync ${merged.commands.size} commands`));
    }

    // AGENTS.md symlinks (minimal intervention)
    if (!options.dryRun && converters.length > 0) {
      for (const conv of converters) {
        try {
          await conv.syncAgents(cwd);
        } catch (error) {
          console.log(
            pc.yellow(
              `  ⚠ Could not create AGENTS.md symlink for ${conv.name}: ${(error as Error).message}`,
            ),
          );
        }
      }
    }

    // 6. Sync MCPs to tools (only if MCP config exists with non-empty servers)
    // Check if we have actual MCP servers to sync
    let hasMcpServers = false;
    if (config.mcpServers) {
      if (Array.isArray(config.mcpServers)) {
        hasMcpServers = config.mcpServers.length > 0;
      } else {
        hasMcpServers = Object.keys(config.mcpServers).length > 0;
      }
    }

    // Also check for local MCP config file (personal overrides)
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
        // Load, filter, substitute, validate
        const globalRegistry = await loadGlobalRegistry();
        const projectConfig = await loadProjectMcpConfig();
        const selectedMCPs = filterSelectedMCPs(globalRegistry, projectConfig);
        const env = await loadEnv();
        const substituted = substituteAllMCPs(selectedMCPs, env);
        validateTokens(substituted);

        // Sync via converters
        for (const conv of converters) {
          await conv.syncMCP(substituted, cwd);
        }
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
      { command: "sync", options },
    );

    throw error;
  }
}
