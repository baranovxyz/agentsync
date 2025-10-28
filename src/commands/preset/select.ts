/**
 * Preset Selection Command
 * Allows users to interactively select presets and configure file-level selections
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { confirm, input, select } from "@inquirer/prompts";
import * as pc from "picocolors";
import {
  ConfigError,
  ErrorCategory,
  ErrorHandler,
  ErrorSeverity,
  InteractiveSelectionError,
} from "../../core/errors.js";
import { type AgentSyncConfig, validateConfig } from "../../types/schemas.js";

/**
 * Options for preset selection
 */
export interface SelectPresetOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
}

/**
 * Main preset selection command - simplified to just edit patterns
 */
export async function selectPreset(
  options: SelectPresetOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Check if running in interactive environment
  if (!process.stdin.isTTY) {
    throw new InteractiveSelectionError(
      "Interactive preset selection requires a terminal",
      ErrorSeverity.HIGH,
      { environment: "non-interactive" },
    );
  }

  console.log(pc.blue("🎯 Preset Configuration\n"));

  try {
    // 1. Load current configuration
    const config = await loadConfig(cwd);

    if (!config.extends || config.extends.length === 0) {
      console.log(pc.yellow("No presets found in configuration."));
      console.log(
        pc.gray(
          "Add presets to .agentsync/config.json first, then run this command.",
        ),
      );
      return;
    }

    // 2. Let user select which preset to configure
    const presetIndex = await selectPresetFromConfig(config);

    const presetEntry = config.extends[presetIndex];
    const presetSource =
      typeof presetEntry === "string" ? presetEntry : presetEntry.source;

    // 3. Edit include/exclude patterns
    const patterns = await configurePatterns(presetEntry);

    // 4. Confirm and save
    const shouldSave =
      options.yes ||
      (await confirm({
        message: "Save these patterns to configuration?",
        default: true,
      }));

    if (!shouldSave) {
      console.log(pc.gray("Configuration cancelled."));
      return;
    }

    // 5. Save to configuration
    await savePatterns(cwd, presetIndex, presetSource, patterns);

    console.log(pc.green("✅ Configuration saved!"));
    console.log(pc.gray("Run 'agentsync sync' to apply changes."));
  } catch (error) {
    const wrappedError = ErrorHandler.wrap(
      error,
      "Preset configuration failed",
      ErrorCategory.CONFIG,
      { cwd, options },
    );

    console.error(pc.red(`❌ ${wrappedError.getUserMessage()}`));
    throw wrappedError;
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
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        `Configuration file contains invalid JSON: ${error.message}`,
        configPath,
        "Check the syntax of your configuration file and ensure it's valid JSON",
      );
    }

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(
        "Configuration file not found",
        configPath,
        "Run 'agentsync init' to create a configuration file",
      );
    }

    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      throw new ConfigError(
        "Permission denied accessing configuration file",
        configPath,
        "Check file permissions and try running with appropriate access rights",
      );
    }

    throw ErrorHandler.wrap(
      error,
      "Failed to load configuration",
      ErrorCategory.CONFIG,
      { configPath },
    );
  }
}

/**
 * Let user select which preset from config to configure
 */
async function selectPresetFromConfig(
  config: AgentSyncConfig,
): Promise<number> {
  const extendsArray = config.extends || [];

  const choices = extendsArray.map((entry, i) => {
    const source = typeof entry === "string" ? entry : entry.source;
    return {
      name: `${i + 1}. ${source}`,
      value: i,
    };
  });

  if (choices.length === 1) {
    return 0; // Auto-select if only one preset
  }

  return select({
    message: "Select preset to configure:",
    choices,
  });
}

/**
 * Configure include/exclude patterns for the preset
 */
async function configurePatterns(
  presetEntry: unknown,
): Promise<{ include?: string[]; exclude?: string[] }> {
  const isObject = typeof presetEntry === "object" && presetEntry !== null;
  const currentInclude = isObject
    ? (presetEntry as Record<string, unknown>).include
    : undefined;
  const currentExclude = isObject
    ? (presetEntry as Record<string, unknown>).exclude
    : undefined;

  console.log(pc.cyan("\nFile patterns (glob format):"));

  const includeInput = await input({
    message: `Include patterns (comma-separated, or press Enter for all files):`,
    default: currentInclude ? (currentInclude as string[]).join(", ") : "*",
  });

  const includePatterns = includeInput
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p);

  const excludeInput = await input({
    message: `Exclude patterns (comma-separated, or press Enter for none):`,
    default: currentExclude ? (currentExclude as string[]).join(", ") : "",
  });

  const excludePatterns = excludeInput
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p);

  return {
    include: includePatterns.length > 0 ? includePatterns : undefined,
    exclude: excludePatterns.length > 0 ? excludePatterns : undefined,
  };
}

/**
 * Save patterns to configuration
 */
async function savePatterns(
  cwd: string,
  presetIndex: number,
  presetSource: string,
  patterns: { include?: string[]; exclude?: string[] },
): Promise<void> {
  const configPath = path.join(cwd, ".agentsync", "config.json");
  const configContent = await readFile(configPath, "utf-8");
  const config = validateConfig(JSON.parse(configContent));

  const extendsEntry = config.extends?.[presetIndex];

  if (typeof extendsEntry === "string") {
    // Convert string to object with patterns
    config.extends![presetIndex] = {
      source: extendsEntry,
      namespace: presetSource.split("/")[0], // Extract namespace from org
      ...patterns,
    };
  } else if (extendsEntry) {
    // Update existing object entry
    config.extends![presetIndex] = {
      ...extendsEntry,
      ...patterns,
    };
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
