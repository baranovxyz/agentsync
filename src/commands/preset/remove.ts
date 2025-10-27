/**
 * Preset Removal Command
 * Allows users to interactively remove presets and their selections from the configuration
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { confirm, select } from "@inquirer/prompts";
import ora from "ora";
import pc from "picocolors";
import { UserPresetRegistry } from "../../core/registry/user-preset-registry.js";
import {
  type AgentSyncConfig,
  type PresetSelection,
  validateConfig,
} from "../../types/schemas.js";

/**
 * Options for preset removal
 */
export interface RemovePresetOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
}

/**
 * Main preset removal command
 */
export async function removePreset(
  options: RemovePresetOptions = {},
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
          "Add presets to your configuration first using 'agentsync preset interactive-select'.",
        ),
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
      configLevel,
    );

    // 7. If specific removal, let user select content types
    let removedTypes: string[] = [];
    if (removalType === "specific") {
      removedTypes = await selectContentTypesForRemoval(
        config,
        presetSource,
        configLevel,
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
      configLevel,
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
      configLevel,
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
async function loadConfig(cwd: string): Promise<AgentSyncConfig> {
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    return validateConfig(JSON.parse(configContent));
  } catch (error) {
    throw new Error(
      `Failed to load configuration: ${(error as Error).message}`,
    );
  }
}

/**
 * Create preset source entry for configured presets
 */
function createPresetSourceEntry(
  source: string,
  existingSources: Array<{
    name: string;
    value: string;
    description?: string;
    configLevels: string[];
  }>,
): void {
  const existingSource = existingSources.find((s) => s.value === source);
  if (existingSource) {
    existingSource.configLevels.push("project");
  } else {
    existingSources.push({
      name: source.startsWith("user:")
        ? `${source.replace("user:", "")} (user)`
        : source,
      value: source,
      description: "Configured at project level",
      configLevels: ["project"],
    });
  }
}

/**
 * Get configured preset sources from config
 */
async function getConfiguredPresetSources(config: AgentSyncConfig): Promise<
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

  // Check extends array for presets with filters
  if (config.extends && Array.isArray(config.extends)) {
    for (const entry of config.extends) {
      if (typeof entry === "object" && (entry.include || entry.exclude)) {
        createPresetSourceEntry(entry.source, sources);
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
  }>,
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
  config: AgentSyncConfig,
  presetSource: string,
): Array<"user" | "project" | "local"> {
  const levels: Array<"user" | "project" | "local"> = [];

  // Check if preset exists in extends array with filters
  if (config.extends && Array.isArray(config.extends)) {
    for (const entry of config.extends) {
      if (
        typeof entry === "object" &&
        entry.source === presetSource &&
        (entry.include || entry.exclude)
      ) {
        levels.push("project");
        break;
      }
    }
  }

  return levels;
}

/**
 * Let user select configuration level
 */
async function selectConfigLevel(
  levels: Array<"user" | "project" | "local">,
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
  _config: AgentSyncConfig,
  _presetSource: string,
  _configLevel: "user" | "project" | "local",
): Promise<"entire" | "specific"> {
  // For alpha, we only support entire preset removal
  return "entire";
}

/**
 * Let user select content types for removal
 */
async function selectContentTypesForRemoval(
  _config: AgentSyncConfig,
  _presetSource: string,
  _configLevel: "user" | "project" | "local",
): Promise<string[]> {
  // For alpha, we only support entire preset removal
  return [];
}

/**
 * Find selection for a preset source
 */
function findPresetSelection(
  _config: AgentSyncConfig,
  _presetSource: string,
): PresetSelection | null {
  // For alpha, selections stored directly in extends entries
  return null;
}

/**
 * Get selection value by type
 */
function getSelectionValue(selection: PresetSelection, type: string): unknown {
  switch (type) {
    case "rules":
      return selection.rules;
    case "commands":
      return selection.commands;
    case "mcps":
      return selection.mcps;
    default:
      return undefined;
  }
}

/**
 * Display specific removals for a preset
 */
function displaySpecificRemovals(
  config: AgentSyncConfig,
  presetSource: string,
  removedTypes: string[],
): void {
  const selection = findPresetSelection(config, presetSource);
  if (!selection) return;

  for (const type of removedTypes) {
    const value = getSelectionValue(selection, type);
    console.log(pc.yellow(`  - ${type}: ${JSON.stringify(value)}`));
  }
}

/**
 * Show preview of what will be removed
 */
async function showRemovalPreview(
  presetSource: string,
  removalType: "entire" | "specific",
  removedTypes: string[],
  config: AgentSyncConfig,
  configLevel: "user" | "project" | "local",
): Promise<void> {
  console.log(pc.cyan("\n📝 Removal Preview"));
  console.log(pc.gray("--------------------"));

  if (removalType === "entire") {
    console.log(
      pc.yellow(
        `🔥 Entire preset '${presetSource}' will be removed from ${configLevel} configuration.`,
      ),
    );
  } else {
    console.log(
      pc.yellow(
        `🔥 Selections for '${presetSource}' will be removed from ${configLevel} configuration:`,
      ),
    );
    displaySpecificRemovals(config, presetSource, removedTypes);
  }

  console.log(pc.gray("--------------------"));
}

/**
 * Get config path based on level
 */
function getConfigPath(
  cwd: string,
  configLevel: "user" | "project" | "local",
): string {
  if (configLevel === "project") {
    return path.join(cwd, ".agentsync/config.json");
  }
  if (configLevel === "local") {
    return path.join(cwd, "agentsync.local.json");
  }
  return path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".agentsync",
    "config.json",
  );
}

/**
 * Update extends entry for removal
 */
function updateExtendsEntry(
  entry: string | { source: string; include?: string[]; exclude?: string[] },
  presetSource: string,
  removalType: "entire" | "specific",
  _removedTypes: string[],
): typeof entry | null {
  const source = typeof entry === "string" ? entry : entry.source;

  if (source !== presetSource) {
    return entry;
  }

  if (removalType === "entire") {
    return null; // Mark for removal
  }

  return entry;
}

/**
 * Apply removal to configuration
 */
async function applyRemoval(
  cwd: string,
  presetSource: string,
  removalType: "entire" | "specific",
  removedTypes: string[],
  configLevel: "user" | "project" | "local",
): Promise<void> {
  const configPath = getConfigPath(cwd, configLevel);

  try {
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    if (!config.extends) {
      throw new Error("No presets configured");
    }

    // Find and update extends entry
    config.extends = config.extends
      .map((entry) =>
        updateExtendsEntry(entry, presetSource, removalType, removedTypes),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to update configuration: ${(error as Error).message}`,
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
        `⚠️  Could not remove from user registry: ${(error as Error).message}`,
      ),
    );
  }
}
