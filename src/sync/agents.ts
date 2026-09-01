/**
 * Agents Sync Module
 * Copies agent definitions from .agents/agents/ to each tool's agents directory
 * Uses provider.agentFileExtension for tool-specific file naming
 */

import { readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { ProjectedAgentFile, ToolProvider } from "../tools/types.js";
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

/** Result of syncing agents to a single tool */
export interface AgentSyncResult {
  tool: string;
  agentCount: number;
  agents: string[];
  warnings: string[];
}

interface AgentPlan {
  warnings: string[];
  plannedFiles: PlannedAgentFile[];
}

interface PlannedAgentFile extends ProjectedAgentFile {
  sourcePath: string;
  copyRequired: boolean;
  sameFile: boolean;
}

interface AgentSourceGroup {
  directories: string[];
  namespace?: string;
}

async function preflightAgentsPostHook(
  provider: ToolProvider,
  projectedFiles: ProjectedAgentFile[],
  cwd: string,
): Promise<void> {
  const hook = provider.agentsPostHook;
  if (!hook) return;
  hook.validate(projectedFiles);
  await hook.preflight(projectedFiles, cwd);
}

function uniqueAgentFiles<T extends ProjectedAgentFile>(
  projectedFiles: readonly T[],
): T[] {
  const byDestination = new Map<string, T>();
  for (const file of projectedFiles) {
    byDestination.set(file.relativePath, file);
  }
  return [...byDestination.values()];
}

async function unsupportedAgentsResult(
  provider: ToolProvider,
  projectAgentsDir: string,
  presetAgents: Map<string, string[]> | undefined,
  globalDirs: string[] | undefined,
): Promise<AgentSyncResult> {
  const count = await countMarkdownFiles([
    ...(globalDirs ?? []),
    ...flattenPresetDirs(presetAgents),
    projectAgentsDir,
  ]);
  return {
    tool: provider.name,
    agentCount: 0,
    agents: [],
    warnings:
      count > 0
        ? [unsupportedSurfaceWarning(provider.name, "agents", count)]
        : [],
  };
}

function agentDestination(
  provider: ToolProvider,
  targetDir: string,
  relativePath: string,
  namespace: string | undefined,
): { outputPath: string; relativePath: string } {
  let destination = withFlatNamespace(relativePath, namespace);
  if (provider.agentFileExtension !== ".md") {
    const parsed = path.parse(destination);
    destination = path.join(
      parsed.dir,
      `${parsed.name}${provider.agentFileExtension}`,
    );
  }
  return {
    outputPath: path.join(targetDir, destination),
    relativePath: destination,
  };
}

/**
 * Native agent identity derived from the complete projected destination.
 * Provider readers identify agents by frontmatter rather than file path, so
 * every nested segment participates in the name to keep recursive trees
 * distinct after projection.
 */
function projectedAgentIdentity(
  relativePath: string,
  extension: string,
): string {
  const withoutExtension = relativePath.endsWith(extension)
    ? relativePath.slice(0, -extension.length)
    : relativePath;
  return toPosixPath(withoutExtension).replaceAll("/", "--");
}

async function planAgentFile(
  provider: ToolProvider,
  targetDir: string,
  sourceDirectory: string,
  relativePath: string,
  namespace: string | undefined,
): Promise<{ file?: PlannedAgentFile; warnings: string[] }> {
  const sourcePath = path.join(sourceDirectory, relativePath);
  const destination = agentDestination(
    provider,
    targetDir,
    relativePath,
    namespace,
  );
  const warnings: string[] = [];
  let content = await readFile(sourcePath, "utf-8");
  if (namespace) {
    const sanitized = sanitizeContent(content, {
      source: `${namespace}/${relativePath}`,
    });
    content = sanitized.content;
    warnings.push(...sanitized.warnings);
  }
  const transform = provider.agentContentTransform;
  if (transform) {
    const result = transform.transform(
      content,
      projectedAgentIdentity(
        destination.relativePath,
        provider.agentFileExtension,
      ),
    );
    warnings.push(...result.warnings);
    if (result.skip) return { warnings };
    content = result.content;
  }
  return {
    warnings,
    file: {
      ...destination,
      content,
      sourcePath,
      copyRequired:
        namespace !== undefined ||
        provider.agentFileExtension !== ".md" ||
        transform !== undefined,
      sameFile:
        path.resolve(sourcePath) === path.resolve(destination.outputPath),
    },
  };
}

/**
 * Sync agents to a single tool
 */
async function planAgentsForTool(
  agentDirs: string[],
  provider: ToolProvider,
  cwd: string,
  namespace?: string,
): Promise<AgentPlan> {
  if (!provider.paths.agentsDir) {
    return {
      warnings: [],
      plannedFiles: [],
    };
  }

  const targetDir = path.join(cwd, provider.paths.agentsDir);
  const warnings: string[] = [];
  const plannedFiles: PlannedAgentFile[] = [];

  for (const agentDir of agentDirs) {
    if (!(await pathExists(agentDir))) continue;

    const files = (
      await fg("**/*.md", { cwd: agentDir, absolute: false })
    ).sort();

    for (const relPath of files) {
      const projection = await planAgentFile(
        provider,
        targetDir,
        agentDir,
        relPath,
        namespace,
      );
      warnings.push(...projection.warnings);
      if (projection.file) plannedFiles.push(projection.file);
    }
  }

  return {
    warnings,
    plannedFiles,
  };
}

function agentSourceGroups(
  projectAgentsDir: string,
  presetAgents: Map<string, string[]> | undefined,
  globalDirs: string[] | undefined,
): AgentSourceGroup[] {
  const groups: AgentSourceGroup[] = [];
  if (globalDirs?.length) groups.push({ directories: globalDirs });
  for (const [namespace, directories] of presetAgents ?? []) {
    validateSyncNamespace(namespace);
    groups.push({ directories, namespace });
  }
  groups.push({ directories: [projectAgentsDir] });
  return groups;
}

async function planAgentSources(
  provider: ToolProvider,
  cwd: string,
  groups: AgentSourceGroup[],
): Promise<AgentPlan> {
  const warnings: string[] = [];
  const plannedFiles: PlannedAgentFile[] = [];
  for (const group of groups) {
    const plan = await planAgentsForTool(
      group.directories,
      provider,
      cwd,
      group.namespace,
    );
    warnings.push(...plan.warnings);
    plannedFiles.push(...plan.plannedFiles);
  }
  return { warnings, plannedFiles };
}

async function writePlannedAgent(
  file: PlannedAgentFile,
  cwd: string,
  mode: NonNullable<SyncOptions["mode"]>,
): Promise<void> {
  if (file.sameFile) return;
  if (!file.copyRequired) {
    await writeFileByMode(file.sourcePath, file.outputPath, mode, cwd);
    return;
  }
  // outputFile follows an existing symlink. Remove the path first so changing
  // from link mode to a transformed/copy projection cannot modify the source.
  await assertSafeProjectOutputPath(cwd, file.outputPath);
  await rm(file.outputPath, { force: true });
  await outputFile(file.outputPath, file.content, { encoding: "utf-8" });
}

async function projectSupportedAgents(
  provider: ToolProvider,
  cwd: string,
  groups: AgentSourceGroup[],
  options: SyncOptions | undefined,
  write: boolean,
): Promise<AgentSyncResult> {
  const plan = await planAgentSources(provider, cwd, groups);
  const uniqueFiles = uniqueAgentFiles(plan.plannedFiles);
  await preflightAgentsPostHook(provider, uniqueFiles, cwd);
  if (write) {
    for (const file of uniqueFiles) {
      await writePlannedAgent(file, cwd, options?.mode ?? "copy");
    }
    if (provider.agentsPostHook) {
      plan.warnings.push(
        ...(await provider.agentsPostHook.postSync(uniqueFiles, cwd)).warnings,
      );
    }
  }
  return {
    tool: provider.name,
    agentCount: uniqueFiles.length,
    agents: uniqueFiles.map((file) => file.relativePath),
    warnings: plan.warnings,
  };
}

/**
 * Sync agents to all configured tools
 * Source: .agents/agents/
 */
async function projectAgents(
  providers: ToolProvider[],
  cwd: string,
  presetAgents?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
  write = true,
): Promise<AgentSyncResult[]> {
  const projectAgentsDir = path.join(cwd, ".agents", "agents");
  const results: AgentSyncResult[] = [];
  const sourceGroups = agentSourceGroups(
    projectAgentsDir,
    presetAgents,
    options?.globalDirs,
  );

  for (const provider of providers) {
    if (!(provider.capabilities.agents && provider.paths.agentsDir)) {
      results.push(
        await unsupportedAgentsResult(
          provider,
          projectAgentsDir,
          presetAgents,
          options?.globalDirs,
        ),
      );
      continue;
    }
    results.push(
      await projectSupportedAgents(provider, cwd, sourceGroups, options, write),
    );
  }

  return results;
}

export async function syncAgents(
  providers: ToolProvider[],
  cwd: string,
  presetAgents?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<AgentSyncResult[]> {
  return projectAgents(providers, cwd, presetAgents, options, true);
}

/** Read-only agent projection used by dry-run. */
export async function previewAgents(
  providers: ToolProvider[],
  cwd: string,
  presetAgents?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<AgentSyncResult[]> {
  return projectAgents(providers, cwd, presetAgents, options, false);
}
