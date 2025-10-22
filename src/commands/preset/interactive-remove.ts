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
import { validateConfig } from "../../types/schemas.js";

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
    const presetSources = await getConfiguredPresetSources(config);

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
async function getConfiguredPresetSources(config: any): Promise<
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
                ? `${source.replace("user:", "")} (user)`
                : source,
              value: source,
              description: `Configured at ${level} level`,
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
 * Let user select a preset to remove
 */
async function selectPresetForRemoval(
  sources: Array<{
    name: string;
    value: string;
    description?: string;
    configLevels: string[];
  }>
): Promise<string> {
  return select({
    message: "Select a preset to remove or modify:",
    choices: sources.map((source) => ({
      name: `${source.name} ${pc.gray(`(${source.configLevels.join(", ")})`)}`,
      value: source.value,
      description: source.description,
    })),
  });
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

  return select({
    message: "Select configuration level to modify:",
    choices: levels.map((level) => ({
      name: level,
      value: level,
    })),
  });
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
    config.interactiveSelection[configLevel]?.selections?.[presetSource];

  if (!selection || Object.keys(selection).length === 0) {
    return "entire";
  }

  return select({
    message: "What would you like to remove?",
    choices: [
      {
        name: "Remove the entire preset and its selections",
        value: "entire",
      },
      {
        name: "Remove specific file selections (rules, commands, MCPs)",
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
    config.interactiveSelection[configLevel]?.selections?.[presetSource];

  if (!selection) {
    return [];
  }

  const choices = [];
  if (selection.rules) choices.push({ name: "Rules", value: "rules" });
  if (selection.commands) choices.push({ name: "Commands", value: "commands" });
  if (selection.mcps) choices.push({ name: "MCPs", value: "mcps" });

  if (choices.length === 0) {
    console.log(pc.yellow("No specific selections to remove."));
    return [];
  }

  return checkbox({
    message: "Select content types to remove selections for:",
    choices,
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
  console.log(pc.cyan("\n📝 Removal Preview"));
  console.log(pc.gray("--------------------"));

  if (removalType === "entire") {
    console.log(
      pc.yellow(
        `🔥 Entire preset '${presetSource}' will be removed from ${configLevel} configuration.`
      )
    );
  } else {
    console.log(
      pc.yellow(
        `🔥 Selections for '${presetSource}' will be removed from ${configLevel} configuration:`
      )
    );
    const selection =
      config.interactiveSelection[configLevel]?.selections?.[presetSource];
    for (const type of removedTypes) {
      console.log(pc.yellow(`  - ${type}: ${JSON.stringify(selection[type])}`));
    }
  }

  console.log(pc.gray("--------------------"));
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
  const configPath = path.join(
    cwd,
    ".agentsync",
    "interactive-selections.json"
  );

  try {
    const configContent = await readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

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

    // TODO: Re-implement validation if necessary
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
