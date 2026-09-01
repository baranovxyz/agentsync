/**
 * Sync manifest
 *
 * `files` is the public drift index consumed by doctor. `owners` adds the
 * provenance required for safe updates and cleanup in provider directories
 * that also accept hand-authored files.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { isToolName, SUPPORTED_TOOLS, type ToolName } from "../constants.js";
import { getToolProvider } from "../tools/index.js";
import type { ToolProvider } from "../tools/types.js";
import { readJsonValidated } from "../utils/fs.js";
import { toPosixPath } from "../utils/path-normalization.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import {
  ContentHashSchema,
  hashSemanticValue,
  isCanonicalManifestPath,
} from "./semantic-ownership.js";
import {
  type StructuredReceiptsByProvider,
  StructuredReceiptsByProviderSchema,
} from "./structured-lifecycle.js";

export { hashSemanticValue, isCanonicalManifestPath };

const WholeFileMcpOwnershipSchema = z.object({
  kind: z.literal("whole-file"),
  path: z.string().min(1),
  hash: ContentHashSchema,
});

const OwnedKeysMcpOwnershipSchema = z.object({
  kind: z.literal("owned-keys"),
  path: z.string().min(1),
  format: z.enum(["json", "jsonc", "toml", "yaml"]),
  key_hashes: z.record(z.string().min(1), ContentHashSchema),
});

export const McpOwnershipSchema = z.discriminatedUnion("kind", [
  WholeFileMcpOwnershipSchema,
  OwnedKeysMcpOwnershipSchema,
]);

export type McpOwnership = z.infer<typeof McpOwnershipSchema>;

export const SyncManifestSchema = z.object({
  files: z.record(z.string(), ContentHashSchema),
  /** Exact link text for current `--link` outputs; absent entries are files. */
  symlink_targets: z.record(z.string(), z.string().min(1)),
  /** Exact project-relative paths owned by each provider. */
  owners: z.record(z.string(), z.array(z.string())),
  /** Exact prior ownership of each provider's project MCP projection. */
  mcp_owners: z.record(z.string(), McpOwnershipSchema).optional(),
  /** Providers with discoverable private generated-state receipts. */
  provider_state_owners: z.array(z.string()).optional(),
  /** Provider-keyed semantic ownership of shared structured config. */
  structured_owners: StructuredReceiptsByProviderSchema.optional(),
  timestamp: z.string(),
});

export type SyncManifest = z.infer<typeof SyncManifestSchema>;

/** Valid providers for which a manifest still carries destructive authority. */
export function manifestOwnedToolNames(
  manifest: SyncManifest | undefined,
): ToolName[] {
  const candidates = new Set([
    ...Object.keys(manifest?.owners ?? {}),
    ...Object.keys(manifest?.mcp_owners ?? {}),
    ...(manifest?.provider_state_owners ?? []),
    ...Object.keys(manifest?.structured_owners ?? {}),
  ]);
  return [...candidates].filter(isToolName).sort();
}

/**
 * Probe only providers that explicitly expose private-state discovery.
 * Invalid provider receipts deliberately propagate their typed recovery error.
 */
export async function discoverProviderStateOwners(
  cwd: string,
  tools: readonly ToolName[] = SUPPORTED_TOOLS,
): Promise<ToolName[]> {
  const owners: ToolName[] = [];
  for (const tool of [...new Set(tools)].sort()) {
    const provider = getToolProvider(tool);
    if (provider.hasGeneratedState && (await provider.hasGeneratedState(cwd))) {
      owners.push(tool);
    }
  }
  return owners;
}

const MANIFEST_FILENAME = ".sync-manifest.json";

export function getManifestPath(cwd: string): string {
  return path.join(cwd, ".agents", MANIFEST_FILENAME);
}

/** Compute SHA-256 hash of a file's contents. Returns `sha256:<hex>`. */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hex = createHash("sha256").update(content).digest("hex");
  return `sha256:${hex}`;
}

async function lstatIfPresent(
  filePath: string,
): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (Reflect.get(Object(error), "code") === "ENOENT") return null;
    throw error;
  }
}

