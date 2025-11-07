/**
 * Main Sync Command
 * Orchestrates syncing of presets (rules, commands, MCPs) from GitHub to tools
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import ora from "ora";
import picocolors from "picocolors";
import AuditLogger, { AuditEventType } from "../core/audit.js";
import { loadConfigHierarchy } from "../core/config/hierarchy.js";
import { ConfigError, ErrorCategory, ErrorSeverity } from "../core/errors.js";
import { getActiveMCPs } from "../core/mcp/config.js";
import { loadEnv } from "../core/mcp/env.js";
import { substituteAllMCPs, validateTokens } from "../core/mcp/tokens.js";
import { RegistryOrchestrator } from "../core/registry/registry-orchestrator.js";
import { runSecurityChecks } from "../security/checks/run.js";
import { getConvertersForTools } from "../targets/tools/index.js";
import type {
  CanonicalCommand,
  CanonicalRule,
  ToolName,
} from "../types/index.js";
import {
  generateCommandFrontmatter,
  generateRuleFrontmatter,
  parseFrontmatter,
  validateCommandFrontmatter,
  validateRuleFrontmatter,
} from "../utils/frontmatter.js";

const pc = picocolors;

/**
 * Load project-specific rules from .agentsync/rules/ in canonical format
 */
async function loadProjectRules(cwd: string): Promise<{
  rules: Map<string, CanonicalRule>;
  warnings: string[];
}> {
  const rulesDir = path.join(cwd, ".agentsync", "rules");

  const { pathExists } = await import("../utils/fs.js");
  if (!(await pathExists(rulesDir))) {
    return { rules: new Map(), warnings: [] };
  }

  const files = await fg("**/*.md", { cwd: rulesDir, absolute: false });
  const rules = new Map<string, CanonicalRule>();
  const warnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    const content = await readFile(filePath, "utf-8");

    // Parse into canonical format
    const { frontmatter, markdown } = parseFrontmatter(content);

    // Validate or auto-generate frontmatter
    if (validateRuleFrontmatter(frontmatter)) {
      rules.set(file, { frontmatter, markdown });
    } else {
      warnings.push(`${file}: Missing or invalid frontmatter, auto-generating`);
      const generatedFrontmatter = generateRuleFrontmatter(file);
      rules.set(file, { frontmatter: generatedFrontmatter, markdown });
    }
  }

  return { rules, warnings };
}

/**
 * Load project-specific commands from .agentsync/commands/ in canonical format
 */
async function loadProjectCommands(cwd: string): Promise<{
  commands: Map<string, CanonicalCommand>;
  warnings: string[];
}> {
  const commandsDir = path.join(cwd, ".agentsync", "commands");

  const { pathExists } = await import("../utils/fs.js");
  if (!(await pathExists(commandsDir))) {
    return { commands: new Map(), warnings: [] };
  }

  const files = await fg("**/*.md", { cwd: commandsDir, absolute: false });
  const commands = new Map<string, CanonicalCommand>();
  const warnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    const content = await readFile(filePath, "utf-8");

    // Parse into canonical format
    const { frontmatter, markdown } = parseFrontmatter(content);

    // Validate or auto-generate frontmatter
    if (validateCommandFrontmatter(frontmatter)) {
      commands.set(file, { frontmatter, markdown });
    } else {
      warnings.push(`${file}: Missing or invalid frontmatter, auto-generating`);
      const generatedFrontmatter = generateCommandFrontmatter(file);
      commands.set(file, { frontmatter: generatedFrontmatter, markdown });
    }
  }

  return { commands, warnings };
}

/**
 * Main sync command options (v0.3.0-beta)
 */
export interface MainSyncOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Pull latest presets from sources (re-clone repositories) */
  pull?: boolean;
  /** Dry run mode (preview without writing files) */
  dryRun?: boolean;
  /** Sync only to specific tool */
  tool?: string;
  /** Disable automatic tool directory detection (for debugging) */
  noToolDetection?: boolean;
}

