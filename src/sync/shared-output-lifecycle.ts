import * as path from "node:path";
import fg from "fast-glob";
import { isToolName } from "../constants.js";
import { ConfigError } from "../core/errors.js";
import { getToolProvider } from "../tools/index.js";
import type { ToolProvider } from "../tools/types.js";
import type { SyncToolDetail } from "../types/output.js";
import { previewAgents } from "./agents.js";
import { previewCommands } from "./commands.js";
import { type DocsSyncResult, previewDocs } from "./docs.js";
import { type ExtensionsSyncResult, previewExtensions } from "./extensions.js";
import {
  discoverProviderStateOwners,
  extensionArtifactDependency,
  inspectManagedWrite,
  type McpOwnership,
  pruneEmptyOwnedParents,
  removeHashOwnedFile,
  type SyncManifest,
  type ValidatedOwnedFile,
  validatedOwnedFiles,
  validatePlannedOwnedPaths,
  writeOwnedManifest,
} from "./manifest.js";
import type { SyncPlan } from "./plan.js";
import { previewRules } from "./rules.js";
import { previewSkills } from "./skills.js";
import type {
  StructuredProtectedDependenciesByProvider,
  StructuredReceiptsByProvider,
} from "./structured-lifecycle.js";

interface SkillSource {
  directory: string;
  namespace?: string;
}

function presetSkillSources(
  presetSkills: ReadonlyMap<string, string[]> | undefined,
): SkillSource[] {
  return [...(presetSkills ?? [])].flatMap(([namespace, directories]) =>
    directories.map((directory) => ({ directory, namespace })),
  );
}

function skillSources(
  plan: SyncPlan,
  provider: ToolProvider,
  cwd: string,
): SkillSource[] {
  const presets = presetSkillSources(plan.presetSkills);
  return provider.capabilities.nativeSkillsDiscovery
    ? presets
    : [
        ...plan.hierarchySkillDirs.map((directory) => ({ directory })),
        ...presets,
        { directory: path.join(cwd, ".agents", "skills") },
      ];
}

/** Include SKILL.md and every copied nested support file. */
async function collectSkillFiles(
  plan: SyncPlan,
  provider: ToolProvider,
  acceptedNames: readonly string[],
  cwd: string,
): Promise<string[]> {
  const destinationRoot = provider.capabilities.nativeSkillsDiscovery
    ? provider.paths.generatedPresetSkillsDir
    : provider.paths.skillsDir;
  if (!destinationRoot || acceptedNames.length === 0) return [];

  const accepted = new Set(acceptedNames);
  const files = new Set<string>();
  for (const source of skillSources(plan, provider, cwd)) {
    const entryPoints = await fg("*/SKILL.md", {
      cwd: source.directory,
      absolute: false,
      onlyFiles: true,
    });
    for (const entryPoint of entryPoints) {
      const sourceName = path.dirname(entryPoint);
      const destinationName = source.namespace
        ? `${source.namespace}--${sourceName}`
        : sourceName;
      if (!accepted.has(destinationName)) continue;
      const relativePaths = await fg("**/*", {
        cwd: path.join(source.directory, sourceName),
        absolute: false,
        onlyFiles: true,
      });
      for (const relativePath of relativePaths) {
        files.add(
          path.join(cwd, destinationRoot, destinationName, relativePath),
        );
      }
    }
  }
  return [...files];
}

function mapDirectFiles(
  cwd: string,
  directory: string | null,
  names: readonly string[],
): string[] {
  return directory ? names.map((name) => path.join(cwd, directory, name)) : [];
}

function mapRuleFiles(
  cwd: string,
  provider: ToolProvider,
  names: readonly string[],
): string[] {
  const output = provider.rulesFormat?.fileOutput;
  return output
    ? names.map((name) =>
        path.join(cwd, output.root, `${name}${output.extension}`),
      )
    : [];
}

function indexByTool<T extends { tool: string }>(
  results: readonly T[],
): Map<string, T> {
  return new Map(results.map((result) => [result.tool, result]));
}