/** `lstat`-based existence check which also sees dangling symlinks. */
export async function pathEntryExists(filePath: string): Promise<boolean> {
  try {
    return (await lstatIfPresent(filePath)) !== null;
  } catch {
    // Permission and I/O failures are not evidence that a path is absent.
    return true;
  }
}

/** Read an existing manifest, failing closed when it is missing or invalid. */
export async function readManifest(
  cwd: string,
): Promise<SyncManifest | undefined> {
  const manifestPath = getManifestPath(cwd);
  await assertSafeProjectOutputPath(cwd, manifestPath);
  if (!(await pathEntryExists(manifestPath))) return undefined;
  try {
    return await readJsonValidated(manifestPath, SyncManifestSchema);
  } catch {
    return undefined;
  }
}

function projectRelativePath(cwd: string, absolutePath: string): string | null {
  const root = path.resolve(cwd);
  const candidate = path.resolve(absolutePath);
  const relative = path.relative(root, candidate);
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    return null;
  }
  return toPosixPath(relative);
}

function resolveManifestPath(cwd: string, relativePath: string): string | null {
  if (!isCanonicalManifestPath(relativePath)) return null;
  const absolutePath = path.resolve(cwd, ...relativePath.split("/"));
  return projectRelativePath(cwd, absolutePath) ? absolutePath : null;
}

function declaredMcpPaths(provider: ToolProvider): string[] {
  const configured = provider.mcpFormat?.projectConfigPaths ?? [
    provider.paths.mcpConfigPath,
  ];
  return configured.flatMap((candidate) => {
    if (!candidate || path.isAbsolute(candidate)) return [];
    const normalized = toPosixPath(path.normalize(candidate));
    return isCanonicalManifestPath(normalized) ? [normalized] : [];
  });
}

/**
 * A receipt grants authority only while its exact path remains one of the
 * provider's declared native paths and its ownership declaration still matches.
 */
export function isCompatibleMcpOwnership(
  provider: ToolProvider,
  ownership: McpOwnership,
): boolean {
  const declaredPaths = declaredMcpPaths(provider);
  const declaration = provider.mcpFormat?.ownership;
  if (!(declaration && declaredPaths.includes(ownership.path))) {
    return false;
  }
  if (ownership.kind === "whole-file") {
    return declaration.kind === "whole-file";
  }
  if (declaration.kind !== "owned-keys") {
    return false;
  }
  if (ownership.format !== declaration.format) return false;
  const declaredKeys = new Set(declaration.keys);
  const receiptKeys = Object.keys(ownership.key_hashes);
  return (
    declaredKeys.size > 0 &&
    receiptKeys.length === declaredKeys.size &&
    receiptKeys.every((key) => declaredKeys.has(key))
  );
}

function publishSelectedMcpOwners(
  owners: Record<string, McpOwnership>,
  replacements: Readonly<Record<string, McpOwnership>>,
  replaceTools: ReadonlySet<string>,
): void {
  for (const tool of replaceTools) {
    const ownership = replacements[tool];
    if (
      ownership &&
      isToolName(tool) &&
      isCompatibleMcpOwnership(getToolProvider(tool), ownership)
    ) {
      owners[tool] = structuredClone(ownership);
    }
  }
}

