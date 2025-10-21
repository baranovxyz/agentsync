/**
 * Interactive Preset Removal Command
 * Allows users to interactively remove presets and their selections from the configuration
 */

import { select, checkbox, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";
import { UserPresetRegistry } from "../../core/registry/user-preset-registry.js";
import {
  validateConfig,
  validateInteractiveSelectionConfig,
} from "../../types/schemas.js";
import type { PresetSelection, UserPreset } from "../../types/index.js";

/**
 * Options for interactive preset removal
 */
export interface InteractiveRemoveOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
}

/**
 * Interactive preset removal result
 */
interface InteractiveRemoveResult {
  presetSource: string;
  removalType: "entire" | "specific";
  removedTypes: string[];
  configLevel: "user" | "project" | "local";
}

/**
 * Main interactive preset removal command
 */
export async function interactiveRemovePreset(
  options: InteractiveRemoveOptions = {}
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Check if running in interactive environment
  if (!process.stdin.isTTY) {
    throw new Error("Interactive preset removal requires a terminal");
  }

  console.log(pc.blue("🗑️  Interactive Preset Removal\n"));

  try {
    // 1. Load current configuration
    const config = await loadConfig(cwd);

    // 2. Get configured preset sources
    const presetSources = await getConfiguredPresetSources(cwd, config);

    if (presetSources.length === 0) {
      console.log(pc.yellow("No presets configured for removal."));
      console.log(
        pc.gray(
          "Add presets to your configuration first using 'agentsync preset interactive-select'."
        )
      );
      return;
    }

    // 3. Let user select a preset to remove
    const presetSource = await selectPresetForRemoval(presetSources);

    // 4. Determine available configuration levels for this preset
    const configLevels = getAvailableConfigLevels(config, presetSource);

    // 5. Let user select configuration level
    const configLevel = await selectConfigLevel(configLevels);

    // 6. Let user choose removal type
    const removalType = await selectRemovalType(
      config,
      presetSource,
      configLevel
    );

    // 7. If specific removal, let user select content types
    let removedTypes: string[] = [];
    if (removalType === "specific") {
      removedTypes = await selectContentTypesForRemoval(
        config,
        presetSource,
        configLevel
      );
      if (removedTypes.length === 0) {
        console.log(pc.yellow("No content types selected for removal."));
        return;
      }
    }

    // 8. Show preview of what will be removed
    await showRemovalPreview(
      presetSource,
      removalType,
      removedTypes,
      config,
      configLevel
    );

    // 9. Confirm removal
    const shouldRemove =
      options.yes ||
      (await confirm({
        message: `Remove these ${removalType === "entire" ? "preset" : "selections"}?`,
        default: false,
      }));

    if (!shouldRemove) {
      console.log(pc.gray("Removal cancelled."));
      return;
    }

    // 10. Apply removal
    const spinner = ora("Removing preset selections...").start();
    await applyRemoval(
      cwd,
      presetSource,
      removalType,
      removedTypes,
      configLevel
    );
    spinner.succeed("Removal complete");

    // 11. If user preset, offer to remove from registry
    if (presetSource.startsWith("user:") && removalType === "entire") {
      await offerRegistryCleanup(presetSource);
    }

    console.log(pc.green("✅ Preset removal completed successfully!"));
    console.log(pc.gray("Run 'agentsync sync' to apply the changes."));
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
 * Get configured preset sources from config
 */
async function getConfiguredPresetSources(
  cwd: string,
  config: any
): Promise<
  Array<{
    name: string;
    value: string;
    description?: string;
    configLevels: string[];
  }>
> {
  const sources: Array<{
    name: string;
    value: string;
    description?: string;
    configLevels: string[];
  }> = [];

  // Check interactive selection configuration
  if (config.interactiveSelection) {
    const levels: Array<"user" | "project" | "local"> = [
      "user",
      "project",
      "local",
    ];

    for (const level of levels) {
      if (config.interactiveSelection[level]?.selections) {
        for (const source of Object.keys(
          config.interactiveSelection[level].selections
        )) {
          const existingSource = sources.find((s) => s.value === source);
          if (existingSource) {
            existingSource.configLevels.push(level);
          } else {
            sources.push({
              name: source.startsWith("user:")
                ? `👤 ${source.replace("user:", "")}`
                : `📦 ${source}`,
              value: source,
              configLevels: [level],
            });
          }
        }
      }
    }
  }

  return sources;
}

/**
 * Let user select a preset for removal
 */
async function selectPresetForRemoval(
  sources: Array<{
    name: string;
    value: string;
    description?: string;
    configLevels: string[];
  }>
): Promise<string> {
  const choice = await select({
    message: "Select a preset to remove:",
    choices: sources.map((source) => ({
      name: `${source.name} ${pc.gray(`(${source.configLevels.join(", ")})`)}`,
      value: source.value,
    })),
  });

  return choice;
}

/**
 * Get available configuration levels for a preset
 */
function getAvailableConfigLevels(
  config: any,
  presetSource: string
): Array<"user" | "project" | "local"> {
  const levels: Array<"user" | "project" | "local"> = [];

  if (config.interactiveSelection) {
    ["user", "project", "local"].forEach((level) => {
      if (config.interactiveSelection[level]?.selections?.[presetSource]) {
        levels.push(level as "user" | "project" | "local");
      }
    });
  }

  return levels;
}

/**
 * Let user select configuration level
 */
async function selectConfigLevel(
  levels: Array<"user" | "project" | "local">
): Promise<"user" | "project" | "local"> {
  if (levels.length === 1) {
    return levels[0];
  }

  const choice = await select({
    message: "Select configuration level:",
    choices: levels.map((level) => ({
      name: `${level === "user" ? "👤" : level === "project" ? "📁" : "💻"} ${level}`,
      value: level,
    })),
  });

  return choice;
}

/**
 * Let user choose removal type
 */
async function selectRemovalType(
  config: any,
  presetSource: string,
  configLevel: "user" | "project" | "local"
): Promise<"entire" | "specific"> {
  const selection =
    config.interactiveSelection[configLevel].selections[presetSource];
  const hasMultipleTypes = Object.keys(selection).length > 1;

  if (!hasMultipleTypes) {
    return "entire";
  }

  return await select({
    message: "What would you like to remove?",
    choices: [
      {
        name: "🗑️  Remove entire preset (all selections)",
        value: "entire",
      },
      {
        name: "⚡ Remove specific selections (rules, commands, MCPs)",
        value: "specific",
      },
    ],
  });
}

/**
 * Let user select content types for removal
 */
async function selectContentTypesForRemoval(
  config: any,
  presetSource: string,
  configLevel: "user" | "project" | "local"
): Promise<string[]> {
  const selection =
    config.interactiveSelection[configLevel].selections[presetSource];
  const availableTypes: Array<{ name: string; value: string }> = [];

  if (selection.rules) {
    availableTypes.push({
      name: `📋 Rules (${selection.rules.include.length} pattern${selection.rules.include.length === 1 ? "" : "s"})`,
      value: "rules",
    });
  }

  if (selection.commands) {
    availableTypes.push({
      name: `⚡ Commands (${selection.commands.include.length} pattern${selection.commands.include.length === 1 ? "" : "s"})`,
      value: "commands",
    });
  }

  if (selection.mcps) {
    availableTypes.push({
      name: `🔌 MCPs (${selection.mcps.length} server${selection.mcps.length === 1 ? "" : "s"})`,
      value: "mcps",
    });
  }

  return await checkbox({
    message: "Select content types to remove:",
    choices: availableTypes,
  });
}

/**
 * Show preview of what will be removed
 */
async function showRemovalPreview(
  presetSource: string,
  removalType: "entire" | "specific",
  removedTypes: string[],
  config: any,
  configLevel: "user" | "project" | "local"
): Promise<void> {
  console.log(pc.blue("\n📋 Preview of Removal:\n"));

  const selection =
    config.interactiveSelection[configLevel].selections[presetSource];
  const displayName = presetSource.startsWith("user:")
    ? presetSource.replace("user:", "")
    : presetSource;

  console.log(pc.cyan(`Preset: ${displayName}`));
  console.log(pc.cyan(`Level: ${configLevel}`));
  console.log();

  if (removalType === "entire") {
    console.log(pc.red("🗑️  Will remove entire preset:"));
    if (selection.rules) {
      console.log(pc.gray(`  - Rules: ${selection.rules.include.join(", ")}`));
    }
    if (selection.commands) {
      console.log(
        pc.gray(`  - Commands: ${selection.commands.include.join(", ")}`)
      );
    }
    if (selection.mcps) {
      console.log(pc.gray(`  - MCPs: ${selection.mcps.join(", ")}`));
    }
  } else {
    console.log(pc.red("⚡ Will remove specific selections:"));
    for (const type of removedTypes) {
      if (type === "rules" && selection.rules) {
        console.log(
          pc.gray(`  - Rules: ${selection.rules.include.join(", ")}`)
        );
      }
      if (type === "commands" && selection.commands) {
        console.log(
          pc.gray(`  - Commands: ${selection.commands.include.join(", ")}`)
        );
      }
      if (type === "mcps" && selection.mcps) {
        console.log(pc.gray(`  - MCPs: ${selection.mcps.join(", ")}`));
      }
    }
  }

  console.log();
}

/**
 * Apply removal to configuration
 */
async function applyRemoval(
  cwd: string,
  presetSource: string,
  removalType: "entire" | "specific",
  removedTypes: string[],
  configLevel: "user" | "project" | "local"
): Promise<void> {
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    // Load current config
    const configContent = await readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Initialize interactive selection if not present
    if (!config.interactiveSelection) {
      throw new Error("No interactive selection configuration found");
    }

    // Initialize level if not present
    if (!config.interactiveSelection[configLevel]) {
      throw new Error(`No ${configLevel} configuration found`);
    }

    if (!config.interactiveSelection[configLevel].selections) {
      throw new Error(`No selections found in ${configLevel} configuration`);
    }

    // Check if preset exists
    if (!config.interactiveSelection[configLevel].selections[presetSource]) {
      throw new Error("Preset not found in configuration");
    }

    if (removalType === "entire") {
      // Remove entire preset
      delete config.interactiveSelection[configLevel].selections[presetSource];
    } else {
      // Remove specific selections
      const selection =
        config.interactiveSelection[configLevel].selections[presetSource];

      for (const type of removedTypes) {
        delete selection[type];
      }

      // If no selections remain, remove the entire preset
      if (Object.keys(selection).length === 0) {
        delete config.interactiveSelection[configLevel].selections[
          presetSource
        ];
      } else {
        // Update the selection
        config.interactiveSelection[configLevel].selections[presetSource] =
          selection;
      }
    }

    // Validate and save
    validateInteractiveSelectionConfig(config.interactiveSelection);
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to update configuration: ${(error as Error).message}`
    );
  }
}

/**
 * Offer to remove user preset from registry
 */
async function offerRegistryCleanup(presetSource: string): Promise<void> {
  try {
    const userRegistry = new UserPresetRegistry();
    const presetName = presetSource.replace("user:", "");

    // Check if preset exists in registry
    const userPreset = await userRegistry.get(presetName);

    if (userPreset) {
      const removeFromRegistry = await confirm({
        message: `Remove '${presetName}' from user preset registry as well?`,
        default: false,
      });

      if (removeFromRegistry) {
        await userRegistry.remove(presetName);
        console.log(pc.green(`✓ Removed '${presetName}' from user registry`));
      }
    }
  } catch (error) {
    // Registry might not exist or preset not found, continue
    console.log(
      pc.yellow(
        `⚠️  Could not remove from user registry: ${(error as Error).message}`
      )
    );
  }
}
