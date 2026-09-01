/**
 * Clean Command
 * Removes all synced/generated files from tool directories.
 * Inverse of `agentsync sync` — useful for cleanup, fresh starts, or debugging.
 */

import * as path from "node:path";
import type { ToolName } from "../constants.js";
import { loadConfigHierarchy } from "../core/config/hierarchy.js";
import {
  discoverProviderStateOwners,
  extensionArtifactDependency,
  manifestOwnedToolNames,
  pruneEmptyOwnedParents,
  pruneMissingManifestEntries,
  readManifest,
  removeHashOwnedFile,
  type SyncManifest,
  type ValidatedOwnedFile,
  validatedOwnedFiles,
} from "../sync/manifest.js";
import { reconcileMcpOwnership } from "../sync/mcp.js";
import { applyStructuredLifecyclePlan } from "../sync/structured-lifecycle.js";
import { planToolStructuredLifecycle } from "../sync/structured-providers.js";
import type { StructuredConfigPlan } from "../sync/structured-state.js";
import { getToolProvider } from "../tools/index.js";
import type { ProviderCleanResult, ToolProvider } from "../tools/types.js";

/**
 * Result of cleaning a single tool's generated files
 */
export interface CleanResult {
  tool: string;
  removedFiles: string[];
  removedDirs: string[];
  /**
   * Shared config files AgentSync edited rather than deleted, because the tool
   * (and usually the user) owns the rest of the file.
   */
  modifiedFiles: string[];
  /** Generated state preserved because exact removal authority was absent. */
  warnings: string[];
}

/**
 * Clean command options
 */
export interface CleanOptions {
  cwd?: string;
  dryRun?: boolean;
}

/**
 * Collect the generated file/directory paths for a tool provider.
 * Returns separate lists of files and directories that would be removed.
 */
async function cleanManifestOwnedFiles(
  provider: ToolProvider,
  cwd: string,
  manifest: SyncManifest | undefined,
  dryRun: boolean,
  handledPaths: ReadonlySet<string> = new Set(),
  protectedDependencies: ReadonlySet<string> = new Set(),
): Promise<{
  files: string[];
  dirs: string[];
  warnings: string[];
  relinquishedPaths: string[];
}> {
  const validation = validatedOwnedFiles(cwd, provider, manifest);
  const owned = validation.files.filter(
    (file) => !handledPaths.has(file.relativePath),
  );
  const removedFiles: string[] = [];
  const pruneCandidates = new Map<string, string>();
  const rejected = validation.rejected.filter(
    (relativePath) => !handledPaths.has(relativePath),
  );
  const warnings = rejected.map(
    (relativePath) =>
      `[${provider.name}] preserved unsafe manifest-owned output ${relativePath} and relinquished AgentSync ownership; review or remove it manually`,
  );
  const relinquishedPaths = [...rejected];

  for (const file of owned) {
    const effect = await cleanManifestOwnedFile(
      provider,
      file,
      cwd,
      dryRun,
      protectedDependencies,
    );
    if (effect.removed) removedFiles.push(file.absolutePath);
    if (effect.warning) warnings.push(effect.warning);
    if (effect.relinquished) relinquishedPaths.push(file.relativePath);
    if (effect.prune) {
      pruneCandidates.set(path.dirname(file.absolutePath), file.absoluteRoot);
    }
  }

  const removedDirs: string[] = [];
  for (const [directory, root] of pruneCandidates) {
    removedDirs.push(
      ...(await pruneEmptyOwnedParents(cwd, directory, root, false)),
    );
  }
  return {
    files: [...new Set(removedFiles)],
    dirs: [...new Set(removedDirs)],
    warnings,
    relinquishedPaths,
  };
}

async function cleanManifestOwnedFile(
  provider: ToolProvider,
  file: ValidatedOwnedFile,
  cwd: string,
  dryRun: boolean,
  protectedDependencies: ReadonlySet<string>,
): Promise<{
  removed?: true;
  prune?: true;
  relinquished?: true;
  warning?: string;
}> {
  const dependency = extensionArtifactDependency(provider, file.relativePath);
  const action = dryRun
    ? "would preserve it and relinquish AgentSync ownership"
    : "preserved it and relinquished AgentSync ownership";
  if (dependency && protectedDependencies.has(dependency)) {
    return {
      relinquished: true,
      warning: `[${provider.name}] ${action}: ${file.relativePath} is required by preserved structured config; review or remove it manually`,
    };
  }
  const outcome = await removeHashOwnedFile(cwd, file, dryRun);
  if (outcome === "removed") {
    return dryRun ? { removed: true } : { removed: true, prune: true };
  }
  if (outcome === "modified" || outcome === "unsafe") {
    return {
      relinquished: true,
      warning: `[${provider.name}] ${action}: ${file.relativePath} is ${outcome}; review or remove it manually`,
    };
  }
  return {};
}