async function atomicWriteManifest(
  cwd: string,
  manifest: SyncManifest,
): Promise<void> {
  const manifestPath = getManifestPath(cwd);
  await assertSafeProjectOutputPath(cwd, manifestPath);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  await assertSafeProjectOutputPath(cwd, temporaryPath);
  try {
    await writeFile(temporaryPath, JSON.stringify(manifest, null, 2), "utf-8");
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

interface FileSnapshots {
  files: Record<string, string>;
  symlinkTargets: Record<string, string>;
}

async function snapshotFiles(
  cwd: string,
  absolutePaths: Iterable<string>,
): Promise<FileSnapshots> {
  const files: Record<string, string> = {};
  const symlinkTargets: Record<string, string> = {};
  for (const absolutePath of absolutePaths) {
    const relativePath = projectRelativePath(cwd, absolutePath);
    if (!relativePath) continue;
    try {
      files[relativePath] = await hashFile(absolutePath);
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        symlinkTargets[relativePath] = await readlink(absolutePath);
      }
    } catch {
      // A failed or dangling output is not durable ownership evidence.
    }
  }
  return { files, symlinkTargets };
}

export interface WriteOwnedManifestOptions {
  /** Keep tools not present in `filesByTool` (the `sync --tool` contract). */
  preserveUnselected: boolean;
  /** Owner keys to replace even when they currently have no generated files. */
  replaceTools?: Iterable<string>;
  /** Current project-MCP ownership for providers processed by this sync. */
  mcpOwners?: Readonly<Record<string, McpOwnership>>;
  /** Current private-state markers for providers processed by this sync. */
  providerStateOwners?: Iterable<string>;
  /** Current shared structured-config receipts for processed providers. */
  structuredOwners?: Readonly<StructuredReceiptsByProvider>;
}

function supportsProviderStateOwnership(tool: string): tool is ToolName {
  if (!isToolName(tool)) return false;
  const provider = getToolProvider(tool);
  return (
    provider.hasGeneratedState !== undefined &&
    provider.cleanGeneratedState !== undefined
  );
}

function normalizeProviderStateOwners(owners: Iterable<string>): ToolName[] {
  return [...new Set(owners)].filter(supportsProviderStateOwnership).sort();
}

interface ManifestPublicationState {
  owners: Record<string, string[]>;
  files: Record<string, string>;
  symlinkTargets: Record<string, string>;
  mcpOwners: Record<string, McpOwnership>;
  providerStateOwners: Set<string>;
  structuredOwners: StructuredReceiptsByProvider;
}

function retainedPublicationState(
  previous: SyncManifest | undefined,
  preserveUnselected: boolean,
): ManifestPublicationState {
  if (!preserveUnselected) {
    return {
      owners: {},
      files: {},
      symlinkTargets: {},
      mcpOwners: {},
      providerStateOwners: new Set(),
      structuredOwners: {},
    };
  }
  return {
    owners: structuredClone(previous?.owners ?? {}),
    files: { ...(previous?.files ?? {}) },
    symlinkTargets: { ...(previous?.symlink_targets ?? {}) },
    mcpOwners: structuredClone(previous?.mcp_owners ?? {}),
    providerStateOwners: new Set(previous?.provider_state_owners ?? []),
    structuredOwners: structuredClone(previous?.structured_owners ?? {}),
  };
}

function ownedSyncManifest(input: {
  files: Record<string, string>;
  symlinkTargets: Record<string, string>;
  owners: Record<string, string[]>;
  mcpOwners: Record<string, McpOwnership>;
  providerStateOwners: ToolName[];
  structuredOwners: StructuredReceiptsByProvider;
}): SyncManifest {
  const manifest: SyncManifest = {
    files: input.files,
    symlink_targets: input.symlinkTargets,
    owners: input.owners,
    timestamp: new Date().toISOString(),
  };
  if (Object.keys(input.mcpOwners).length > 0) {
    manifest.mcp_owners = input.mcpOwners;
  }
  if (input.providerStateOwners.length > 0) {
    manifest.provider_state_owners = input.providerStateOwners;
  }
  if (Object.keys(input.structuredOwners).length > 0) {
    manifest.structured_owners = input.structuredOwners;
  }
  return manifest;
}

function removeReplacedOwners(
  owners: Record<string, string[]>,
  files: Record<string, string>,
  symlinkTargets: Record<string, string>,
  replaceTools: Iterable<string>,
): void {
  for (const tool of replaceTools) {
    const oldPaths = owners[tool] ?? [];
    delete owners[tool];
    const stillOwned = new Set(Object.values(owners).flat());
    for (const relativePath of oldPaths) {
      if (!stillOwned.has(relativePath)) {
        delete files[relativePath];
        delete symlinkTargets[relativePath];
      }
    }
  }
}

function exactOwnedRelativePaths(
  cwd: string,
  tool: string,
  relativePaths: readonly string[],
): string[] {
  if (!isToolName(tool)) return [];
  const provider = getToolProvider(tool);
  const absolutePaths = relativePaths.flatMap((relativePath) => {
    const absolutePath = resolveManifestPath(cwd, relativePath);
    return absolutePath ? [absolutePath] : [];
  });
  return validatePlannedOwnedPaths(cwd, provider, absolutePaths).valid;
}

async function recordCurrentFilesAndOwners(
  cwd: string,
  filesByTool: ReadonlyMap<string, readonly string[]>,
  owners: Record<string, string[]>,
  files: Record<string, string>,
  symlinkTargets: Record<string, string>,
): Promise<void> {
  for (const [tool, absolutePaths] of filesByTool) {
    const snapshots = await snapshotFiles(cwd, absolutePaths);
    const relativePaths = Object.keys(snapshots.files);
    const ownedPaths = exactOwnedRelativePaths(cwd, tool, relativePaths).sort();
    if (ownedPaths.length > 0) owners[tool] = ownedPaths;
    Object.assign(files, snapshots.files);
    Object.assign(symlinkTargets, snapshots.symlinkTargets);
  }
}

function normalizeSymlinkTargets(
  owners: Record<string, string[]>,
  files: Record<string, string>,
  symlinkTargets: Record<string, string>,
): void {
  const ownedPaths = new Set(Object.values(owners).flat());
  for (const relativePath of Object.keys(symlinkTargets)) {
    if (!(ownedPaths.has(relativePath) && files[relativePath])) {
      delete symlinkTargets[relativePath];
    }
  }
}

function normalizeOwners(
  cwd: string,
  owners: Record<string, string[]>,
  files: Record<string, string>,
): void {
  for (const [tool, relativePaths] of Object.entries(owners)) {
    const shapeValid = new Set(
      exactOwnedRelativePaths(cwd, tool, [...new Set(relativePaths)]),
    );
    const valid = [...shapeValid]
      .filter((relativePath) => files[relativePath] !== undefined)
      .sort();
    if (valid.length > 0) owners[tool] = valid;
    else delete owners[tool];
  }
}

/**
 * Atomically publish the current exact output set.
 *
 * Preserved hashes are copied from the prior manifest rather than recomputed;
 * otherwise a filtered sync would accidentally bless edits to another tool.
 */
export async function writeOwnedManifest(
  cwd: string,
  filesByTool: ReadonlyMap<string, readonly string[]>,
  options: WriteOwnedManifestOptions,
): Promise<void> {
  const previous = options.preserveUnselected
    ? await readManifest(cwd)
    : undefined;
  const state = retainedPublicationState(previous, options.preserveUnselected);
  const {
    files,
    mcpOwners,
    owners,
    providerStateOwners,
    structuredOwners,
    symlinkTargets,
  } = state;
  const replaceTools = new Set(
    options.replaceTools ?? [
      ...filesByTool.keys(),
      ...Object.keys(options.mcpOwners ?? {}),
      ...Object.keys(options.structuredOwners ?? {}),
    ],
  );
  removeReplacedOwners(owners, files, symlinkTargets, replaceTools);
  for (const tool of replaceTools) {
    delete mcpOwners[tool];
    providerStateOwners.delete(tool);
    if (isToolName(tool)) delete structuredOwners[tool];
  }
  await recordCurrentFilesAndOwners(
    cwd,
    filesByTool,
    owners,
    files,
    symlinkTargets,
  );
  publishSelectedMcpOwners(mcpOwners, options.mcpOwners ?? {}, replaceTools);
  for (const tool of options.providerStateOwners ?? []) {
    providerStateOwners.add(tool);
  }
  for (const tool of replaceTools) {
    if (!isToolName(tool)) continue;
    const receipt = options.structuredOwners?.[tool];
    if (receipt) structuredOwners[tool] = structuredClone(receipt);
  }
  // `files` is a drift index. Destructive ownership is the narrower set of
  // canonical, provider-declared shared output files with a durable hash.
  // Normalize preserved owners without broadening those hashes into authority.
  normalizeOwners(cwd, owners, files);
  normalizeSymlinkTargets(owners, files, symlinkTargets);

  const normalizedProviderStateOwners =
    normalizeProviderStateOwners(providerStateOwners);
  const normalizedStructuredOwners =
    StructuredReceiptsByProviderSchema.parse(structuredOwners);
  await atomicWriteManifest(
    cwd,
    ownedSyncManifest({
      files,
      symlinkTargets,
      owners,
      mcpOwners,
      providerStateOwners: normalizedProviderStateOwners,
      structuredOwners: normalizedStructuredOwners,
    }),
  );
}

export type ManifestSurface =
  | "skills"
  | "commands"
  | "agents"
  | "docs"
  | "rules"
  | "extension-files";

export interface ValidatedOwnedFile {
  absolutePath: string;
  relativePath: string;
  expectedHash: string;
  expectedSymlinkTarget?: string;
  surface: ManifestSurface;
  /** Shared root that must never be recursively deleted. */
  absoluteRoot: string;
  /** First skill directory, used as the upper bound for empty-dir pruning. */
  skillDirectory?: string;
}

function normalizedProviderRoot(
  root: string | null | undefined,
): string | null {
  if (!root || path.isAbsolute(root)) return null;
  const normalized = toPosixPath(path.normalize(root));
  return isCanonicalManifestPath(normalized) ? normalized : null;
}

function relativeUnderRoot(relativePath: string, root: string): string | null {
  const prefix = `${root}/`;
  return relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : null;
}

interface OwnedPathShape {
  relativePath: string;
  surface: ManifestSurface;
  root: string;
  skillName?: string;
}

function classifySkillPath(
  provider: ToolProvider,
  relativePath: string,
): OwnedPathShape | null {
  const generatedRoot = provider.capabilities.nativeSkillsDiscovery
    ? provider.paths.generatedPresetSkillsDir
    : provider.paths.skillsDir;
  const root = normalizedProviderRoot(generatedRoot);
  const belowRoot = root ? relativeUnderRoot(relativePath, root) : null;
  if (!(root && belowRoot)) return null;
  const parts = belowRoot.split("/");
  return parts.length >= 2 && parts.every(Boolean)
    ? {
        relativePath,
        surface: "skills",
        root,
        skillName: parts[0],
      }
    : null;
}

function classifyDirectPath(
  relativePath: string,
  rootPath: string | null | undefined,
  extension: string,
  surface: "commands" | "agents" | "rules",
): OwnedPathShape | null {
  const root = normalizedProviderRoot(rootPath);
  const belowRoot = root ? relativeUnderRoot(relativePath, root) : null;
  const basename = belowRoot?.slice(0, -extension.length);
  return root &&
    extension.startsWith(".") &&
    belowRoot?.endsWith(extension) &&
    basename
    ? { relativePath, surface, root }
    : null;
}

function classifyDocsPath(
  provider: ToolProvider,
  relativePath: string,
): OwnedPathShape | null {
  if (!provider.docsFormat) return null;
  const docsFile = normalizedProviderRoot(provider.paths.docsFile);
  const lower = docsFile?.toLowerCase();
  if (
    !docsFile ||
    lower === "agents.md" ||
    lower === ".agents" ||
    lower?.startsWith(".agents/") ||
    relativePath !== docsFile
  ) {
    return null;
  }
  return {
    relativePath,
    surface: "docs",
    root: path.posix.dirname(docsFile),
  };
}

function isCanonicalSourcePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return (
    lower === "agents.md" || lower === ".agents" || lower.startsWith(".agents/")
  );
}