/** Reconstruct exact output files by provider, not just skill entry points. */
async function collectWrittenFiles(
  plan: SyncPlan,
  details: readonly SyncToolDetail[],
  docsResults: readonly DocsSyncResult[],
  extensionResults: readonly ExtensionsSyncResult[],
  cwd: string,
): Promise<Map<string, string[]>> {
  const providers = new Map<string, ToolProvider>(
    plan.providers.map((provider) => [provider.name, provider]),
  );
  const docsByTool = indexByTool(docsResults);
  const extensionsByTool = indexByTool(extensionResults);
  const filesByTool = new Map<string, string[]>();

  for (const detail of details) {
    const provider = providers.get(detail.tool);
    if (!provider) continue;
    const files = [
      ...(await collectSkillFiles(plan, provider, detail.skills, cwd)),
      ...mapDirectFiles(cwd, provider.paths.commandsDir, detail.commands),
      ...mapDirectFiles(cwd, provider.paths.agentsDir, detail.agents),
      ...mapRuleFiles(cwd, provider, detail.rules ?? []),
      ...(provider.docsFormat && docsByTool.get(provider.name)?.created
        ? [path.join(cwd, provider.paths.docsFile)]
        : []),
      ...(extensionsByTool.get(provider.name)?.generatedFiles ?? []),
    ];
    const mcpPath = provider.paths.mcpConfigPath;
    if (
      detail.mcp.length > 0 &&
      mcpPath &&
      provider.mcpFormat?.ownership.kind === "whole-file"
    ) {
      files.push(path.join(cwd, mcpPath));
    }
    filesByTool.set(provider.name, [...new Set(files)]);
  }
  return filesByTool;
}

/** Protected config dependencies cannot be reacquired as file ownership. */
function excludeProtectedArtifactFiles(
  plan: SyncPlan,
  filesByTool: ReadonlyMap<string, readonly string[]>,
  cwd: string,
  protectedDependencies: StructuredProtectedDependenciesByProvider,
): Map<string, string[]> {
  const providers = new Map<string, ToolProvider>(
    plan.providers.map((provider) => [provider.name, provider]),
  );
  return new Map(
    [...filesByTool].map(([tool, files]) => {
      const provider = providers.get(tool);
      if (!provider) return [tool, [...files]];
      const protectedForTool = new Set(
        protectedDependencies[provider.name] ?? [],
      );
      return [
        tool,
        files.filter((file) => {
          const dependency = extensionArtifactDependency(
            provider,
            path.relative(cwd, file).split(path.sep).join("/"),
          );
          return !(dependency && protectedForTool.has(dependency));
        }),
      ];
    }),
  );
}

