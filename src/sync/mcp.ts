/**
 * MCP Sync Module
 * Generates tool-specific MCP configuration files
 */

import { lstat, readFile, unlink } from "node:fs/promises";
import * as path from "node:path";
import { isToolName } from "../constants.js";
import { ConfigError, getErrorMessage } from "../core/errors.js";
import type { MCP } from "../core/mcp/tokens.js";
import { getToolProvider } from "../tools/index.js";
import {
  type ConfigFileFormat,
  parseConfigRecord,
  serializeConfigRecord,
} from "../tools/mcp-helpers.js";
import type {
  McpOwnedValueExpectation,
  McpProjectTarget,
  McpProjectWriteEvidence,
  ToolProvider,
} from "../tools/types.js";
import { ToolSettingsSchema } from "../types/schemas.js";
import { outputFile } from "../utils/fs.js";
import {
  editJsoncTopLevelKey,
  hasJsoncComments,
  parseJsoncValidated,
} from "../utils/jsonc.js";
import { toPosixPath } from "../utils/path-normalization.js";
import { assertSafeProjectOutputFile } from "../utils/project-output.js";
import {
  hashFile,
  hashSemanticValue,
  isCanonicalManifestPath,
  isCompatibleMcpOwnership,
  type McpOwnership,
} from "./manifest.js";

/** Result of syncing MCP servers to a single tool */
export interface MCPSyncResult {
  tool: string;
  serverCount: number;
  servers: string[];
}

export interface ManagedMcpResult {
  results: MCPSyncResult[];
  owners: Record<string, McpOwnership>;
  warnings: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  relinquishedTools: string[];
}

export interface ManagedMcpOptions {
  previousOwners?: Readonly<Record<string, McpOwnership>>;
  /** Preserve every unselected provider during `sync --tool`. */
  filtered?: boolean;
}

export interface McpReconciliationResult {
  warnings: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  /** True only for a real mutation path; dry-run never changes receipts. */
  relinquished: boolean;
}

function emptySyncResults(providers: readonly ToolProvider[]): MCPSyncResult[] {
  return providers.map((provider) => ({
    tool: provider.name,
    serverCount: 0,
    servers: [],
  }));
}

async function syncManagedProjectMcp(
  providers: readonly ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
  targets: ReadonlyMap<string, McpProjectTarget>,
): Promise<{
  results: MCPSyncResult[];
  owners: Record<string, McpOwnership>;
}> {
  const results: MCPSyncResult[] = [];
  const owners: Record<string, McpOwnership> = {};
  const servers = Object.keys(mcps);
  for (const provider of providers) {
    const format = provider.mcpFormat;
    if (!format) {
      results.push({ tool: provider.name, serverCount: 0, servers: [] });
      continue;
    }
    const target = targets.get(provider.name);
    if (!target) {
      throw new ConfigError(
        `[${provider.name}] managed MCP writer has no preflighted project target.`,
        provider.name,
        "Repair the provider declaration so its project target can be resolved before mutation.",
      );
    }
    let evidence: McpProjectWriteEvidence | undefined;
    if (format.projectPath === "dynamic") {
      evidence = await format.writeProjectMCPAtPath(mcps, cwd, target);
    } else {
      await format.writeProjectMCP(mcps, cwd);
    }
    const snapshot = await snapshotMcpOwnership(
      provider,
      cwd,
      target,
      evidence,
    );
    if (snapshot) owners[provider.name] = snapshot;
    results.push({ tool: provider.name, serverCount: servers.length, servers });
  }
  return { results, owners };
}

function normalizeMcpPath(configured: string | null): string | null {
  if (!configured || path.isAbsolute(configured)) return null;
  const normalized = toPosixPath(path.normalize(configured));
  return isCanonicalManifestPath(normalized) ? normalized : null;
}

async function declaredMcpPath(
  provider: ToolProvider,
  cwd: string,
): Promise<string | null> {
  const format = provider.mcpFormat;
  const resolved =
    format?.projectPath === "dynamic"
      ? await format.resolveProjectConfigPath(cwd)
      : provider.paths.mcpConfigPath;
  return normalizeMcpPath(resolved);
}

