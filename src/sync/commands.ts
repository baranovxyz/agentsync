/**
 * Commands Sync Module
 * Copies commands from .agents/commands/ to each tool's commands directory
 */

import { readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { ContentTransformResult, ToolProvider } from "../tools/types.js";
import { outputFile, pathExists } from "../utils/fs.js";
import {
  toPosixPath,
  validateSyncNamespace,
  withFlatNamespace,
} from "../utils/path-normalization.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import { sanitizeContent } from "../utils/sanitize.js";
import type { SyncOptions } from "./skills.js";
import { countMarkdownFiles, flattenPresetDirs } from "./source-count.js";
import { unsupportedSurfaceWarning } from "./surface-warning.js";
import { writeFileByMode } from "./write-file.js";

/** Result of syncing commands to a single tool */
export interface CommandSyncResult {
  tool: string;
  commandCount: number;
  commands: string[];
  warnings: string[];
}

async function unsupportedCommandsResult(
  provider: ToolProvider,
  projectCommandsDir: string,
  presetCommands: Map<string, string[]> | undefined,
  globalDirs: string[] | undefined,
): Promise<CommandSyncResult> {
  const count = await countMarkdownFiles([
    ...(globalDirs ?? []),
    ...flattenPresetDirs(presetCommands),
    projectCommandsDir,
  ]);
  return {
    tool: provider.name,
    commandCount: 0,
    commands: [],
    warnings:
      count > 0
        ? [unsupportedSurfaceWarning(provider.name, "commands", count)]
        : [],
  };
}

function projectedCommandIdentity(destination: string): string {
  return toPosixPath(destination).replace(/\.md$/u, "").replaceAll("/", "--");
}

async function projectCommandContent(
  sourcePath: string,
  sourceLabel: string,
  destination: string,
  provider: ToolProvider,
  namespace: string | undefined,
): Promise<ContentTransformResult | undefined> {
  const transform = provider.commandContentTransform;
  if (!(namespace || transform)) return undefined;

  let content = await readFile(sourcePath, "utf-8");
  const warnings: string[] = [];
  if (namespace) {
    const sanitized = sanitizeContent(content, { source: sourceLabel });
    content = sanitized.content;
    warnings.push(...sanitized.warnings);
  }
  if (!transform) return { content, warnings };

  const transformed = transform.transform(
    content,
    projectedCommandIdentity(destination),
  );
  const combinedWarnings = [...warnings, ...transformed.warnings];
  return transformed.skip
    ? { skip: true, warnings: combinedWarnings }
    : { content: transformed.content, warnings: combinedWarnings };
}

async function writeCommandCopy(
  cwd: string,
  destination: string,
  content: string,
): Promise<void> {
  await assertSafeProjectOutputPath(cwd, destination);
  await rm(destination, { force: true });
  await outputFile(destination, content, { encoding: "utf-8" });
}

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
  write = true,
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
      const destName = withFlatNamespace(relPath, namespace);
      const destPath = path.join(targetDir, destName);

      // Skip if source and dest are the same file (tool reads .agents/ directly)
      if (path.resolve(sourcePath) === path.resolve(destPath)) {
        commands.push(destName);
        continue;
      }

      const projection = await projectCommandContent(
        sourcePath,
        namespace ? `${namespace}/${relPath}` : relPath,
        destName,
        provider,
        namespace,
      );
      if (projection) {
        warnings.push(...projection.warnings);
        if (projection.skip) continue;
      }

      if (write && projection) {
        await writeCommandCopy(cwd, destPath, projection.content);
      } else if (write) {
        await writeFileByMode(sourcePath, destPath, mode, cwd);
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
async function projectCommands(
  providers: ToolProvider[],
  cwd: string,
  presetCommands?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
  write = true,
): Promise<CommandSyncResult[]> {
  const projectCommandsDir = path.join(cwd, ".agents", "commands");
  const results: CommandSyncResult[] = [];

  for (const provider of providers) {
    if (!(provider.capabilities.commands && provider.paths.commandsDir)) {
      results.push(
        await unsupportedCommandsResult(
          provider,
          projectCommandsDir,
          presetCommands,
          options?.globalDirs,
        ),
      );
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
        write,
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
          write,
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
      write,
    );

    totalCommands += projectResult.commandCount;
    allCommands.push(...projectResult.commands);
    allWarnings.push(...projectResult.warnings);

    results.push({
      tool: provider.name,
      commandCount: totalCommands,
      commands: allCommands,
      warnings: allWarnings,
    });
  }

  return results;
}

export async function syncCommands(
  providers: ToolProvider[],
  cwd: string,
  presetCommands?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<CommandSyncResult[]> {
  return projectCommands(providers, cwd, presetCommands, options, true);
}

/** Read-only command projection used by dry-run. */
export async function previewCommands(
  providers: ToolProvider[],
  cwd: string,
  presetCommands?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<CommandSyncResult[]> {
  return projectCommands(providers, cwd, presetCommands, options, false);
}