function classifyRulePath(
  provider: ToolProvider,
  relativePath: string,
): OwnedPathShape | null {
  const output = provider.rulesFormat?.fileOutput;
  return output
    ? classifyDirectPath(relativePath, output.root, output.extension, "rules")
    : null;
}

function matchingExtensionTreeRoot(
  relativePath: string,
  rootPath: string,
  extension?: string,
): string | null {
  const root = normalizedProviderRoot(rootPath);
  if (!(root && !isCanonicalSourcePath(root))) return null;
  const belowRoot = relativeUnderRoot(relativePath, root);
  if (!belowRoot) return null;
  if (!extension) return root;
  return extension.startsWith(".") &&
    belowRoot.endsWith(extension) &&
    belowRoot.length > extension.length
    ? root
    : null;
}

function classifyExtensionFilePath(
  provider: ToolProvider,
  relativePath: string,
): OwnedPathShape | null {
  if (isCanonicalSourcePath(relativePath)) return null;
  for (const output of provider.extensionFileOutputs ?? []) {
    const exactPath =
      output.kind === "exact" ? normalizedProviderRoot(output.path) : null;
    const root =
      exactPath === relativePath
        ? path.posix.dirname(exactPath)
        : output.kind === "tree"
          ? matchingExtensionTreeRoot(
              relativePath,
              output.root,
              output.extension,
            )
          : null;
    if (root) return { relativePath, surface: "extension-files", root };
  }
  return null;
}

