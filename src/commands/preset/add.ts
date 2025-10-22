/**
 * Add preset command with selection support
 */

import picocolors from "picocolors";
import { validateConfig, validateUserPreset } from "../../types/schemas.js";
import { ConfigMerger } from "../../core/config/interactive-selection-merger.js";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";
import type { UserPreset, SelectionConfig } from "../../types/index.js";

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
  preset?: UserPreset;
  selection?: SelectionConfig;
  message?: string;
  error?: string;
}

/**
 * Add a preset to the project configuration with optional selection
 */
export async function addPreset(
  preset: UserPreset,
  options: AddPresetOptions = {}
): Promise<AddPresetResult> {
  const cwd = options.cwd || process.cwd();
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    // Validate preset
    validateUserPreset(preset);

    // Load current config
    let configContent: string;
    try {
      configContent = await readFile(configPath, "utf-8");
    } catch (error) {
      return {
        success: false,
        error: "AgentSync configuration not found. Run 'agentsync init' first.",
      };
    }

    const config = validateConfig(JSON.parse(configContent));

    // Check for duplicates
    if (
      config.extends?.find(
        (e) => (typeof e === "string" ? e : e.source) === preset.source
      )
    ) {
      return {
        success: false,
        error: `Preset '${preset.source}' already exists in configuration`,
      };
    }

    // Add preset to extends array
    const updatedConfig = {
      ...config,
      extends: [...(config.extends || []), preset.source],
    };

    // Save updated config
    await writeFile(
      configPath,
      JSON.stringify(updatedConfig, null, 2),
      "utf-8"
    );

    // Save selection if provided
    if (options.selection) {
      try {
        const merger = new ConfigMerger();
        // Load existing selections
        let existingSelections: Record<string, SelectionConfig> = {};
        try {
          const projectConfigContent = await readFile(
            path.join(cwd, ".agentsync", "interactive-selections.json"),
            "utf-8"
          );
          const projectConfig = JSON.parse(projectConfigContent);
          if (projectConfig.project?.selections) {
            existingSelections = projectConfig.project.selections;
          }
        } catch {
          // Continue with empty selections if file doesn't exist
        }

        // Add new selection
        const updatedSelections = {
          ...existingSelections,
          [preset.source]: options.selection,
        };

        await merger.saveSelectionsForProject(cwd, updatedSelections);
      } catch (error) {
        // If saving selection fails, we should still consider the preset added
        // but warn the user
        console.log(
          pc.yellow(
            `⚠️  Warning: Failed to save selection: ${(error as Error).message}`
          )
        );
      }
    }

    const message = options.selection
      ? `Added preset '${preset.name}' with selection`
      : `Added preset '${preset.name}'`;

    return {
      success: true,
      preset,
      selection: options.selection,
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Add preset from source string with interactive prompts
 */
export async function addPresetFromSource(
  source: string,
  options: AddPresetOptions = {}
): Promise<AddPresetResult> {
  // Parse source to extract basic preset info
  const match = source.match(/^github:([^/]+)\/([^/]+)$/);
  if (!match) {
    return {
      success: false,
      error: "Invalid source format. Expected: github:org/repo",
    };
  }

  const [, org, repo] = match;
  const preset: UserPreset = {
    name: repo,
    description: `Preset from ${org}/${repo}`,
    source,
    namespace: org,
  };

  return addPreset(preset, options);
}

/**
 * CLI handler for add preset command
 */
export async function handleAddPresetCommand(
  source: string,
  options: { selection?: boolean; yes?: boolean }
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
      pc.gray("Interactive selection configuration not implemented yet")
    );
    console.log(
      pc.gray(
        "Use 'agentsync preset interactive-select' to configure selections"
      )
    );
  }

  const result = await addPresetFromSource(source, {
    selection,
    yes: options.yes,
  });

  if (result.success) {
    console.log(pc.green(`✓ ${result.message}`));

    if (result.selection) {
      console.log(pc.cyan("  Selection configured"));
      console.log(
        pc.gray("  Use 'agentsync sync --selections' to sync with selections")
      );
    }

    console.log(pc.gray("\nRun 'agentsync sync' to apply changes"));
  } else {
    console.log(pc.red(`✗ Failed to add preset: ${result.error}`));
  }
}
