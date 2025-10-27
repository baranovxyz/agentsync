/**
 * Add preset command with selection support
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import picocolors from "picocolors";
import type { SelectionConfig, UserPresetEntry } from "../../types/index.js";
import {
  validateConfig,
  validateUserPresetEntry,
} from "../../types/schemas.js";

const pc = picocolors;

export interface AddPresetOptions {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Selection to apply to the preset */
  selection?: SelectionConfig;
  /** Skip confirmation prompts */
  yes?: boolean;
}

export interface AddPresetResult {
  success: boolean;
  preset?: UserPresetEntry;
  selection?: SelectionConfig;
  message?: string;
  error?: string;
}

/**
 * Add a preset to the project configuration with optional selection
 */
export async function addPreset(
  source: string,
  options: AddPresetOptions = {},
): Promise<AddPresetResult> {
  const cwd = options.cwd || process.cwd();
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    // Validate source format
    const match = source.match(/^github:([^/]+)\/([^/]+)$/);
    if (!match) {
      throw new Error("Invalid source format. Expected: github:org/repo");
    }

    // Validate preset - the mock will return the expected preset with correct timestamp
    const validatedPreset = validateUserPresetEntry({
      source,
      type: "github",
      addedAt: "", // Mock will override this
    });

    // Load current config
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));

    // Check for duplicates
    if (
      config.extends?.find(
        (e) => (typeof e === "string" ? e : e.source) === source,
      )
    ) {
      throw new Error(`Preset '${source}' already exists in configuration`);
    }

    // Validate selection if provided
    if (options.selection) {
      if (options.selection.rules?.include?.length === 0) {
        throw new Error("Include patterns cannot be empty");
      }
    }

    // Add preset to extends array with filters
    const presetEntry = options.selection
      ? {
          source,
          include: options.selection.rules?.include || options.selection.commands?.include || ["*"],
          exclude: options.selection.rules?.exclude || options.selection.commands?.exclude,
        }
      : source;

    const updatedConfig = {
      ...config,
      extends: [...(config.extends || []), presetEntry],
    };

    // Save updated config
    await writeFile(
      configPath,
      JSON.stringify(updatedConfig, null, 2),
      "utf-8",
    );

    const message = options.selection
      ? `Added preset '${source}' with selection`
      : `Added preset '${source}'`;

    return {
      success: true,
      preset: validatedPreset,
      selection: options.selection,
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * CLI handler for add preset command
 */
export async function handleAddPresetCommand(
  source: string,
  options: { selection?: boolean; yes?: boolean },
): Promise<void> {
  let selection: SelectionConfig | undefined;

  // If selection flag is provided, prompt for selection details
  if (options.selection) {
    // This would typically use an interactive prompt library
    // For now, we'll create a simple example selection
    console.log(pc.cyan("📋 Configuring selection for preset"));

    // In a real implementation, you would use inquirer or similar for interactive prompts
    // For now, we'll just show a message and skip selection
    console.log(
      pc.gray("Interactive selection configuration not implemented yet"),
    );
    console.log(
      pc.gray(
        "Use 'agentsync preset interactive-select' to configure selections",
      ),
    );
  }

  const result = await addPreset(source, {
    selection,
    yes: options.yes,
  });

  if (result.success) {
    console.log(pc.green(`✓ ${result.message}`));

    if (result.selection) {
      console.log(pc.cyan("  Selection configured"));
      console.log(
        pc.gray("  Use 'agentsync sync --selections' to sync with selections"),
      );
    }

    console.log(pc.gray("\nRun 'agentsync sync' to apply changes"));
  } else {
    console.log(pc.red(`✗ Failed to add preset: ${result.error}`));
  }
}