function isDescendant(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative !== "" &&
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function sharedOutputRoots(provider: ToolProvider, cwd: string): string[] {
  const surfaces = new Set(provider.manifestCleanSurfaces);
  const skillsRoot = provider.capabilities.nativeSkillsDiscovery
    ? provider.paths.generatedPresetSkillsDir
    : provider.paths.skillsDir;
  const roots = [
    surfaces.has("skills") ? skillsRoot : null,
    surfaces.has("commands") ? provider.paths.commandsDir : null,
    surfaces.has("agents") ? provider.paths.agentsDir : null,
    surfaces.has("rules") ? provider.rulesFormat?.fileOutput?.root : null,
    ...(surfaces.has("extension-files")
      ? (provider.extensionFileOutputs ?? []).flatMap((output) =>
          output.kind === "tree" ? [output.root] : [],
        )
      : []),
  ];
  return roots.flatMap((root) => (root ? [path.join(cwd, root)] : []));
}

function sharedExactFiles(provider: ToolProvider, cwd: string): Set<string> {
  const surfaces = new Set(provider.manifestCleanSurfaces);
  return new Set([
    ...(surfaces.has("docs") && provider.docsFormat
      ? [path.resolve(cwd, provider.paths.docsFile)]
      : []),
    ...(surfaces.has("extension-files")
      ? (provider.extensionFileOutputs ?? []).flatMap((output) =>
          output.kind === "exact" ? [path.resolve(cwd, output.path)] : [],
        )
      : []),
  ]);
}

function sharedFiles(
  provider: ToolProvider,
  cwd: string,
  filesByTool: ReadonlyMap<string, readonly string[]>,
): string[] {
  const roots = sharedOutputRoots(provider, cwd);
  const exactFiles = sharedExactFiles(provider, cwd);
  return (filesByTool.get(provider.name) ?? []).filter(
    (file) =>
      exactFiles.has(path.resolve(file)) ||
      roots.some((root) => isDescendant(root, file)),
  );
}

function previewDetails(
  providers: readonly ToolProvider[],
  results: {
    skills: readonly { tool: string; skills: string[] }[];
    commands: readonly { tool: string; commands: string[] }[];
    agents: readonly { tool: string; agents: string[] }[];
    rules: readonly { tool: string; rules: string[] }[];
  },
): SyncToolDetail[] {
  const skills = indexByTool(results.skills);
  const commands = indexByTool(results.commands);
  const agents = indexByTool(results.agents);
  const rules = indexByTool(results.rules);
  return providers.map((provider) => ({
    tool: provider.name,
    skills: skills.get(provider.name)?.skills ?? [],
    commands: commands.get(provider.name)?.commands ?? [],
    agents: agents.get(provider.name)?.agents ?? [],
    rules: rules.get(provider.name)?.rules ?? [],
    mcp: [],
  }));
}

async function previewSharedOutputFiles(
  plan: SyncPlan,
  cwd: string,
  protectedDependencies: StructuredProtectedDependenciesByProvider,
): Promise<Map<string, string[]>> {
  const providers = plan.providers.filter(
    (provider) => provider.manifestCleanSurfaces.length > 0,
  );
  if (providers.length === 0) return new Map();
  const [skills, commands, agents, rules, docs, extensions] = await Promise.all(
    [
      previewSkills(providers, cwd, plan.presetSkills, {
        globalDirs: plan.hierarchySkillDirs,
      }),
      previewCommands(providers, cwd, plan.presetCommands, {
        globalDirs: plan.hierarchyCommandDirs,
      }),
      previewAgents(providers, cwd, plan.presetAgents, {
        globalDirs: plan.hierarchyAgentDirs,
      }),
      previewRules(providers, cwd),
      previewDocs(providers, cwd),
      previewExtensions(providers, plan.extensions, cwd, {
        protectedDependencies,
      }),
    ],
  );
  return collectWrittenFiles(
    plan,
    previewDetails(providers, { skills, commands, agents, rules }),
    docs,
    extensions,
    cwd,
  );
}

function managedWriteRecovery(
  state: "unowned" | "modified" | "unsafe",
): string {
  if (state === "modified") {
    return "Restore the last synced content, or move the edited file before syncing so AgentSync does not overwrite your changes.";
  }
  if (state === "unsafe") {
    return "Replace symlinked provider directories with real project directories, then retry.";
  }
  return "Move or rename the hand-authored file, or choose a different canonical name before syncing.";
}

async function assertProviderSharedOutputsWritable(
  provider: ToolProvider,
  candidates: readonly string[],
  cwd: string,
  manifest: SyncManifest | undefined,
): Promise<void> {
  const validation = validatePlannedOwnedPaths(cwd, provider, candidates);
  if (validation.rejected.length > 0) {
    throw new ConfigError(
      `Refusing unsafe ${provider.name} output path`,
      validation.rejected[0],
      "Keep generated output inside the provider's declared file layout.",
    );
  }
  for (const relativePath of validation.valid) {
    const state = await inspectManagedWrite(
      cwd,
      provider,
      relativePath,
      manifest,
    );
    if (state === "absent" || state === "owned") continue;
    throw new ConfigError(
      `Refusing to overwrite ${state} shared output`,
      relativePath,
      managedWriteRecovery(state),
    );
  }
}

async function reconcileStaleFile(
  provider: ToolProvider,
  file: ValidatedOwnedFile,
  cwd: string,
  dryRun: boolean,
  protectedDependencies: ReadonlySet<string>,
): Promise<{ warning?: string; prune?: true }> {
  const dependency = extensionArtifactDependency(provider, file.relativePath);
  if (dependency && protectedDependencies.has(dependency)) {
    return {
      warning: `[${provider.name}] ${dryRun ? "would preserve" : "preserved"} dependent output ${file.relativePath} after related structured config was preserved; relinquished AgentSync file ownership`,
    };
  }
  const outcome = await removeHashOwnedFile(cwd, file, dryRun);
  if (outcome === "removed" || outcome === "missing") {
    return dryRun ? {} : { prune: true };
  }
  return {
    warning: `[${provider.name}] ${dryRun ? "would preserve" : "preserved"} stale ${outcome} output ${file.relativePath}; remove it manually after reviewing its contents`,
  };
}

async function reconcileProviderStaleFiles(
  provider: ToolProvider,
  currentFiles: ReadonlyMap<string, readonly string[]>,
  cwd: string,
  manifest: SyncManifest,
  dryRun: boolean,
  handledPaths: ReadonlySet<string>,
  protectedDependencies: ReadonlySet<string>,
): Promise<string[]> {
  const previous = validatedOwnedFiles(cwd, provider, manifest);
  const warnings = previous.rejected
    .filter((relativePath) => !handledPaths.has(relativePath))
    .map(
      (relativePath) =>
        `[${provider.name}] ignored unsafe manifest ownership path ${relativePath}`,
    );
  const desired = new Set(
    validatePlannedOwnedPaths(
      cwd,
      provider,
      sharedFiles(provider, cwd, currentFiles),
    ).valid,
  );
  const pruneCandidates = new Map<string, string>();

  for (const file of previous.files) {
    if (handledPaths.has(file.relativePath) || desired.has(file.relativePath)) {
      continue;
    }
    const effect = await reconcileStaleFile(
      provider,
      file,
      cwd,
      dryRun,
      protectedDependencies,
    );
    if (effect.warning) warnings.push(effect.warning);
    if (effect.prune) {
      pruneCandidates.set(path.dirname(file.absolutePath), file.absoluteRoot);
    }
  }
  for (const [directory, root] of pruneCandidates) {
    await pruneEmptyOwnedParents(cwd, directory, root, false);
  }
  return warnings;
}

function lifecycleToolNames(
  plan: SyncPlan,
  manifest: SyncManifest,
  filtered: boolean,
): string[] {
  return filtered
    ? plan.providers.map((provider) => provider.name)
    : [
        ...new Set([
          ...plan.providers.map((provider) => provider.name),
          ...Object.keys(manifest.owners ?? {}),
        ]),
      ];
}

async function reconcileStaleSharedOutputs(
  plan: SyncPlan,
  currentFiles: ReadonlyMap<string, readonly string[]>,
  cwd: string,
  manifest: SyncManifest | undefined,
  filtered: boolean,
  dryRun: boolean,
  handledPaths: ReadonlyMap<string, ReadonlySet<string>>,
  protectedDependencies: StructuredProtectedDependenciesByProvider,
): Promise<string[]> {
  if (!manifest?.owners) return [];
  const warnings: string[] = [];
  for (const toolName of lifecycleToolNames(plan, manifest, filtered)) {
    if (!isToolName(toolName)) continue;
    const provider = getToolProvider(toolName);
    if (provider.manifestCleanSurfaces.length === 0) continue;
    warnings.push(
      ...(await reconcileProviderStaleFiles(
        provider,
        currentFiles,
        cwd,
        manifest,
        dryRun,
        handledPaths.get(provider.name) ?? new Set(),
        new Set(protectedDependencies[provider.name] ?? []),
      )),
    );
  }
  return warnings;
}

interface ProviderStateCleanup {
  warnings: string[];
  handledPaths: Map<string, ReadonlySet<string>>;
}

async function reconcileRemovedProviderState(
  plan: SyncPlan,
  cwd: string,
  filtered: boolean,
  dryRun: boolean,
): Promise<ProviderStateCleanup> {
  const cleanup: ProviderStateCleanup = {
    warnings: [],
    handledPaths: new Map(),
  };
  if (filtered) return cleanup;

  const selected = new Set(plan.providers.map((provider) => provider.name));
  for (const toolName of await discoverProviderStateOwners(cwd)) {
    if (selected.has(toolName)) continue;
    const result = await getToolProvider(toolName).cleanGeneratedState?.(
      cwd,
      dryRun,
    );
    if (!result) continue;
    cleanup.warnings.push(...result.warnings);
    cleanup.handledPaths.set(
      toolName,
      new Set([
        ...result.handledManifestPaths,
        ...result.relinquishedManifestPaths,
      ]),
    );
  }
  return cleanup;
}

function replacementTools(
  plan: SyncPlan,
  manifest: SyncManifest | undefined,
  filtered: boolean,
): string[] {
  return filtered
    ? plan.providers.map((provider) => provider.name)
    : [
        ...new Set([
          ...plan.providers.map((provider) => provider.name),
          ...Object.keys(manifest?.owners ?? {}),
          ...(manifest?.provider_state_owners ?? []),
          ...Object.keys(manifest?.structured_owners ?? {}),
        ]),
      ];
}

export interface PublishSyncOwnershipInput {
  plan: SyncPlan;
  details: readonly SyncToolDetail[];
  docsResults: readonly DocsSyncResult[];
  extensionResults: readonly ExtensionsSyncResult[];
  cwd: string;
  manifest: SyncManifest | undefined;
  filtered: boolean;
  protectedDependencies: StructuredProtectedDependenciesByProvider;
  mcpOwners: Readonly<Record<string, McpOwnership>>;
  structuredOwners: StructuredReceiptsByProvider;
}

/** Reconcile stale state and publish every refreshed receipt atomically. */
export async function publishSyncOwnership(
  input: PublishSyncOwnershipInput,
): Promise<string[]> {
  const writtenFiles = await collectWrittenFiles(
    input.plan,
    input.details,
    input.docsResults,
    input.extensionResults,
    input.cwd,
  );
  const filesByTool = excludeProtectedArtifactFiles(
    input.plan,
    writtenFiles,
    input.cwd,
    input.protectedDependencies,
  );
  const providerStateCleanup = await reconcileRemovedProviderState(
    input.plan,
    input.cwd,
    input.filtered,
    false,
  );
  const staleWarnings = await reconcileStaleSharedOutputs(
    input.plan,
    filesByTool,
    input.cwd,
    input.manifest,
    input.filtered,
    false,
    providerStateCleanup.handledPaths,
    input.protectedDependencies,
  );
  const providerStateOwners = await discoverProviderStateOwners(
    input.cwd,
    input.filtered ? input.plan.tools : undefined,
  );
  await writeOwnedManifest(input.cwd, filesByTool, {
    preserveUnselected: input.filtered,
    replaceTools: replacementTools(input.plan, input.manifest, input.filtered),
    mcpOwners: input.mcpOwners,
    providerStateOwners,
    structuredOwners: input.structuredOwners,
  });
  return [...providerStateCleanup.warnings, ...staleWarnings];
}

/**
 * Read-only shared-output lifecycle used by execute preflight and dry-run.
 * It performs the real collision and stale-ownership decisions without
 * unlinking files or publishing a new manifest.
 */
export async function previewSharedOutputLifecycle(
  plan: SyncPlan,
  cwd: string,
  manifest: SyncManifest | undefined,
  filtered: boolean,
  protectedDependencies: StructuredProtectedDependenciesByProvider = {},
): Promise<string[]> {
  const [planned, providerStateCleanup] = await Promise.all([
    previewSharedOutputFiles(plan, cwd, protectedDependencies),
    reconcileRemovedProviderState(plan, cwd, filtered, true),
  ]);
  const publishable = excludeProtectedArtifactFiles(
    plan,
    planned,
    cwd,
    protectedDependencies,
  );
  for (const provider of plan.providers) {
    if (provider.manifestCleanSurfaces.length === 0) continue;
    await assertProviderSharedOutputsWritable(
      provider,
      sharedFiles(provider, cwd, planned),
      cwd,
      manifest,
    );
  }
  return [
    ...providerStateCleanup.warnings,
    ...(await reconcileStaleSharedOutputs(
      plan,
      publishable,
      cwd,
      manifest,
      filtered,
      true,
      providerStateCleanup.handledPaths,
      protectedDependencies,
    )),
  ];
}