/** Artifact dependency group for one shape-valid provider extension file. */
export function extensionArtifactDependency(
  provider: ToolProvider,
  relativePath: string,
): string | undefined {
  if (isCanonicalSourcePath(relativePath)) return undefined;
  for (const output of provider.extensionFileOutputs ?? []) {
    const matches =
      output.kind === "exact"
        ? normalizedProviderRoot(output.path) === relativePath
        : matchingExtensionTreeRoot(
            relativePath,
            output.root,
            output.extension,
          ) !== null;
    if (matches) return output.dependency;
  }
  return undefined;
}

function classifyOwnedPath(
  provider: ToolProvider,
  relativePath: string,
): OwnedPathShape | null {
  if (!isCanonicalManifestPath(relativePath)) return null;
  const enabled = new Set(provider.manifestCleanSurfaces);
  const skill = enabled.has("skills")
    ? classifySkillPath(provider, relativePath)
    : null;
  const command = enabled.has("commands")
    ? classifyDirectPath(
        relativePath,
        provider.paths.commandsDir,
        ".md",
        "commands",
      )
    : null;
  const agent = enabled.has("agents")
    ? classifyDirectPath(
        relativePath,
        provider.paths.agentsDir,
        provider.agentFileExtension,
        "agents",
      )
    : null;
  const docs = enabled.has("docs")
    ? classifyDocsPath(provider, relativePath)
    : null;
  const rules = enabled.has("rules")
    ? classifyRulePath(provider, relativePath)
    : null;
  const extensionFile = enabled.has("extension-files")
    ? classifyExtensionFilePath(provider, relativePath)
    : null;
  return skill ?? command ?? agent ?? docs ?? rules ?? extensionFile;
}