function emptyProviderCleanResult(): ProviderCleanResult {
  return {
    removedFiles: [],
    removedDirs: [],
    modifiedFiles: [],
    warnings: [],
    handledManifestPaths: [],
    relinquishedManifestPaths: [],
  };
}

/**
 * Remove generated files and directories for all configured tools.
 * Returns a list of what was removed per tool.
 */
/**
 * Clean generated files for a single tool provider.
 */
async function cleanTool(
  toolName: ToolName,
  cwd: string,
  dryRun: boolean,
  manifest: SyncManifest | undefined,
  relinquishedManifestPaths: Set<string>,
  relinquishedMcpTools: Set<string>,
  protectedDependencies: ReadonlySet<string>,
  structuredWarnings: readonly string[],
  structuredConfigs: readonly StructuredConfigPlan[],
): Promise<CleanResult> {
  const provider = getToolProvider(toolName);
  const providerClean = provider.cleanGeneratedState
    ? await provider.cleanGeneratedState(cwd, dryRun)
    : emptyProviderCleanResult();
  for (const relativePath of providerClean.relinquishedManifestPaths) {
    relinquishedManifestPaths.add(relativePath);
  }
  const manifestOwned = await cleanManifestOwnedFiles(
    provider,
    cwd,
    manifest,
    dryRun,
    new Set(providerClean.handledManifestPaths),
    protectedDependencies,
  );
  for (const relativePath of manifestOwned.relinquishedPaths) {
    relinquishedManifestPaths.add(relativePath);
  }
  const mcp = await reconcileMcpOwnership(
    provider,
    manifest?.mcp_owners?.[toolName],
    cwd,
    dryRun,
  );
  if (mcp.relinquished) relinquishedMcpTools.add(toolName);
  const removedFiles = [
    ...structuredConfigs
      .filter((config) => config.action === "delete")
      .map((config) => config.absolutePath),
    ...providerClean.removedFiles,
    ...manifestOwned.files,
    ...mcp.removedFiles,
  ];
  const removedFileSet = new Set(removedFiles);

  return {
    tool: toolName,
    removedFiles: [...removedFileSet],
    removedDirs: [
      ...new Set([...providerClean.removedDirs, ...manifestOwned.dirs]),
    ],
    modifiedFiles: [
      ...new Set(
        [
          ...providerClean.modifiedFiles,
          ...mcp.modifiedFiles,
          ...structuredConfigs
            .filter((config) => config.action === "write")
            .map((config) => config.absolutePath),
        ].filter((filePath) => !removedFileSet.has(filePath)),
      ),
    ],
    warnings: [
      ...structuredWarnings,
      ...providerClean.warnings,
      ...manifestOwned.warnings,
      ...mcp.warnings,
    ],
  };
}

export async function cleanCommand(
  options: CleanOptions = {},
): Promise<CleanResult[]> {
  const cwd = options.cwd || process.cwd();
  const dryRun = options.dryRun ?? false;

  const config = await loadConfigHierarchy(cwd);
  const configuredTools: ToolName[] = config.tools || [];

  const manifest = await readManifest(cwd);
  const discoveredStateOwners = await discoverProviderStateOwners(cwd);
  const tools = [
    ...new Set([
      ...configuredTools,
      ...manifestOwnedToolNames(manifest),
      ...discoveredStateOwners,
    ]),
  ];
  const rejectedManifestPaths = tools.flatMap(
    (toolName) =>
      validatedOwnedFiles(cwd, getToolProvider(toolName), manifest).rejected,
  );
  const relinquishedManifestPaths = new Set<string>();
  const relinquishedMcpTools = new Set<string>();
  const structuredLifecycle = await planToolStructuredLifecycle({
    cwd,
    providers: tools.map(getToolProvider),
    previousReceipts: manifest?.structured_owners,
    preserveUnselected: false,
  });
  const appliedStructured = await applyStructuredLifecyclePlan(
    structuredLifecycle,
    { dryRun },
  );
  const structuredByTool = new Map(
    appliedStructured.plan.providers.map((provider) => [
      provider.tool,
      provider,
    ]),
  );
  const results = await Promise.all(
    tools.map((toolName) => {
      const structured = structuredByTool.get(toolName);
      return cleanTool(
        toolName,
        cwd,
        dryRun,
        manifest,
        relinquishedManifestPaths,
        relinquishedMcpTools,
        new Set(structured?.protectedDependencies ?? []),
        structured?.warnings ?? [],
        structured?.configs ?? [],
      );
    }),
  );
  if (!dryRun) {
    const currentProviderStateOwners = await discoverProviderStateOwners(cwd);
    await pruneMissingManifestEntries(
      cwd,
      [...rejectedManifestPaths, ...relinquishedManifestPaths],
      relinquishedMcpTools,
      currentProviderStateOwners,
      appliedStructured.plan.nextReceipts,
    );
  }
  return results;
}
