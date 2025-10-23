/**
 * List extended presets command
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import picocolors from "picocolors";
import { CacheManager } from "../../core/registry/cache-manager.js";
import { GitHubSourceParser } from "../../core/registry/github-source.js";
import { validateConfig } from "../../types/schemas.js";

const pc = picocolors;

export interface ListPresetsOptions {
  verbose?: boolean;
}

export async function listPresets(
  options: ListPresetsOptions = {},
): Promise<void> {
  console.log(pc.blue("📚 Extended Presets\n"));

  const cwd = process.cwd();
  const configPath = path.join(cwd, ".agentsync", "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    const config = validateConfig(JSON.parse(configContent));
    const extendsEntries = config.extends || [];

    if (extendsEntries.length === 0) {
      console.log(pc.gray("No presets extended"));
      console.log(pc.gray("\nAdd presets to .agentsync/config.json:"));
      console.log(pc.cyan('  "extends": ["github:company/standards"]'));
      return;
    }

    // Load local config if exists
    const localConfigPath = path.join(cwd, "agentsync.local.json");
    let localConfig = { extends: [] };
    try {
      const localContent = await readFile(localConfigPath, "utf-8");
      localConfig = JSON.parse(localContent);
    } catch (_error) {
      // Local config doesn't exist, continue with empty extends
    }

    // Merge extends arrays
    const allExtends = [...extendsEntries, ...(localConfig.extends || [])];

    const cacheManager = new CacheManager();
    const parser = new GitHubSourceParser();

    for (const entry of allExtends) {
      const source = typeof entry === "string" ? entry : entry.source;
      const namespace = typeof entry === "string" ? "" : entry.namespace;
      const selection = typeof entry === "object" ? entry.select : undefined;

      console.log(pc.bold(source));
      if (namespace) {
        console.log(pc.gray(`  Namespace: ${namespace}`));
      }

      // Display selection information if available
      if (selection && (options.verbose || Object.keys(selection).length > 0)) {
        console.log(pc.cyan("  Selections:"));

        if (selection.rules?.include) {
          const rulesText = selection.rules.include.join(", ");
          const excludeText = selection.rules.exclude
            ? ` (exclude: ${selection.rules.exclude.join(", ")})`
            : "";
          console.log(pc.cyan(`    Rules: ${rulesText}${excludeText}`));
        }

        if (selection.commands?.include) {
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
      const sourceObj = parser.parse(source);
      const metadata = await cacheManager.getCacheMetadata(sourceObj);

      if (metadata.exists) {
        const sizeInMB = ((metadata.size || 0) / 1024 / 1024).toFixed(2);
        console.log(
          pc.green(
            `  ✓ Cached (${sizeInMB}MB, last updated: ${metadata.lastUpdated?.toLocaleDateString()})`,
          ),
        );
      } else {
        console.log(pc.yellow("  ⚠ Not cached (will be cloned on next sync)"));
      }

      console.log();
    }

    // Show selection summary if any selections exist and verbose mode is on
    const selectionCount = allExtends.filter(
      (e) =>
        typeof e === "object" && e.select && Object.keys(e.select).length > 0,
    ).length;

    if (selectionCount > 0 && options.verbose) {
      console.log(
        pc.cyan(
          `📋 ${selectionCount} preset${selectionCount === 1 ? "" : "s"} with interactive selections`,
        ),
      );
      console.log(
        pc.gray(
          "Use 'agentsync preset interactive-select' to manage selections",
        ),
      );
      console.log(
        pc.gray("Use 'agentsync sync --selections' to sync with selections"),
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