async function resolveMcpProjectTarget(
  provider: ToolProvider,
  cwd: string,
): Promise<McpProjectTarget | undefined> {
  if (!provider.mcpFormat) return undefined;
  const relativePath = await declaredMcpPath(provider, cwd);
  if (!relativePath) {
    throw new ConfigError(
      `[${provider.name}] MCP writer has no safe project config path.`,
      provider.paths.mcpConfigPath ?? undefined,
      "Repair the provider declaration before syncing MCP servers.",
    );
  }
  return {
    relativePath,
    absolutePath: path.join(cwd, ...relativePath.split("/")),
  };
}

async function resolveMcpProjectTargets(
  providers: readonly ToolProvider[],
  cwd: string,
): Promise<Map<string, McpProjectTarget>> {
  const targets = new Map<string, McpProjectTarget>();
  for (const provider of providers) {
    const target = await resolveMcpProjectTarget(provider, cwd);
    if (target) targets.set(provider.name, target);
  }
  return targets;
}

async function mcpConfigPath(
  provider: ToolProvider,
  cwd: string,
  receiptPath?: string,
): Promise<string> {
  const relativePath = receiptPath
    ? normalizeMcpPath(receiptPath)
    : await declaredMcpPath(provider, cwd);
  if (!relativePath) {
    throw new ConfigError(
      `[${provider.name}] MCP writer has no safe project config path.`,
      provider.paths.mcpConfigPath ?? undefined,
      "Repair the provider declaration before syncing MCP servers.",
    );
  }
  return path.join(cwd, ...relativePath.split("/"));
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

interface OwnedKeyConfigSnapshot {
  value: Record<string, unknown>;
  content: string;
  format: ConfigFileFormat;
}

async function readOwnedKeyConfig(
  provider: ToolProvider,
  ownership: Extract<McpOwnership, { kind: "owned-keys" }>,
  cwd: string,
): Promise<OwnedKeyConfigSnapshot | undefined> {
  const configPath = await mcpConfigPath(provider, cwd, ownership.path);
  await assertSafeProjectOutputFile(cwd, configPath);
  if (!(await fileExists(configPath))) return undefined;
  try {
    const content = await readFile(configPath, "utf-8");
    const format = ownership.format;
    return { value: parseConfigRecord(content, format), content, format };
  } catch (error) {
    throw new ConfigError(
      `Cannot safely inspect ${provider.name} MCP configuration "${configPath}": ${getErrorMessage(error)}`,
      configPath,
      "Repair the existing configuration, or move it aside after preserving user-authored settings, then rerun agentsync.",
    );
  }
}

function expectedOwnedKeyHashes(
  provider: ToolProvider,
  declaration: Extract<
    NonNullable<ToolProvider["mcpFormat"]>["ownership"],
    { kind: "owned-keys" }
  >,
  evidence: McpProjectWriteEvidence | undefined,
  configPath: string,
): Record<string, string> | undefined {
  if (provider.mcpFormat?.projectPath !== "dynamic") return undefined;
  if (!evidence) {
    throw new ConfigError(
      `Cannot record ${provider.name} MCP ownership: the dynamic-path writer returned no semantic evidence.`,
      configPath,
      "Repair the provider writer so it returns every exact owned value it projected.",
    );
  }
  const hashes: Record<string, string> = {};
  for (const key of declaration.keys) {
    if (!Object.hasOwn(evidence.ownedValues, key)) {
      throw new ConfigError(
        `Cannot record ${provider.name} MCP ownership: writer evidence is missing key "${key}".`,
        configPath,
        "Repair the provider writer so it returns every exact owned value it projected.",
      );
    }
    hashes[key] = hashSemanticValue(evidence.ownedValues[key]);
  }
  return hashes;
}

/** Capture exact authority at the preflighted path after its writer succeeds. */
async function snapshotMcpOwnership(
  provider: ToolProvider,
  cwd: string,
  target: McpProjectTarget,
  evidence: McpProjectWriteEvidence | undefined,
): Promise<McpOwnership | undefined> {
  const declaration = provider.mcpFormat?.ownership;
  if (!declaration) return undefined;
  const { relativePath, absolutePath: configPath } = target;
  await assertSafeProjectOutputFile(cwd, configPath);

  if (declaration.kind === "whole-file") {
    try {
      return {
        kind: "whole-file",
        path: relativePath,
        hash: await hashFile(configPath),
      };
    } catch (error) {
      throw new ConfigError(
        `Cannot record ${provider.name} MCP ownership: ${getErrorMessage(error)}`,
        configPath,
        "Restore the generated MCP file and rerun agentsync sync.",
      );
    }
  }

  const expectedHashes = expectedOwnedKeyHashes(
    provider,
    declaration,
    evidence,
    configPath,
  );
  const snapshot = await readOwnedKeyConfig(
    provider,
    {
      kind: "owned-keys",
      path: relativePath,
      format: declaration.format,
      key_hashes: {},
    },
    cwd,
  );
  if (!snapshot) {
    throw new ConfigError(
      `Cannot record ${provider.name} MCP ownership: generated config is missing.`,
      configPath,
      "Restore the generated MCP file and rerun agentsync sync.",
    );
  }
  const existing = snapshot.value;
  const keyHashes: Record<string, string> = {};
  for (const key of declaration.keys) {
    if (!(key in existing)) {
      throw new ConfigError(
        `Cannot record ${provider.name} MCP ownership: generated key "${key}" is missing.`,
        configPath,
        "Repair the provider writer so every declared MCP key is emitted, then rerun agentsync sync.",
      );
    }
    const actualHash = hashSemanticValue(existing[key]);
    if (expectedHashes && actualHash !== expectedHashes[key]) {
      throw new ConfigError(
        `Cannot record ${provider.name} MCP ownership: generated key "${key}" changed after the managed write.`,
        configPath,
        "Preserve the concurrent edit and rerun agentsync sync against the new config state.",
      );
    }
    keyHashes[key] = actualHash;
  }
  return {
    kind: "owned-keys",
    path: relativePath,
    format: declaration.format,
    key_hashes: keyHashes,
  };
}

function preservedWarning(
  provider: ToolProvider,
  ownership: McpOwnership,
  reason: string,
  dryRun: boolean,
): string {
  const action = dryRun
    ? "would preserve it and relinquish AgentSync ownership"
    : "preserved it and relinquished AgentSync ownership";
  return `[${provider.name}] MCP output ${ownership.path} ${action} (${reason}); review or remove it manually`;
}

function emptyReconciliation(dryRun: boolean): McpReconciliationResult {
  return {
    warnings: [],
    removedFiles: [],
    modifiedFiles: [],
    relinquished: !dryRun,
  };
}

async function reconcileWholeFile(
  provider: ToolProvider,
  ownership: Extract<McpOwnership, { kind: "whole-file" }>,
  cwd: string,
  dryRun: boolean,
): Promise<McpReconciliationResult> {
  const result = emptyReconciliation(dryRun);
  const configPath = await mcpConfigPath(provider, cwd, ownership.path);
  if (!(await fileExists(configPath))) return result;
  let currentHash: string;
  try {
    currentHash = await hashFile(configPath);
  } catch (error) {
    result.warnings.push(
      preservedWarning(
        provider,
        ownership,
        `the file is unreadable: ${getErrorMessage(error)}`,
        dryRun,
      ),
    );
    return result;
  }
  if (currentHash !== ownership.hash) {
    result.warnings.push(
      preservedWarning(provider, ownership, "its content was modified", dryRun),
    );
    return result;
  }
  result.removedFiles.push(configPath);
  if (!dryRun) await unlink(configPath);
  return result;
}

interface OwnedKeyWithdrawalPlan {
  next: Record<string, unknown>;
  removedKeys: string[];
  warnings: string[];
}

function planOwnedKeyWithdrawal(
  provider: ToolProvider,
  ownership: Extract<McpOwnership, { kind: "owned-keys" }>,
  existing: Readonly<Record<string, unknown>>,
  dryRun: boolean,
): OwnedKeyWithdrawalPlan {
  const next = { ...existing };
  const removedKeys: string[] = [];
  const warnings: string[] = [];
  for (const [key, expectedHash] of Object.entries(ownership.key_hashes).sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
  )) {
    if (!(key in existing)) continue;
    if (hashSemanticValue(existing[key]) !== expectedHash) {
      warnings.push(
        preservedWarning(
          provider,
          ownership,
          `key "${key}" was modified`,
          dryRun,
        ),
      );
      continue;
    }
    delete next[key];
    removedKeys.push(key);
  }
  return { next, removedKeys, warnings };
}