/**
 * Select only shape-valid paths explicitly owned by this provider.
 * Support files require a sibling owned SKILL.md entry point.
 */
export function validatedOwnedFiles(
  cwd: string,
  provider: ToolProvider,
  manifest: SyncManifest | undefined,
): { files: ValidatedOwnedFile[]; rejected: string[] } {
  const owned = manifest?.owners?.[provider.name] ?? [];
  const classified = owned.map((relativePath) => ({
    relativePath,
    shape: classifyOwnedPath(provider, relativePath),
  }));
  const skillEntries = new Set(
    classified.flatMap(({ relativePath, shape }) =>
      shape?.surface === "skills" &&
      shape.skillName &&
      relativePath === `${shape.root}/${shape.skillName}/SKILL.md`
        ? [relativePath]
        : [],
    ),
  );
  const files: ValidatedOwnedFile[] = [];
  const rejected: string[] = [];

  for (const { relativePath, shape } of classified) {
    const expectedHash = manifest?.files[relativePath];
    const hasSkillEntry =
      shape?.surface !== "skills" ||
      (shape.skillName !== undefined &&
        skillEntries.has(`${shape.root}/${shape.skillName}/SKILL.md`));
    const absolutePath = resolveManifestPath(cwd, relativePath);
    if (!(shape && expectedHash && hasSkillEntry && absolutePath)) {
      rejected.push(relativePath);
      continue;
    }
    const absoluteRoot = path.resolve(cwd, ...shape.root.split("/"));
    files.push({
      absolutePath,
      relativePath,
      expectedHash,
      expectedSymlinkTarget: manifest?.symlink_targets[relativePath],
      surface: shape.surface,
      absoluteRoot,
      skillDirectory:
        shape.surface === "skills" && shape.skillName
          ? path.join(absoluteRoot, shape.skillName)
          : undefined,
    });
  }

  return { files, rejected };
}