/**
 * Main sync command
 * Loads config, resolves presets, merges content, syncs to tools
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates complex multi-step sync workflow
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
    // 1. Load and validate config hierarchy (global → project → local)
    const spinner = ora("Loading configuration...").start();

    // biome-ignore lint/suspicious/noImplicitAnyLet: configuration type is complex
    let config;
    try {
      config = await loadConfigHierarchy(cwd);

      // Log sources if present
      if (config._sources.global) {
        console.log(
          pc.gray(`  Using global config: ${config._sources.global}`),
        );
      }
    } catch (error) {
      spinner.fail("Failed to load configuration");
      throw error;
    }

    spinner.succeed("Configuration loaded");

    // Early security checks on AGENTS.md (non-intrusive; may block on high severity per config)
    await runSecurityChecks(cwd, config, process.env as Record<string, string>);

    // Check for AGENTS.md (optional supplement)
    const { pathExists } = await import("../utils/fs.js");
    const agentsMdPath = path.join(cwd, "AGENTS.md");
    if (!(await pathExists(agentsMdPath))) {
      console.log(
        pc.yellow("\n⚠ AGENTS.md not found.\n") +
          pc.gray("  Create with: ") +
          pc.cyan("agentsync init") +
          "\n" +
          pc.gray("  (Rules/commands/MCPs will still sync)\n"),
      );
    }

    // Determine which tools to sync to
    const targetTools: ToolName[] = options.tool
      ? [options.tool as ToolName]
      : config.tools || [];

    // Validate tool if specified
    if (options.tool) {
      const validTools: ToolName[] = ["cursor", "claude", "cline", "roocode"];
      if (!validTools.includes(options.tool as ToolName)) {
        throw new ConfigError(
          `Unknown tool: ${options.tool}`,
          "",
          `Valid tools: ${validTools.join(", ")}`,
        );
      }
    }

    // Auto-update .gitignore if it has AgentSync section
    const gitignorePath = path.join(cwd, ".gitignore");
    if (await pathExists(gitignorePath)) {
      try {
        const gitignoreContent = await readFile(gitignorePath, "utf-8");
        const { hasAgentSyncSection, updateAgentSyncSection } = await import(
          "../utils/gitignore.js"
        );

        if (hasAgentSyncSection(gitignoreContent)) {
          const updated = updateAgentSyncSection(gitignoreContent, targetTools);
          if (updated !== gitignoreContent) {
            const { outputFile } = await import("../utils/fs.js");
            await outputFile(gitignorePath, updated);
            console.log(pc.gray("  ℹ Updated .gitignore for current tools\n"));
          }
        }
      } catch {
        // Ignore errors in .gitignore update
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
    // biome-ignore lint/suspicious/noImplicitAnyLet: spinner type from ora library
    let presetSpinner;

    if (config.extends && config.extends.length > 0) {
      presetSpinner = ora("Loading GitHub libraries...").start();
    }

    // biome-ignore lint/suspicious/noImplicitAnyLet: merged preset type is complex
    let merged;
    try {
      // Check if any extends entries have selection criteria
      const hasSelections = config.extends?.some(
        (entry) =>
          typeof entry !== "string" && (entry.include || entry.exclude),
      );

      if (hasSelections) {
        // Use selective loading when selections are present in config
        merged = await orchestrator.loadAndMergeSelective(
          cwd,
          {},
          {
            pull: options.pull,
            noToolDetection: options.noToolDetection,
          },
        );

        if (presetSpinner) {
          const selectionCount =
            config.extends?.filter(
              (entry) =>
                typeof entry !== "string" && (entry.include || entry.exclude),
            ).length || 0;
          presetSpinner.succeed(
            `Loaded ${config.extends?.length || 0} ${config.extends?.length === 1 ? "library" : "libraries"} with ${selectionCount} filter${selectionCount === 1 ? "" : "s"}`,
          );
        }
      } else {
        // Use regular loading for backward compatibility
        merged = await orchestrator.loadAndMerge(cwd, {
          pull: options.pull,
          noToolDetection: options.noToolDetection,
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

    // 2.5. Load and merge project custom rules/commands
    const { rules: projectRules, warnings: rulesWarnings } =
      await loadProjectRules(cwd);
    const { commands: projectCommands, warnings: commandsWarnings } =
      await loadProjectCommands(cwd);

    // Display frontmatter validation warnings
    if (rulesWarnings.length > 0) {
      console.log(pc.yellow("\n⚠ Rule file warnings:"));
      for (const warning of rulesWarnings) {
        console.log(pc.gray(`  ${warning}`));
      }
      console.log();
    }
    if (commandsWarnings.length > 0) {
      console.log(pc.yellow("\n⚠ Command file warnings:"));
      for (const warning of commandsWarnings) {
        console.log(pc.gray(`  ${warning}`));
      }
      console.log();
    }

    // Merge: project custom overrides presets
    // Presets come namespaced (company_typescript.md), project custom do not (test.md)
    const finalRules = new Map([...merged.rules, ...projectRules]);
    const finalCommands = new Map([...merged.commands, ...projectCommands]);

    // Update display
    if (finalRules.size > 0 || finalCommands.size > 0) {
      console.log(
        pc.gray(`  Rules: ${finalRules.size}`) +
          (projectRules.size > 0
            ? pc.cyan(` (${projectRules.size} custom)`)
            : ""),
      );
      console.log(
        pc.gray(`  Commands: ${finalCommands.size}`) +
          (projectCommands.size > 0
            ? pc.cyan(` (${projectCommands.size} custom)`)
            : ""),
      );
      console.log();
    }

    // 3-5. Sync via unified per-tool converters
    const converters = getConvertersForTools(targetTools);

    // Data is already in canonical format, sync directly
    // Rules
    if (!options.dryRun && converters.length > 0 && finalRules.size > 0) {
      const rulesSpinner = ora("Syncing rules...").start();
      try {
        for (const conv of converters) {
          await conv.syncRules(finalRules, cwd);
        }
        rulesSpinner.succeed(`Synced ${finalRules.size} rules`);
      } catch (error) {
        rulesSpinner.fail("Failed to sync rules");
        throw error;
      }
    } else if (options.dryRun && finalRules.size > 0) {
      console.log(pc.gray(`Would sync ${finalRules.size} rules`));
    }

    // Commands
    if (!options.dryRun && converters.length > 0 && finalCommands.size > 0) {
      const commandsSpinner = ora("Syncing commands...").start();
      try {
        for (const conv of converters) {
          await conv.syncCommands(finalCommands, cwd);
        }
        commandsSpinner.succeed(`Synced ${finalCommands.size} commands`);
      } catch (error) {
        commandsSpinner.fail("Failed to sync commands");
        throw error;
      }
    } else if (options.dryRun && finalCommands.size > 0) {
      console.log(pc.gray(`Would sync ${finalCommands.size} commands`));
    }

    // AGENTS.md symlinks (minimal intervention)
    if (!options.dryRun && converters.length > 0) {
      for (const conv of converters) {
        try {
          await conv.syncAgentsMd(cwd);
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
    const localMcpPath = path.join(cwd, "agentsync.local.json");

    let hasLocalMcpConfig = false;
    try {
      const content = await readFile(localMcpPath, "utf-8");
      const localConfig = JSON.parse(content);
      if (localConfig.mcpServers) {
        if (Array.isArray(localConfig.mcpServers)) {
          hasLocalMcpConfig = localConfig.mcpServers.length > 0;
        } else {
          hasLocalMcpConfig = Object.keys(localConfig.mcpServers).length > 0;
        }
      }
    } catch {
      // File doesn't exist or invalid
    }

    if (
      !options.dryRun &&
      (hasMcpServers || hasLocalMcpConfig) &&
      targetTools.length > 0
    ) {
      const mcpSpinner = ora("Syncing MCP servers...").start();
      try {
        // Use already-merged config from hierarchy (fixes bug)
        // Determine active servers based on enabled/disabled logic
        const registry = config.mcpServers || {};
        const activeMCPs = getActiveMCPs(
          registry,
          config.mcpEnabled,
          config.mcpDisabled,
        ) as Record<string, import("../core/mcp/tokens.js").MCP>;

        // Load env and substitute tokens
        const env = await loadEnv();
        const substituted = substituteAllMCPs(activeMCPs, env);
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
        rulesCount: finalRules.size,
        commandsCount: finalCommands.size,
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
