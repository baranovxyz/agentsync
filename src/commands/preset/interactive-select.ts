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
import {
  validateConfig,
  validateInteractiveSelectionConfig,
} from "../../types/schemas.js";
import type { PresetSelection, UserPreset } from "../../types/index.js";
import { isMatch } from "micromatch";

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
 * Interactive preset selection result
 */
interface InteractiveSelectResult {
  presetSource: string;
  selection: PresetSelection;
  saveToConfig: boolean;
  configLevel: "user" | "project" | "local";
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
    throw new Error("Interactive preset selection requires a terminal");
  }

  console.log(pc.blue("🎯 Interactive Preset Selection\n"));

  try {
    // 1. Load current configuration
    const config = await loadConfig(cwd);

    // 2. Get available preset sources
    const presetSources = await getAvailablePresetSources(cwd, config);

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
    const presetContent = await loadPresetContent(cwd, presetSource);
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
    console.error(pc.red(`Error: ${(error as Error).message}`));
    throw error;
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
    throw new Error(
      `Failed to load configuration: ${(error as Error).message}`
    );
  }
}

/**
 * Get available preset sources from config and user registry
 */
async function getAvailablePresetSources(
  cwd: string,
  config: any
): Promise<Array<{ name: string; value: string; description?: string }>> {
  const sources: Array<{ name: string; value: string; description?: string }> =
    [];

  // Add GitHub sources from config
  if (config.extends && Array.isArray(config.extends)) {
    for (const source of config.extends) {
      const sourceStr = typeof source === "string" ? source : source.source;
      sources.push({
        name: `📦 ${sourceStr}`,
        value: sourceStr,
        description: typeof source === "object" ? source.namespace : undefined,
      });
    }
  }

  // Add user presets from registry
  try {
    const userRegistry = new UserPresetRegistry();
    const userPresets = await userRegistry.list();

    for (const preset of userPresets) {
      sources.push({
        name: `👤 ${preset.name}`,
        value: `user:${preset.name}`,
        description: preset.description,
      });
    }
  } catch (error) {
    // User registry might not exist, continue without it
  }

  // Add option to add new GitHub source
  sources.push({
    name: `➕ Add new GitHub source`,
    value: "add-new",
  });

  return sources;
}

/**
 * Let user select a preset source
 */
async function selectPresetSource(
  sources: Array<{ name: string; value: string; description?: string }>
): Promise<string> {
  const choice = await select({
    message: "Select a preset source:",
    choices: sources.map((source) => ({
      name: source.description
        ? `${source.name} - ${pc.gray(source.description)}`
        : source.name,
      value: source.value,
    })),
  });

  if (choice === "add-new") {
    return await addNewGitHubSource();
  }

  return choice;
}

/**
 * Add new GitHub source
 */
async function addNewGitHubSource(): Promise<string> {
  const source = await input({
    message: "Enter GitHub source (format: github:org/repo):",
    validate: (input) => {
      if (!input.trim()) {
        return "Source cannot be empty";
      }
      if (!input.startsWith("github:") || !input.includes("/")) {
        return "Invalid format. Expected: github:org/repo";
      }
      return true;
    },
  });

  // Ask if user wants to add to user registry
  const addToRegistry = await confirm({
    message: "Add this source to your user preset registry?",
    default: true,
  });

  if (addToRegistry) {
    const name = await input({
      message: "Enter a name for this preset:",
      validate: (input) => {
        if (!input.trim()) {
          return "Name cannot be empty";
        }
        return true;
      },
    });

    const description = await input({
      message: "Enter a description (optional):",
    });

    try {
      const userRegistry = new UserPresetRegistry();
      const namespace = source.split(":")[1].split("/")[0];

      const userPreset: UserPreset = {
        name: name.trim(),
        description: description.trim() || `${name} preset`,
        version: "1.0.0",
        source,
        namespace,
      };

      await userRegistry.add(userPreset);
      console.log(pc.green(`✓ Added '${name}' to user registry`));
    } catch (error) {
      console.log(
        pc.yellow(
          `⚠️  Failed to add to user registry: ${(error as Error).message}`
        )
      );
    }
  }

  return source;
}

/**
 * Load preset content
 */
async function loadPresetContent(
  cwd: string,
  presetSource: string
): Promise<any> {
  const orchestrator = new RegistryOrchestrator();

  try {
    // If it's a user preset, get the actual GitHub source
    let actualSource = presetSource;
    if (presetSource.startsWith("user:")) {
      const userRegistry = new UserPresetRegistry();
      const presetName = presetSource.replace("user:", "");
      const userPreset = await userRegistry.get(presetName);
      actualSource = userPreset.source;
    }

    // Create a temporary config with just this preset
    const tempConfig = {
      version: "1.0",
      extends: [actualSource],
      tools: [],
      useSymlinks: true,
    };

    // Load the preset
    return await orchestrator.loadAndMerge(cwd);
  } catch (error) {
    throw new Error(`Failed to load preset: ${(error as Error).message}`);
  }
}

/**
 * Let user select content types
 */
async function selectContentTypes(presetContent: any): Promise<string[]> {
  const availableTypes: Array<{
    name: string;
    value: string;
    disabled?: boolean;
  }> = [];

  if (presetContent.rules && presetContent.rules.size > 0) {
    availableTypes.push({
      name: `📋 Rules (${presetContent.rules.size} files)`,
      value: "rules",
    });
  }

  if (presetContent.commands && presetContent.commands.size > 0) {
    availableTypes.push({
      name: `⚡ Commands (${presetContent.commands.size} files)`,
      value: "commands",
    });
  }

  if (presetContent.mcps && Object.keys(presetContent.mcps).length > 0) {
    availableTypes.push({
      name: `🔌 MCPs (${Object.keys(presetContent.mcps).length} servers)`,
      value: "mcps",
    });
  }

  if (availableTypes.length === 0) {
    return [];
  }

  return await checkbox({
    message: "Select content types to configure:",
    choices: availableTypes,
  });
}