/** Validate planned shared paths with the same exact shape rules as cleanup. */
export function validatePlannedOwnedPaths(
  cwd: string,
  provider: ToolProvider,
  absolutePaths: readonly string[],
): { valid: string[]; rejected: string[] } {
  const relativePaths = absolutePaths.flatMap((absolutePath) => {
    const relativePath = projectRelativePath(cwd, absolutePath);
    return relativePath ? [relativePath] : [];
  });
  const skillEntries = new Set(
    relativePaths.filter((relativePath) => {
      const shape = classifyOwnedPath(provider, relativePath);
      return (
        shape?.surface === "skills" &&
        shape.skillName !== undefined &&
        relativePath === `${shape.root}/${shape.skillName}/SKILL.md`
      );
    }),
  );
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const relativePath of relativePaths) {
    const shape = classifyOwnedPath(provider, relativePath);
    const hasSkillEntry =
      shape?.surface !== "skills" ||
      (shape.skillName !== undefined &&
        skillEntries.has(`${shape.root}/${shape.skillName}/SKILL.md`));
    if (shape && hasSkillEntry) valid.push(relativePath);
    else rejected.push(relativePath);
  }
  return { valid, rejected };
}

export type ManagedWriteState =
  | "absent"
  | "owned"
  | "unowned"
  | "modified"
  | "unsafe";

type ReceiptEntryState = "matched" | "modified" | "unsafe";

async function inspectReceiptEntry(
  absolutePath: string,
  stats: Awaited<ReturnType<typeof lstat>>,
  expectedSymlinkTarget: string | undefined,
): Promise<ReceiptEntryState> {
  if (!stats.isSymbolicLink()) {
    if (!stats.isFile()) return "unsafe";
    return expectedSymlinkTarget ? "modified" : "matched";
  }
  if (!expectedSymlinkTarget) return "unsafe";
  try {
    return (await readlink(absolutePath)) === expectedSymlinkTarget
      ? "matched"
      : "modified";
  } catch {
    return "modified";
  }
}

