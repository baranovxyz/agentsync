/**
 * Interactive Preset Selection Command
 * Allows users to interactively select presets and configure file-level selections
 */

import { select, checkbox, input, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";
import { RegistryOrchestrator } from "../../core/registry/registry-orchestrator.js";
import { UserPresetRegistry } from "../../core/registry/user-preset-registry.js";
import { SourceResolver } from "../../core/registry/source-resolver.js";
import { ConfigMerger } from "../../core/config/interactive-selection-merger.js";
import { validateConfig } from "../../types/schemas.js";
import type { SelectionConfig } from "../../types/index.js";
import {
  InteractiveSelectionError,
  SelectionValidationError,
  SourceResolutionError,
  ConfigError,
  ErrorHandler,
  ErrorSeverity,
  ErrorCategory,
} from "../../core/errors.js";
import { Separator } from "@inquirer/prompts";

/**
 * Options for interactive preset selection
 */
export interface InteractiveSelectOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
}

/**
 * Main interactive preset selection command
 */
export async function interactiveSelectPreset(
  options: InteractiveSelectOptions = {}
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Check if running in interactive environment
  if (!process.stdin.isTTY) {
    throw new InteractiveSelectionError(
      "Interactive preset selection requires a terminal",
      ErrorSeverity.HIGH,
      { environment: "non-interactive" }
    );
  }

  console.log(pc.blue("🎯 Interactive Preset Selection\n"));

  try {
    // 1. Load current configuration
    const config = await loadConfig(cwd);

    // 2. Get available preset sources
    const presetSources = await getAvailablePresetSources(config);

    if (presetSources.length === 0) {
      console.log(pc.yellow("No presets available."));
      console.log(
        pc.gray("Add presets to your configuration or user registry first.")
      );
      return;
    }

    // 3. Let user select a preset source
    const presetSource = await selectPresetSource(presetSources);

    // 4. Load preset content
    const spinner = ora("Loading preset content...").start();
    const presetContent = await loadPresetContent(presetSource);
    spinner.succeed("Preset loaded");

    // 5. Let user select content types
    const selectedTypes = await selectContentTypes(presetContent);

    if (selectedTypes.length === 0) {
      console.log(pc.yellow("No content types selected."));
      return;
    }

    // 6. Configure file patterns for each selected type
    const selection = await configureFilePatterns(selectedTypes, presetContent);

    // 7. Validate selection
    await validateSelection(cwd, presetSource, selection);

    // 8. Show preview
    await showPreview(presetContent, selection);

    // 9. Confirm and save
    const shouldSave =
      options.yes ||
      (await confirm({
        message: "Save this selection to configuration?",
        default: true,
      }));

    if (!shouldSave) {
      console.log(pc.gray("Selection cancelled."));
      return;
    }

    // 10. Save to configuration
    await saveSelection(cwd, presetSource, selection);

    console.log(pc.green("✅ Selection saved successfully!"));
    console.log(pc.gray("Run 'agentsync sync' to apply the selection."));
  } catch (error) {
    const wrappedError = ErrorHandler.wrap(
      error,
      "Interactive preset selection failed",
      ErrorCategory.CONFIG,
      { cwd, options }
    );

    console.error(pc.red(`❌ ${wrappedError.getUserMessage()}`));
    throw wrappedError;
  }
}

/**
 * Load current configuration
 */
async function loadConfig(cwd: string): Promise<any> {
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    return validateConfig(JSON.parse(configContent));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        `Configuration file contains invalid JSON: ${error.message}`,
        configPath,
        "Check the syntax of your configuration file and ensure it's valid JSON"
      );
    }

    if ((error as any).code === "ENOENT") {
      throw new ConfigError(
        "Configuration file not found",
        configPath,
        "Run 'agentsync init' to create a configuration file"
      );
    }

    if ((error as any).code === "EACCES") {
      throw new ConfigError(
        "Permission denied accessing configuration file",
        configPath,
        "Check file permissions and try running with appropriate access rights"
      );
    }

    throw ErrorHandler.wrap(
      error,
      "Failed to load configuration",
      ErrorCategory.CONFIG,
      { configPath }
    );
  }
}

/**
 * Get available preset sources from config and user registry
 */
async function getAvailablePresetSources(
  config: any
): Promise<Array<{ name: string; value: string; description?: string }>> {
  const sources: Array<{ name: string; value: string; description?: string }> =
    [];

  // Add GitHub sources from config
  if (config.extends && Array.isArray(config.extends)) {
    for (const source of config.extends) {
      const sourceStr = typeof source === "string" ? source : source.source;
      sources.push({
        name: sourceStr,
        value: sourceStr,
        description: "From .agentsync/config.json",
      });
    }
  }

  // Add user-registered presets
  try {
    const userRegistry = new UserPresetRegistry();
    const userPresets = await userRegistry.list();
    for (const [name, preset] of Object.entries(userPresets)) {
      // Avoid duplicates
      if (!sources.some((s) => s.value === preset.source)) {
        sources.push({
          name: `${name} (user)`,
          value: preset.source,
          description: preset.description || `User-registered preset`,
        });
      }
    }
  } catch (error) {
    // Silently ignore if user registry fails to load
  }

  return sources;
}

/**
 * Let user select a preset source
 */
async function selectPresetSource(
  sources: Array<{ name: string; value: string; description?: string }>
): Promise<string> {
  const addNew = { name: "Add new GitHub source...", value: "add_new" };

  return select({
    message: "Select a preset to configure:",
    choices: [
      ...sources.map((source) => ({
        name: source.name,
        value: source.value,
        description: source.description,
      })),
      new Separator(),
      addNew,
    ],
  });
}