function editJsoncOwnedKeys(
  snapshot: OwnedKeyConfigSnapshot,
  removedKeys: readonly string[],
  next: Readonly<Record<string, unknown>>,
  provider: ToolProvider,
  configPath: string,
): string {
  let content = snapshot.content;
  for (const key of removedKeys) {
    content = editJsoncTopLevelKey(content, key, undefined, ToolSettingsSchema);
  }
  const reparsed = parseJsoncValidated(content, ToolSettingsSchema);
  if (hashSemanticValue(reparsed) !== hashSemanticValue(next)) {
    throw new ConfigError(
      `Cannot safely withdraw ${provider.name} MCP configuration "${configPath}": the targeted JSONC edit did not match the planned semantic state.`,
      configPath,
      "Preserve the existing OpenCode configuration, repair its JSONC layout, then rerun agentsync.",
    );
  }
  return content;
}

async function applyOwnedKeyWithdrawal(
  provider: ToolProvider,
  snapshot: OwnedKeyConfigSnapshot,
  plan: OwnedKeyWithdrawalPlan,
  configPath: string,
  dryRun: boolean,
  result: McpReconciliationResult,
): Promise<void> {
  if (
    Object.keys(plan.next).length === 0 &&
    !hasJsoncComments(snapshot.content)
  ) {
    result.removedFiles.push(configPath);
    if (!dryRun) await unlink(configPath);
    return;
  }
  result.modifiedFiles.push(configPath);
  if (dryRun) return;
  const content =
    snapshot.format === "jsonc"
      ? editJsoncOwnedKeys(
          snapshot,
          plan.removedKeys,
          plan.next,
          provider,
          configPath,
        )
      : serializeConfigRecord(plan.next, snapshot.format);
  await outputFile(configPath, content);
}