/**
 * Configure file patterns for selected content types
 */
async function configureFilePatterns(
  selectedTypes: string[],
  presetContent: any
): Promise<PresetSelection> {
  const selection: PresetSelection = {};

  for (const type of selectedTypes) {
    if (type === "rules") {
      selection.rules = await configureFileTypePatterns(
        "rules",
        Array.from(presetContent.rules.keys())
      );
    } else if (type === "commands") {
      selection.commands = await configureFileTypePatterns(
        "commands",
        Array.from(presetContent.commands.keys())
      );
    } else if (type === "mcps") {
      selection.mcps = await configureMcpSelection(
        Object.keys(presetContent.mcps)
      );
    }
  }

  return selection;
}

/**
 * Configure file patterns for a specific content type
 */
async function configureFileTypePatterns(
  type: string,
  availableFiles: string[]
): Promise<{ include: string[]; exclude?: string[] }> {
  console.log(pc.cyan(`\n📁 Available ${type} files:`));
  availableFiles.forEach((file) => console.log(pc.gray(`  ${file}`)));

  const includePatterns = await input({
    message: `Include patterns for ${type} (comma-separated):`,
    validate: (input) => {
      if (!input.trim()) {
        return "Include patterns cannot be empty";
      }

      const patterns = input.split(",").map((p) => p.trim());
      for (const pattern of patterns) {
        try {
          // Test if pattern is valid glob
          isMatch("test", pattern);
        } catch (error) {
          return `Invalid glob pattern: ${pattern}`;
        }
      }

      return true;
    },
  });

  const excludePatterns = await input({
    message: `Exclude patterns for ${type} (comma-separated, optional):`,
  });

  const result: { include: string[]; exclude?: string[] } = {
    include: includePatterns.split(",").map((p) => p.trim()),
  };

  if (excludePatterns.trim()) {
    result.exclude = excludePatterns.split(",").map((p) => p.trim());
  }

  return result;
}

/**
 * Configure MCP server selection
 */
async function configureMcpSelection(
  availableMcps: string[]
): Promise<string[]> {
  console.log(pc.cyan(`\n🔌 Available MCP servers:`));
  availableMcps.forEach((mcp) => console.log(pc.gray(`  ${mcp}`)));

  return await checkbox({
    message: "Select MCP servers:",
    choices: availableMcps.map((mcp) => ({ name: mcp, value: mcp })),
  });
}

/**
 * Validate selection against preset content
 */
async function validateSelection(
  cwd: string,
  presetSource: string,
  selection: PresetSelection
): Promise<void> {
  const orchestrator = new RegistryOrchestrator();

  try {
    // If it's a user preset, get the actual GitHub source
    let actualSource = presetSource;
    if (presetSource.startsWith("user:")) {
      const userRegistry = new UserPresetRegistry();
      const presetName = presetSource.replace("user:", "");
      const userPreset = await userRegistry.get(presetName);
      actualSource = userPreset.source;
    }

    const validation = await orchestrator.validateSelections(cwd, {
      [actualSource]: selection,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
    }
  } catch (error) {
    throw new Error(`Selection validation failed: ${(error as Error).message}`);
  }
}

/**
 * Show preview of selected content
 */
async function showPreview(
  presetContent: any,
  selection: PresetSelection
): Promise<void> {
  console.log(pc.blue("\n📋 Preview of Selection:\n"));

  const merger = new ConfigMerger();
  const applied = merger.applySelections(presetContent, selection);

  if (applied.rules.size > 0) {
    console.log(pc.cyan(`📋 Rules (${applied.rules.size} files):`));
    for (const [filename] of applied.rules.entries()) {
      console.log(pc.gray(`  ✓ ${filename}`));
    }
  }

  if (applied.commands.size > 0) {
    console.log(pc.cyan(`⚡ Commands (${applied.commands.size} files):`));
    for (const [filename] of applied.commands.entries()) {
      console.log(pc.gray(`  ✓ ${filename}`));
    }
  }

  if (Object.keys(applied.mcps).length > 0) {
    console.log(
      pc.cyan(`🔌 MCPs (${Object.keys(applied.mcps).length} servers):`)
    );
    for (const mcpName of Object.keys(applied.mcps)) {
      console.log(pc.gray(`  ✓ ${mcpName}`));
    }
  }

  console.log();
}

/**
 * Save selection to configuration
 */
async function saveSelection(
  cwd: string,
  presetSource: string,
  selection: PresetSelection
): Promise<void> {
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    // Load current config
    const configContent = await readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Initialize interactive selection if not present
    if (!config.interactiveSelection) {
      config.interactiveSelection = {
        version: "2.0",
        project: {
          selections: {},
        },
      };
    }

    // Initialize project selections if not present
    if (!config.interactiveSelection.project) {
      config.interactiveSelection.project = {
        selections: {},
      };
    }

    if (!config.interactiveSelection.project.selections) {
      config.interactiveSelection.project.selections = {};
    }

    // If it's a user preset, get the actual GitHub source
    let actualSource = presetSource;
    if (presetSource.startsWith("user:")) {
      const userRegistry = new UserPresetRegistry();
      const presetName = presetSource.replace("user:", "");
      const userPreset = await userRegistry.get(presetName);
      actualSource = userPreset.source;
    }

    // Add/update selection
    config.interactiveSelection.project.selections[actualSource] = selection;

    // Validate and save
    validateInteractiveSelectionConfig(config.interactiveSelection);
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to save selection: ${(error as Error).message}`);
  }
}