/**
 * Load preset content
 */
async function loadPresetContent(presetSource: string): Promise<any> {
  const orchestrator = new RegistryOrchestrator();
  const sourceResolver = new SourceResolver();

  try {
    const resolved = await sourceResolver.resolve(presetSource, {
      update: true,
    });
    const preset = await orchestrator.loadAndMerge(resolved);
    return preset;
  } catch (error) {
    throw new SourceResolutionError(
      `Failed to load preset content from ${presetSource}: ${
        (error as Error).message
      }`,
      presetSource
    );
  }
}

/**
 * Let user select content types to configure
 */
async function selectContentTypes(presetContent: any): Promise<string[]> {
  const choices = [];
  if (presetContent.rules.size > 0)
    choices.push({ name: "Rules", value: "rules" });
  if (presetContent.commands.size > 0)
    choices.push({ name: "Commands", value: "commands" });
  if (Object.keys(presetContent.mcps).length > 0)
    choices.push({ name: "MCPs", value: "mcps" });

  if (choices.length === 0) {
    console.log(pc.yellow("Preset has no configurable content."));
    return [];
  }

  return checkbox({
    message: "Select content types to configure:",
    choices,
  });
}

/**
 * Configure file patterns for each selected type
 */
async function configureFilePatterns(
  selectedTypes: string[],
  presetContent: any
): Promise<SelectionConfig> {
  const selection: SelectionConfig = {};

  for (const type of selectedTypes) {
    if (type === "rules" || type === "commands") {
      selection[type] = await configureFileTypePatterns(type);
    } else if (type === "mcps") {
      selection.mcps = await configureMcpSelection(
        Object.keys(presetContent.mcps)
      );
    }
  }

  return selection;
}

/**
 * Configure include/exclude patterns for a file type
 */
async function configureFileTypePatterns(
  type: "rules" | "commands"
): Promise<{ include: string[]; exclude?: string[] }> {
  console.log(pc.cyan(`\nConfiguring ${type} selection:`));

  const include = await input({
    message: `Include patterns (comma-separated, e.g., *, **/*.js):`,
    validate: (input) => {
      if (!input) {
        return "Include patterns cannot be empty";
      }
      return true;
    },
  });

  const exclude = await input({
    message: `Exclude patterns (optional, comma-separated):`,
  });

  return {
    include: include.split(",").map((p) => p.trim()),
    exclude: exclude ? exclude.split(",").map((p) => p.trim()) : undefined,
  };
}

/**
 * Configure MCP selection
 */
async function configureMcpSelection(
  availableMcps: string[]
): Promise<string[]> {
  console.log(pc.cyan(`\nConfiguring MCP selection:`));

  return checkbox({
    message: "Select MCPs to include:",
    choices: availableMcps.map((mcp) => ({ name: mcp, value: mcp })),
  });
}

/**
 * Validate selection against preset content
 */
async function validateSelection(
  cwd: string,
  presetSource: string,
  selection: SelectionConfig
) {
  const orchestrator = new RegistryOrchestrator();
  const validation = await orchestrator.validateSelections(cwd, {
    [presetSource]: selection,
  });

  if (!validation.valid) {
    throw new SelectionValidationError(
      "Selection validation failed",
      validation.errors.map((error) => ({
        path: [],
        message: error,
      }))
    );
  }
}

/**
 * Show preview of the selection
 */
async function showPreview(
  presetContent: any,
  selection: SelectionConfig
): Promise<void> {
  console.log(pc.cyan("\n📝 Selection Preview"));
  console.log(pc.gray("--------------------"));

  const merger = new ConfigMerger();
  const applied = merger.applySelections(presetContent, selection);

  if (applied.rules.size > 0) {
    console.log(pc.bold("Rules:"));
    for (const filename of applied.rules.keys()) {
      console.log(pc.green(`  + ${filename}`));
    }
  }

  if (applied.commands.size > 0) {
    console.log(pc.bold("Commands:"));
    for (const filename of applied.commands.keys()) {
      console.log(pc.green(`  + ${filename}`));
    }
  }

  if (Object.keys(applied.mcps).length > 0) {
    console.log(pc.bold("MCPs:"));
    for (const mcpName of Object.keys(applied.mcps)) {
      console.log(pc.green(`  + ${mcpName}`));
    }
  }

  console.log(pc.gray("--------------------"));
}

/**
 * Save selection to configuration
 */
async function saveSelection(
  cwd: string,
  presetSource: string,
  selection: SelectionConfig
): Promise<void> {
  const configPath = path.join(cwd, ".agentsync", "config.json");
  const configContent = await readFile(configPath, "utf-8");
  const config = validateConfig(JSON.parse(configContent));

  // Find the preset in the extends array
  const extendsIndex = config.extends?.findIndex(
    (e) => (typeof e === "string" ? e : e.source) === presetSource
  );

  if (extendsIndex === undefined || extendsIndex === -1) {
    // If not found, add it
    if (!config.extends) {
      config.extends = [];
    }
    config.extends.push({ source: presetSource, select: selection });
  } else {
    // If found, update it
    const extendsEntry = config.extends![extendsIndex];
    if (typeof extendsEntry === "string") {
      // Convert string entry to object with selection
      config.extends![extendsIndex] = {
        source: extendsEntry,
        select: selection,
      };
    } else {
      // Update existing object entry
      config.extends![extendsIndex] = {
        ...extendsEntry,
        select: selection,
      };
    }
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