async function reconcileOwnedKeys(
  provider: ToolProvider,
  ownership: Extract<McpOwnership, { kind: "owned-keys" }>,
  cwd: string,
  dryRun: boolean,
): Promise<McpReconciliationResult> {
  const result = emptyReconciliation(dryRun);
  let snapshot: OwnedKeyConfigSnapshot | undefined;
  try {
    snapshot = await readOwnedKeyConfig(provider, ownership, cwd);
  } catch (error) {
    result.warnings.push(
      preservedWarning(provider, ownership, getErrorMessage(error), dryRun),
    );
    return result;
  }
  if (!snapshot) return result;
  const plan = planOwnedKeyWithdrawal(
    provider,
    ownership,
    snapshot.value,
    dryRun,
  );
  result.warnings.push(...plan.warnings);
  if (plan.removedKeys.length === 0) return result;
  const configPath = await mcpConfigPath(provider, cwd, ownership.path);
  await applyOwnedKeyWithdrawal(
    provider,
    snapshot,
    plan,
    configPath,
    dryRun,
    result,
  );
  return result;
}

/**
 * Withdraw one provider's project MCP state using exact prior evidence.
 * Missing evidence is intentionally a no-op.
 */
export async function reconcileMcpOwnership(
  provider: ToolProvider,
  ownership: McpOwnership | undefined,
  cwd: string,
  dryRun: boolean,
): Promise<McpReconciliationResult> {
  if (!ownership) return emptyReconciliation(true);
  if (!isCompatibleMcpOwnership(provider, ownership)) {
    return {
      ...emptyReconciliation(dryRun),
      warnings: [
        preservedWarning(
          provider,
          ownership,
          "the receipt is incompatible",
          dryRun,
        ),
      ],
    };
  }
  try {
    const configPath = await mcpConfigPath(provider, cwd, ownership.path);
    await assertSafeProjectOutputFile(cwd, configPath);
    return ownership.kind === "whole-file"
      ? await reconcileWholeFile(provider, ownership, cwd, dryRun)
      : await reconcileOwnedKeys(provider, ownership, cwd, dryRun);
  } catch (error) {
    return {
      ...emptyReconciliation(dryRun),
      warnings: [
        preservedWarning(provider, ownership, getErrorMessage(error), dryRun),
      ],
    };
  }
}

