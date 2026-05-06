/**
 * Commands Sync Module
 * Copies commands from .agents/commands/ to each tool's commands directory
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { ToolProvider } from "../tools/types.js";
import { outputFile, pathExists } from "../utils/fs.js";
import { validateSyncNamespace } from "../utils/path-normalization.js";
import { sanitizeContent } from "../utils/sanitize.js";
import { prependHeader } from "./header.js";
import type { SyncOptions } from "./skills.js";
import { writeFileByMode } from "./write-file.js";

/** Result of syncing commands to a single tool */
export interface CommandSyncResult {
  tool: string;
  commandCount: number;
  commands: string[];
  warnings: string[];
}

// writeFileByMode imported from ./write-file.js

/**
 * Sync commands to a single tool
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential sync with mode/namespace branching
async function syncCommandsToTool(
  commandDirs: string[],
  provider: ToolProvider,
  cwd: string,
  namespace?: string,
  options?: SyncOptions,
): Promise<CommandSyncResult> {
  if (!provider.paths.commandsDir) {
    return { tool: provider.name, commandCount: 0, commands: [], warnings: [] };
  }

  const targetDir = path.join(cwd, provider.paths.commandsDir);
  const commands: string[] = [];
  const warnings: string[] = [];

  for (const commandDir of commandDirs) {
    if (!(await pathExists(commandDir))) continue;

    const files = await fg("**/*.md", { cwd: commandDir, absolute: false });

    const mode = options?.mode || "copy";

    for (const relPath of files) {
      const sourcePath = path.join(commandDir, relPath);
      const destName = namespace ? path.join(namespace, relPath) : relPath;
      const destPath = path.join(targetDir, destName);

      // Skip if source and dest are the same file (tool reads .agents/ directly)
      if (path.resolve(sourcePath) === path.resolve(destPath)) {
        commands.push(destName);
        continue;
      }

      // Namespaced (preset) content needs sanitization — always copy
      if (namespace) {
        let content = await readFile(sourcePath, "utf-8");
        const sanitized = sanitizeContent(content, {
          source: `${namespace}/${relPath}`,
        });
        content = sanitized.content;
        warnings.push(...sanitized.warnings);
        const presetLabel = `preset:${namespace}/${relPath}`;
        content = prependHeader(content, presetLabel);
        await outputFile(destPath, content, { encoding: "utf-8" });
      } else {
        const sourceLabel = path.relative(cwd, sourcePath);
        await writeFileByMode(sourcePath, destPath, mode, sourceLabel);
      }

      commands.push(destName);
    }
  }

  return {
    tool: provider.name,
    commandCount: commands.length,
    commands,
    warnings,
  };
}

/**
 * Sync commands to all configured tools
 * Source: .agents/commands/
 */
export async function syncCommands(
  providers: ToolProvider[],
  cwd: string,
  presetCommands?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<CommandSyncResult[]> {
  const projectCommandsDir = path.join(cwd, ".agents", "commands");
  const results: CommandSyncResult[] = [];

  for (const provider of providers) {
    if (!provider.capabilities.commands) {
      results.push({
        tool: provider.name,
        commandCount: 0,
        commands: [],
        warnings: [],
      });
      continue;
    }

    let totalCommands = 0;
    const allCommands: string[] = [];
    const allWarnings: string[] = [];

    // Global user commands first (lowest priority — can be overwritten by presets and project)
    if (options?.globalDirs && options.globalDirs.length > 0) {
      const globalResult = await syncCommandsToTool(
        options.globalDirs,
        provider,
        cwd,
        undefined,
        options,
      );
      totalCommands += globalResult.commandCount;
      allCommands.push(...globalResult.commands);
      allWarnings.push(...globalResult.warnings);
    }

    // Preset commands next (middle priority — can be overwritten by project)
    if (presetCommands) {
      for (const [namespace, dirs] of presetCommands) {
        validateSyncNamespace(namespace);
        const presetResult = await syncCommandsToTool(
          dirs,
          provider,
          cwd,
          namespace,
          options,
        );
        totalCommands += presetResult.commandCount;
        allCommands.push(...presetResult.commands);
        allWarnings.push(...presetResult.warnings);
      }
    }

    // Project custom commands last (highest priority — wins on collision)
    const projectResult = await syncCommandsToTool(
      [projectCommandsDir],
      provider,
      cwd,
      undefined,
      options,
    );

    totalCommands += projectResult.commandCount;
    allCommands.push(...projectResult.commands);

    results.push({
      tool: provider.name,
      commandCount: totalCommands,
      commands: allCommands,
      warnings: allWarnings,
    });
  }

  return results;
}
