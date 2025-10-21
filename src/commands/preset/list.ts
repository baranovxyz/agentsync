/**
 * List extended presets command
 */

import picocolors from "picocolors";
import { validateConfig, normalizeExtends } from "../../types/schemas.js";
import { CacheManager } from "../../core/registry/cache-manager.js";
import { GitHubSourceParser } from "../../core/registry/github-source.js";
import { loadSelectionsForProject } from "../../core/config/interactive-selection-merger.js";
import { readFile } from "node:fs/promises";
import * as path from "path";

const pc = picocolors;

export interface ListPresetsOptions {
  verbose?: boolean;
}

export async function listPresets(
  options: ListPresetsOptions = {}
): Promise<void> {
  console.log(pc.blue("📚 Extended Presets\n"));

  const cwd = process.cwd();
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      console.log(pc.gray("No presets extended"));
      console.log(pc.gray("\nAdd presets to .agentsync/config.json:"));
      console.log(pc.cyan('  "extends": ["github:company/standards"]'));
      return;
    }

    // Load selections for display
    let selections: Record<
      string,
      import("../../types/index.js").PresetSelection
    > = {};
    try {
      selections = await loadSelectionsForProject(cwd);
    } catch {
      // Silently continue if selections can't be loaded
    }

    const cacheManager = new CacheManager();
    const parser = new GitHubSourceParser();

    for (const entry of extendsEntries) {
      console.log(pc.bold(entry.source));
      console.log(pc.gray(`  Namespace: ${entry.namespace}`));

      if (entry.include) {
        console.log(pc.gray(`  Include: ${entry.include.join(", ")}`));
      }
      if (entry.exclude) {
        console.log(pc.gray(`  Exclude: ${entry.exclude.join(", ")}`));
      }

      // Display selection information if available and verbose mode is on
      const selection = selections[entry.source];
      if (
        selection &&
        (options.verbose || Object.keys(selections).length > 0)
      ) {
        console.log(pc.cyan("  Selections:"));

        if (selection.rules) {
          const rulesText = selection.rules.include.join(", ");
          const excludeText = selection.rules.exclude
            ? ` (exclude: ${selection.rules.exclude.join(", ")})`
            : "";
          console.log(pc.cyan(`    Rules: ${rulesText}${excludeText}`));
        }

        if (selection.commands) {
          const commandsText = selection.commands.include.join(", ");
          const excludeText = selection.commands.exclude
            ? ` (exclude: ${selection.commands.exclude.join(", ")})`
            : "";
          console.log(pc.cyan(`    Commands: ${commandsText}${excludeText}`));
        }

        if (selection.mcps && selection.mcps.length > 0) {
          console.log(pc.cyan(`    MCPs: ${selection.mcps.join(", ")}`));
        }
      }

      // Check cache status
      const source = parser.parse(entry.source);
      const metadata = await cacheManager.getCacheMetadata(source);

      if (metadata.exists) {
        const sizeInMB = ((metadata.size || 0) / 1024 / 1024).toFixed(2);
        console.log(
          pc.green(
            `  ✓ Cached (${sizeInMB}MB, last updated: ${metadata.lastUpdated?.toLocaleDateString()})`
          )
        );
      } else {
        console.log(pc.yellow("  ⚠ Not cached (will be cloned on next sync)"));
      }

      console.log();
    }

    // Show selection summary if any selections exist and verbose mode is on
    const selectionCount = Object.keys(selections).length;
    if (selectionCount > 0 && options.verbose) {
      console.log(
        pc.cyan(
          `📋 ${selectionCount} preset${selectionCount === 1 ? "" : "s"} with interactive selections`
        )
      );
      console.log(
        pc.gray(
          "Use 'agentsync preset interactive-select' to manage selections"
        )
      );
      console.log(
        pc.gray("Use 'agentsync sync --selections' to sync with selections")
      );
      console.log();
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log(pc.red("✗ AgentSync not initialized"));
      console.log(pc.gray("\nRun: agentsync init"));
    } else {
      throw error;
    }
  }
}