async function hasSafeRealParents(
  cwd: string,
  absolutePath: string,
): Promise<boolean> {
  const root = path.resolve(cwd);
  if (!projectRelativePath(root, absolutePath)) return false;

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return false;
  }

  const relativeParent = path.relative(root, path.dirname(absolutePath));
  let current = root;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stats = await lstatIfPresent(current);
      if (!stats) break;
      if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
      const currentReal = await realpath(current);
      const realRelative = path.relative(rootReal, currentReal);
      if (
        path.isAbsolute(realRelative) ||
        realRelative === ".." ||
        realRelative.startsWith(`..${path.sep}`)
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/** Decide whether a planned shared output may be replaced. */
export async function inspectManagedWrite(
  cwd: string,
  provider: ToolProvider,
  relativePath: string,
  manifest: SyncManifest | undefined,
): Promise<ManagedWriteState> {
  const absolutePath = resolveManifestPath(cwd, relativePath);
  if (!(absolutePath && (await hasSafeRealParents(cwd, absolutePath)))) {
    return "unsafe";
  }
  let stats: Awaited<ReturnType<typeof lstat>> | null;
  try {
    stats = await lstatIfPresent(absolutePath);
  } catch {
    return "unsafe";
  }
  if (!stats) return "absent";

  const expectedSymlinkTarget = manifest?.symlink_targets[relativePath];
  const entryState = await inspectReceiptEntry(
    absolutePath,
    stats,
    expectedSymlinkTarget,
  );
  if (entryState !== "matched") return entryState;

  const explicitlyOwned =
    manifest?.owners?.[provider.name]?.includes(relativePath) ?? false;
  if (!explicitlyOwned) return "unowned";
  const expectedHash = manifest?.files[relativePath];
  if (!expectedHash) return "unowned";
  try {
    return (await hashFile(absolutePath)) === expectedHash
      ? "owned"
      : "modified";
  } catch {
    return "modified";
  }
}

export type OwnedRemovalState = "removed" | "missing" | "modified" | "unsafe";

/** Unlink one exact owned file when its current bytes still match. */
export async function removeHashOwnedFile(
  cwd: string,
  file: ValidatedOwnedFile,
  dryRun: boolean,
): Promise<OwnedRemovalState> {
  if (!(await hasSafeRealParents(cwd, file.absolutePath))) return "unsafe";
  let stats: Awaited<ReturnType<typeof lstat>> | null;
  try {
    stats = await lstatIfPresent(file.absolutePath);
  } catch {
    return "unsafe";
  }
  if (!stats) return "missing";
  const entryState = await inspectReceiptEntry(
    file.absolutePath,
    stats,
    file.expectedSymlinkTarget,
  );
  if (entryState !== "matched") return entryState;
  try {
    if ((await hashFile(file.absolutePath)) !== file.expectedHash) {
      return "modified";
    }
  } catch {
    return "modified";
  }
  if (!dryRun) await unlink(file.absolutePath);
  return "removed";
}

/**
 * Remove empty descendants after exact-file cleanup, stopping before the
 * shared provider root. No recursive removal is used.
 */
export async function pruneEmptyOwnedParents(
  cwd: string,
  startDirectory: string,
  sharedRoot: string,
  dryRun: boolean,
): Promise<string[]> {
  const removed: string[] = [];
  let current = path.resolve(startDirectory);
  const stop = path.resolve(sharedRoot);
  while (current !== stop) {
    if (
      !(
        projectRelativePath(cwd, current) &&
        (await hasSafeRealParents(cwd, path.join(current, ".prune-check")))
      )
    ) {
      break;
    }
    try {
      if (dryRun) {
        const entries = await readdir(current);
        if (entries.length > 0) break;
      } else {
        await rmdir(current);
      }
      removed.push(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
  return removed;
}

async function retainExistingOwners(
  cwd: string,
  owners: Record<string, string[]>,
): Promise<Set<string>> {
  const stillOwned = new Set<string>();
  for (const [tool, relativePaths] of Object.entries(owners)) {
    const existing: string[] = [];
    for (const relativePath of relativePaths) {
      const absolutePath = resolveManifestPath(cwd, relativePath);
      if (absolutePath && (await pathEntryExists(absolutePath))) {
        existing.push(relativePath);
        stillOwned.add(relativePath);
      }
    }
    if (existing.length > 0) owners[tool] = existing;
    else delete owners[tool];
  }
  return stillOwned;
}

async function removeMissingUnownedHashes(
  cwd: string,
  files: Record<string, string>,
  stillOwned: ReadonlySet<string>,
): Promise<void> {
  for (const relativePath of Object.keys(files)) {
    const absolutePath = resolveManifestPath(cwd, relativePath);
    if (
      !(
        stillOwned.has(relativePath) ||
        (absolutePath && (await pathEntryExists(absolutePath)))
      )
    ) {
      delete files[relativePath];
    }
  }
}

/** Remove missing or rejected paths from durable ownership after clean. */
export async function pruneMissingManifestEntries(
  cwd: string,
  rejectedPaths: Iterable<string> = [],
  relinquishedMcpTools: Iterable<string> = [],
  currentProviderStateOwners?: Iterable<string>,
  currentStructuredOwners?: Readonly<StructuredReceiptsByProvider>,
): Promise<void> {
  const manifest = await readManifest(cwd);
  if (!manifest) return;
  const owners = structuredClone(manifest.owners ?? {});
  const mcpOwners = structuredClone(manifest.mcp_owners ?? {});
  const files = { ...manifest.files };
  const symlinkTargets = { ...manifest.symlink_targets };
  const rejected = new Set(rejectedPaths);
  for (const [tool, relativePaths] of Object.entries(owners)) {
    const retained = relativePaths.filter(
      (relativePath) => !rejected.has(relativePath),
    );
    if (retained.length > 0) owners[tool] = retained;
    else delete owners[tool];
  }
  const stillOwned = await retainExistingOwners(cwd, owners);
  for (const relativePath of rejected) {
    if (!stillOwned.has(relativePath)) {
      delete files[relativePath];
      delete symlinkTargets[relativePath];
    }
  }
  for (const tool of relinquishedMcpTools) delete mcpOwners[tool];
  await removeMissingUnownedHashes(cwd, files, stillOwned);
  normalizeSymlinkTargets(owners, files, symlinkTargets);
  const providerStateOwners = normalizeProviderStateOwners(
    currentProviderStateOwners ?? manifest.provider_state_owners ?? [],
  );
  const structuredOwners = StructuredReceiptsByProviderSchema.parse(
    currentStructuredOwners ?? manifest.structured_owners ?? {},
  );

  await atomicWriteManifest(
    cwd,
    ownedSyncManifest({
      files,
      symlinkTargets,
      owners,
      mcpOwners,
      providerStateOwners,
      structuredOwners,
    }),
  );
}