function selectedOrPreviouslyOwnedProviders(
  providers: readonly ToolProvider[],
  previousOwners: Readonly<Record<string, McpOwnership>>,
  filtered: boolean,
): ToolProvider[] {
  if (filtered) return [...providers];
  const byName = new Map(
    providers.map((provider) => [provider.name, provider]),
  );
  for (const tool of Object.keys(previousOwners).sort()) {
    if (isToolName(tool) && !byName.has(tool)) {
      byName.set(tool, getToolProvider(tool));
    }
  }
  return [...byName.values()];
}

async function preflightExternalMcp(
  selectedProviders: readonly ToolProvider[],
  lifecycleProviders: readonly ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
): Promise<void> {
  const selected = new Set(selectedProviders.map((provider) => provider.name));
  await Promise.all(
    lifecycleProviders.map((provider) =>
      provider.mcpFormat?.preflightExternalMCP?.(
        selected.has(provider.name) ? mcps : {},
        cwd,
      ),
    ),
  );
}

function configuredMcpCollision(
  provider: ToolProvider,
  configPath: string,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Refusing to overwrite ${provider.name} MCP configuration "${configPath}": ${detail}.`,
    configPath,
    "Preserve the existing MCP state, then move it aside if AgentSync should create and own this projection; for receipt-owned state, restore the last generated value before retrying.",
  );
}

async function preflightConfiguredMcp(
  provider: ToolProvider,
  cwd: string,
  previousOwnership: McpOwnership | undefined,
  target: McpProjectTarget,
): Promise<McpProjectTarget> {
  const declaration = provider.mcpFormat?.ownership;
  if (!declaration) return target;
  const { relativePath, absolutePath: configPath } = target;
  await assertSafeProjectOutputFile(cwd, configPath);

  const compatible =
    previousOwnership !== undefined &&
    previousOwnership.path === relativePath &&
    isCompatibleMcpOwnership(provider, previousOwnership)
      ? previousOwnership
      : undefined;
  if (!(await fileExists(configPath))) {
    return declaration.kind === "owned-keys"
      ? {
          ...target,
          expectedOwnedValues: Object.fromEntries(
            declaration.keys.map((key) => [key, { present: false }]),
          ),
        }
      : target;
  }

  if (declaration.kind === "whole-file") {
    await preflightWholeFileMcp(provider, configPath, compatible);
    return target;
  }

  return {
    ...target,
    expectedOwnedValues: await preflightOwnedKeyMcp(
      provider,
      cwd,
      configPath,
      relativePath,
      declaration,
      compatible,
    ),
  };
}

async function preflightWholeFileMcp(
  provider: ToolProvider,
  configPath: string,
  compatible: McpOwnership | undefined,
): Promise<void> {
  if (compatible?.kind !== "whole-file") {
    throw configuredMcpCollision(
      provider,
      configPath,
      "the occupied file has no compatible prior AgentSync ownership receipt",
    );
  }
  let currentHash: string;
  try {
    currentHash = await hashFile(configPath);
  } catch (error) {
    throw configuredMcpCollision(
      provider,
      configPath,
      `the receipt-owned file cannot be read (${getErrorMessage(error)})`,
    );
  }
  if (currentHash !== compatible.hash) {
    throw configuredMcpCollision(
      provider,
      configPath,
      "the receipt-owned file was modified after the last successful sync",
    );
  }
}

async function preflightOwnedKeyMcp(
  provider: ToolProvider,
  cwd: string,
  configPath: string,
  relativePath: string,
  declaration: Extract<
    NonNullable<ToolProvider["mcpFormat"]>["ownership"],
    { kind: "owned-keys" }
  >,
  compatible: McpOwnership | undefined,
): Promise<Record<string, McpOwnedValueExpectation>> {
  const snapshot = await readOwnedKeyConfig(
    provider,
    {
      kind: "owned-keys",
      path: relativePath,
      format: declaration.format,
      key_hashes: {},
    },
    cwd,
  );
  if (!snapshot) {
    return Object.fromEntries(
      declaration.keys.map((key) => [key, { present: false }]),
    );
  }
  const existing = snapshot.value;
  const occupiedKeys = declaration.keys.filter((key) => key in existing);
  if (occupiedKeys.length > 0 && compatible?.kind !== "owned-keys") {
    throw configuredMcpCollision(
      provider,
      configPath,
      `occupied key${occupiedKeys.length === 1 ? "" : "s"} ${occupiedKeys
        .map((key) => `"${key}"`)
        .join(", ")} ${
        occupiedKeys.length === 1 ? "has" : "have"
      } no compatible prior AgentSync ownership receipt`,
    );
  }
  const modifiedKey =
    compatible?.kind === "owned-keys"
      ? occupiedKeys.find(
          (key) =>
            hashSemanticValue(existing[key]) !== compatible.key_hashes[key],
        )
      : undefined;
  if (modifiedKey) {
    throw configuredMcpCollision(
      provider,
      configPath,
      `receipt-owned key "${modifiedKey}" was modified after the last successful sync`,
    );
  }
  return Object.fromEntries(
    declaration.keys.map((key) => [
      key,
      Object.hasOwn(existing, key)
        ? { present: true, value: existing[key] }
        : { present: false },
    ]),
  );
}

async function preflightManagedMcp(
  providers: readonly ToolProvider[],
  lifecycleProviders: readonly ToolProvider[],
  hasDesiredServers: boolean,
  mcps: Record<string, MCP>,
  previousOwners: Readonly<Record<string, McpOwnership>>,
  cwd: string,
): Promise<Map<string, McpProjectTarget>> {
  const resolvedTargets = hasDesiredServers
    ? await resolveMcpProjectTargets(providers, cwd)
    : new Map<string, McpProjectTarget>();
  const [preflighted] = await Promise.all([
    Promise.all(
      hasDesiredServers
        ? providers
            .filter((provider) => provider.mcpFormat)
            .map(async (provider) => {
              const previous = previousOwners[provider.name];
              const target = resolvedTargets.get(provider.name);
              if (!target) {
                throw new ConfigError(
                  `[${provider.name}] managed MCP writer has no preflighted project target.`,
                  provider.name,
                  "Repair the provider declaration before syncing MCP servers.",
                );
              }
              const [preflightedTarget] = await Promise.all([
                preflightConfiguredMcp(provider, cwd, previous, target),
                previous && previous.path !== target.relativePath
                  ? reconcileMcpOwnership(provider, previous, cwd, true)
                  : Promise.resolve(),
              ]);
              return { tool: provider.name, target: preflightedTarget };
            })
        : [],
    ),
    preflightExternalMcp(providers, lifecycleProviders, mcps, cwd),
  ]);
  return new Map(preflighted.map(({ tool, target }) => [tool, target]));
}

async function reconcileExternalMcp(
  selectedProviders: readonly ToolProvider[],
  lifecycleProviders: readonly ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
  dryRun: boolean,
): Promise<
  Pick<ManagedMcpResult, "warnings" | "removedFiles" | "modifiedFiles">
> {
  const selected = new Set(selectedProviders.map((provider) => provider.name));
  const warnings: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  for (const provider of lifecycleProviders) {
    const reconcile = provider.mcpFormat?.reconcileExternalMCP;
    if (!reconcile) continue;
    const result = await reconcile(
      selected.has(provider.name) ? mcps : {},
      cwd,
      dryRun,
    );
    warnings.push(...result.warnings);
    removedFiles.push(...result.removedFiles);
    modifiedFiles.push(...result.modifiedFiles);
  }
  return { warnings, removedFiles, modifiedFiles };
}

async function reconcilePreviousOwners(
  lifecycleProviders: readonly ToolProvider[],
  currentOwners: Readonly<Record<string, McpOwnership>>,
  previousOwners: Readonly<Record<string, McpOwnership>>,
  cwd: string,
  dryRun: boolean,
): Promise<
  Pick<
    ManagedMcpResult,
    "warnings" | "removedFiles" | "modifiedFiles" | "relinquishedTools"
  >
> {
  const warnings: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const relinquishedTools: string[] = [];
  for (const provider of lifecycleProviders) {
    const previous = previousOwners[provider.name];
    if (!previous) continue;
    if (currentOwners[provider.name]?.path === previous.path) continue;
    const reconciliation = await reconcileMcpOwnership(
      provider,
      previous,
      cwd,
      dryRun,
    );
    warnings.push(...reconciliation.warnings);
    removedFiles.push(...reconciliation.removedFiles);
    modifiedFiles.push(...reconciliation.modifiedFiles);
    if (reconciliation.relinquished) {
      relinquishedTools.push(provider.name);
    }
  }
  return { warnings, removedFiles, modifiedFiles, relinquishedTools };
}

/** Managed project-MCP lifecycle used by the sync executor. */
export async function syncManagedMCP(
  providers: ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
  options: ManagedMcpOptions = {},
): Promise<ManagedMcpResult> {
  const previousOwners = options.previousOwners ?? {};
  const hasDesiredServers = Object.keys(mcps).length > 0;
  const lifecycleProviders = selectedOrPreviouslyOwnedProviders(
    providers,
    previousOwners,
    options.filtered ?? false,
  );
  const targets = await preflightManagedMcp(
    providers,
    lifecycleProviders,
    hasDesiredServers,
    mcps,
    previousOwners,
    cwd,
  );
  const synced = hasDesiredServers
    ? await syncManagedProjectMcp(providers, mcps, cwd, targets)
    : { results: emptySyncResults(providers), owners: {} };
  const { owners, results } = synced;
  const reconciled = await reconcilePreviousOwners(
    lifecycleProviders,
    owners,
    previousOwners,
    cwd,
    false,
  );
  const external = await reconcileExternalMcp(
    providers,
    lifecycleProviders,
    mcps,
    cwd,
    false,
  );
  return {
    results,
    owners,
    ...reconciled,
    warnings: [...reconciled.warnings, ...external.warnings],
    removedFiles: [...reconciled.removedFiles, ...external.removedFiles],
    modifiedFiles: [...reconciled.modifiedFiles, ...external.modifiedFiles],
  };
}

/** Read-only MCP lifecycle projection used by `sync --dry-run`. */
export async function previewManagedMCP(
  providers: ToolProvider[],
  mcps: Record<string, MCP>,
  cwd: string,
  options: ManagedMcpOptions = {},
): Promise<ManagedMcpResult> {
  const previousOwners = options.previousOwners ?? {};
  const hasDesiredServers = Object.keys(mcps).length > 0;
  const lifecycleProviders = selectedOrPreviouslyOwnedProviders(
    providers,
    previousOwners,
    options.filtered ?? false,
  );
  const targets = await preflightManagedMcp(
    providers,
    lifecycleProviders,
    hasDesiredServers,
    mcps,
    previousOwners,
    cwd,
  );
  const currentOwners: Record<string, McpOwnership> = {};
  if (hasDesiredServers) {
    for (const provider of providers) {
      const previous = previousOwners[provider.name];
      if (
        previous &&
        previous.path === targets.get(provider.name)?.relativePath
      ) {
        currentOwners[provider.name] = previous;
      }
    }
  }
  const reconciled = await reconcilePreviousOwners(
    lifecycleProviders,
    currentOwners,
    previousOwners,
    cwd,
    true,
  );
  const external = await reconcileExternalMcp(
    providers,
    lifecycleProviders,
    mcps,
    cwd,
    true,
  );
  return {
    results: providers.map((provider) => ({
      tool: provider.name,
      serverCount: provider.mcpFormat ? Object.keys(mcps).length : 0,
      servers: provider.mcpFormat ? Object.keys(mcps) : [],
    })),
    owners: {},
    ...reconciled,
    warnings: [...reconciled.warnings, ...external.warnings],
    removedFiles: [...reconciled.removedFiles, ...external.removedFiles],
    modifiedFiles: [...reconciled.modifiedFiles, ...external.modifiedFiles],
  };
}
