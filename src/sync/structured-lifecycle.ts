import { z } from "zod";
import { isToolName, SUPPORTED_TOOLS, type ToolName } from "../constants.js";
import { ConfigError } from "../core/errors.js";
import {
  type AppliedStructuredState,
  type ApplyStructuredStateOptions,
  applyStructuredStatePlan,
  planStructuredState,
  type StructuredConfigDeclaration,
  type StructuredConfigPlan,
  type StructuredConfigReceipt,
  type StructuredRelinquishment,
  type StructuredStateClaim,
  type StructuredStatePlan,
  type StructuredStateReceipts,
  StructuredStateReceiptsSchema,
} from "./structured-state.js";

/** Current structured-config projection declared by one tool provider. */
export interface StructuredProviderProjection {
  tool: ToolName;
  declarations: readonly StructuredConfigDeclaration[];
  claims: readonly StructuredStateClaim[];
  /** Complete provider artifact groups that structured state may reference. */
  artifactDependencies: readonly string[];
  /** Dynamic active path bound when these desired claims were projected. */
  pathBinding?: {
    expected: string;
    resolve(cwd: string): Promise<string>;
  };
}

/** Provider-keyed semantic receipts suitable for manifest persistence. */
export type StructuredReceiptsByProvider = Partial<
  Record<ToolName, StructuredStateReceipts>
>;

/** Validated provider-keyed receipt map persisted by the sync manifest. */
export const StructuredReceiptsByProviderSchema = z
  .record(z.string().min(1), StructuredStateReceiptsSchema)
  .superRefine((receipts, context) => {
    for (const tool of Object.keys(receipts)) {
      if (isToolName(tool)) continue;
      context.addIssue({
        code: "custom",
        message: `structured receipt owner "${tool}" is unsupported`,
        path: [tool],
      });
    }
  });

export interface StructuredLifecycleRequest {
  cwd: string;
  /**
   * Providers processed by this operation. Keep a provider here with its
   * declarations and empty claims to withdraw unchanged owned state. Omitting
   * it either preserves its receipt (filtered mode) or relinquishes the receipt
   * as undeclared/incompatible (full mode) without inspecting its config.
   */
  providers: readonly StructuredProviderProjection[];
  previousReceipts?: Readonly<
    Partial<Record<ToolName, Readonly<Record<string, StructuredConfigReceipt>>>>
  >;
  /** Keep receipts for providers omitted by a filtered operation. */
  preserveUnselected: boolean;
}

export interface StructuredProviderRelinquishment
  extends StructuredRelinquishment {
  tool: ToolName;
}

/** Provider partition of one combined structured-state plan. */
export interface StructuredProviderLifecyclePlan {
  tool: ToolName;
  configs: StructuredConfigPlan[];
  nextReceipts: StructuredStateReceipts;
  warnings: string[];
  relinquishments: StructuredProviderRelinquishment[];
  protectedDependencies: string[];
  configChanged: boolean;
  receiptChanged: boolean;
  changed: boolean;
}

export type StructuredProtectedDependenciesByProvider = Partial<
  Record<ToolName, string[]>
>;

/** Combined preflight plus provider partitions used for manifest publication. */
export interface StructuredLifecyclePlan {
  request: StructuredLifecycleRequest;
  statePlan: StructuredStatePlan;
  providers: StructuredProviderLifecyclePlan[];
  nextReceipts: StructuredReceiptsByProvider;
  warnings: string[];
  relinquishments: StructuredProviderRelinquishment[];
  protectedDependencies: StructuredProtectedDependenciesByProvider;
  configChanged: boolean;
  receiptChanged: boolean;
  changed: boolean;
}

export interface AppliedStructuredLifecycle {
  plan: StructuredLifecyclePlan;
  writtenFiles: string[];
  removedFiles: string[];
}

interface PreparedLifecycle {
  request: StructuredLifecycleRequest;
  declarationOwners: Map<string, ToolName>;
  pathOwners: Map<string, ToolName>;
  artifactDependencies: Map<ToolName, string[]>;
  preservedReceipts: Map<ToolName, StructuredStateReceipts>;
  providerTools: ToolName[];
  stateRequest: {
    cwd: string;
    declarations: StructuredConfigDeclaration[];
    claims: StructuredStateClaim[];
    previousReceipts: Record<string, StructuredConfigReceipt>;
  };
}

interface MutableProviderPartition {
  tool: ToolName;
  configs: StructuredConfigPlan[];
  nextReceipts: StructuredStateReceipts;
  warnings: string[];
  relinquishments: StructuredProviderRelinquishment[];
  protectedDependencies: Set<string>;
}

function lifecycleError(message: string, recovery: string): ConfigError {
  return new ConfigError(message, undefined, recovery);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function cloneReceipts(
  receipts: Readonly<Record<string, StructuredConfigReceipt>>,
): StructuredStateReceipts {
  return Object.fromEntries(
    Object.entries(receipts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, receipt]) => [
        relativePath,
        structuredClone(receipt),
      ]),
  );
}

function validatePreviousProviderKeys(
  request: StructuredLifecycleRequest,
): void {
  for (const tool of Object.keys(request.previousReceipts ?? {})) {
    if (isToolName(tool)) continue;
    throw lifecycleError(
      `Invalid structured-state receipt owner "${tool}": the provider is unsupported.`,
      "Remove the invalid provider receipt only after preserving any user-authored configuration, then rerun AgentSync.",
    );
  }
}

function declarationDependencies(
  declaration: StructuredConfigDeclaration,
): string[] {
  return [
    ...(declaration.keys ?? []).flatMap((entry) => entry.dependencies ?? []),
    ...(declaration.arraySlices ?? []).flatMap(
      (entry) => entry.dependencies ?? [],
    ),
  ];
}

function validateArtifactDependencies(
  projection: StructuredProviderProjection,
): string[] {
  const blank = projection.artifactDependencies.find(
    (dependency) => dependency.trim() === "",
  );
  if (blank !== undefined) {
    throw lifecycleError(
      `Invalid structured-state projection for "${projection.tool}": an artifact dependency is blank.`,
      "Declare every provider artifact group with a unique nonblank identifier.",
    );
  }
  const dependencies = new Set(projection.artifactDependencies);
  if (dependencies.size !== projection.artifactDependencies.length) {
    throw lifecycleError(
      `Invalid structured-state projection for "${projection.tool}": artifact dependencies contain duplicates.`,
      "Declare every provider artifact group exactly once.",
    );
  }
  const undeclared = projection.declarations
    .flatMap(declarationDependencies)
    .find((dependency) => !dependencies.has(dependency));
  if (undeclared !== undefined) {
    throw lifecycleError(
      `Invalid structured-state projection for "${projection.tool}": config dependency "${undeclared}" is absent from artifactDependencies.`,
      "Add the dependency to the provider's complete artifact dependency declaration.",
    );
  }
  return [...dependencies].sort();
}

function indexProjectionDeclarations(
  projection: StructuredProviderProjection,
  declarationOwners: Map<string, ToolName>,
): Set<string> {
  const ownPaths = new Set<string>();
  for (const declaration of projection.declarations) {
    if (ownPaths.has(declaration.path)) {
      throw lifecycleError(
        `Invalid structured-state projection for "${projection.tool}": path "${declaration.path}" is declared more than once.`,
        "Grant each exact structured-config path to one declaration.",
      );
    }
    const existingOwner = declarationOwners.get(declaration.path);
    if (existingOwner) {
      throw lifecycleError(
        `Conflicting structured-state authority for path "${declaration.path}": both "${existingOwner}" and "${projection.tool}" declare it.`,
        "Grant each exact structured-config path to only one provider.",
      );
    }
    ownPaths.add(declaration.path);
    declarationOwners.set(declaration.path, projection.tool);
  }
  return ownPaths;
}

function validateProjectionClaims(
  projection: StructuredProviderProjection,
  ownPaths: ReadonlySet<string>,
): void {
  const foreign = projection.claims.find((claim) => !ownPaths.has(claim.path));
  if (!foreign) return;
  throw lifecycleError(
    `Invalid structured-state projection for "${projection.tool}": claim path "${foreign.path}" is not declared by that provider.`,
    "Emit claims only for exact paths declared by the same provider projection.",
  );
}

function indexProjections(request: StructuredLifecycleRequest): {
  projections: Map<ToolName, StructuredProviderProjection>;
  declarationOwners: Map<string, ToolName>;
  artifactDependencies: Map<ToolName, string[]>;
} {
  const projections = new Map<ToolName, StructuredProviderProjection>();
  const declarationOwners = new Map<string, ToolName>();
  const artifactDependencies = new Map<ToolName, string[]>();
  for (const projection of request.providers) {
    if (!isToolName(projection.tool)) {
      throw lifecycleError(
        `Invalid structured-state projection owner "${projection.tool}": the provider is unsupported.`,
        "Emit structured-state projections only for supported providers.",
      );
    }
    if (projections.has(projection.tool)) {
      throw lifecycleError(
        `Duplicate structured-state projection for provider "${projection.tool}".`,
        "Combine each provider's declarations and claims into exactly one projection.",
      );
    }
    const ownPaths = indexProjectionDeclarations(projection, declarationOwners);
    validateProjectionClaims(projection, ownPaths);
    artifactDependencies.set(
      projection.tool,
      validateArtifactDependencies(projection),
    );
    projections.set(projection.tool, projection);
  }
  return { projections, declarationOwners, artifactDependencies };
}

function previousReceiptEntries(
  request: StructuredLifecycleRequest,
): Array<[ToolName, Readonly<Record<string, StructuredConfigReceipt>>]> {
  const entries: Array<
    [ToolName, Readonly<Record<string, StructuredConfigReceipt>>]
  > = [];
  for (const tool of [...SUPPORTED_TOOLS].sort()) {
    const receipts = request.previousReceipts?.[tool];
    if (receipts) entries.push([tool, receipts]);
  }
  return entries;
}

function indexReceiptOwners(
  entries: readonly [
    ToolName,
    Readonly<Record<string, StructuredConfigReceipt>>,
  ][],
  declarationOwners: ReadonlyMap<string, ToolName>,
): Map<string, ToolName> {
  const receiptOwners = new Map<string, ToolName>();
  for (const [tool, receipts] of entries) {
    for (const relativePath of Object.keys(receipts).sort()) {
      const previousOwner = receiptOwners.get(relativePath);
      if (previousOwner && previousOwner !== tool) {
        throw lifecycleError(
          `Conflicting structured-state receipts for path "${relativePath}": both "${previousOwner}" and "${tool}" claim authority.`,
          "Preserve the config and discard the ambiguous receipts before retrying.",
        );
      }
      const declaredOwner = declarationOwners.get(relativePath);
      if (declaredOwner && declaredOwner !== tool) {
        throw lifecycleError(
          `Conflicting structured-state authority for path "${relativePath}": receipt owner "${tool}" differs from provider "${declaredOwner}".`,
          "Do not transfer semantic ownership between providers; preserve the config and resolve the stale receipt first.",
        );
      }
      receiptOwners.set(relativePath, tool);
    }
  }
  return receiptOwners;
}

function prepareLifecycle(
  request: StructuredLifecycleRequest,
): PreparedLifecycle {
  validatePreviousProviderKeys(request);
  const indexed = indexProjections(request);
  const receiptEntries = previousReceiptEntries(request);
  const receiptOwners = indexReceiptOwners(
    receiptEntries,
    indexed.declarationOwners,
  );
  const pathOwners = new Map(receiptOwners);
  for (const [relativePath, tool] of indexed.declarationOwners) {
    pathOwners.set(relativePath, tool);
  }

  const previousReceipts: Record<string, StructuredConfigReceipt> = {};
  const preservedReceipts = new Map<ToolName, StructuredStateReceipts>();
  for (const [tool, receipts] of receiptEntries) {
    if (request.preserveUnselected && !indexed.projections.has(tool)) {
      preservedReceipts.set(tool, cloneReceipts(receipts));
      continue;
    }
    for (const [relativePath, receipt] of Object.entries(receipts).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      previousReceipts[relativePath] = structuredClone(receipt);
    }
  }

  const orderedProjections = [...indexed.projections.values()].sort(
    (left, right) => left.tool.localeCompare(right.tool),
  );
  const providerTools = sortedUnique([
    ...orderedProjections.map((projection) => projection.tool),
    ...receiptEntries.map(([tool]) => tool),
  ]).filter(isToolName);
  return {
    request,
    declarationOwners: indexed.declarationOwners,
    pathOwners,
    artifactDependencies: indexed.artifactDependencies,
    preservedReceipts,
    providerTools,
    stateRequest: {
      cwd: request.cwd,
      declarations: orderedProjections.flatMap(
        (projection) => projection.declarations,
      ),
      claims: orderedProjections.flatMap((projection) => projection.claims),
      previousReceipts,
    },
  };
}

function ownerFor(
  owners: ReadonlyMap<string, ToolName>,
  relativePath: string,
): ToolName {
  const owner = owners.get(relativePath);
  if (owner) return owner;
  throw lifecycleError(
    `Cannot partition structured-state result for unowned path "${relativePath}".`,
    "Repair the lifecycle planner so every result path retains its provider identity.",
  );
}

function createPartitions(
  prepared: PreparedLifecycle,
): Map<ToolName, MutableProviderPartition> {
  return new Map(
    prepared.providerTools.map((tool) => [
      tool,
      {
        tool,
        configs: [],
        nextReceipts: {},
        warnings: [],
        relinquishments: [],
        protectedDependencies: new Set<string>(),
      },
    ]),
  );
}

function partitionFor(
  partitions: ReadonlyMap<ToolName, MutableProviderPartition>,
  tool: ToolName,
): MutableProviderPartition {
  const partition = partitions.get(tool);
  if (partition) return partition;
  throw lifecycleError(
    `Cannot partition structured-state result for provider "${tool}".`,
    "Repair the lifecycle planner so every current or prior provider has a result partition.",
  );
}

function partitionConfigs(
  statePlan: StructuredStatePlan,
  prepared: PreparedLifecycle,
  partitions: ReadonlyMap<ToolName, MutableProviderPartition>,
): void {
  for (const config of statePlan.configs) {
    const tool = ownerFor(prepared.declarationOwners, config.declaration.path);
    const partition = partitionFor(partitions, tool);
    partition.configs.push(config);
    partition.warnings.push(...config.warnings);
  }
}

function undeclaredReceiptWarning(
  tool: ToolName,
  relativePath: string,
): string {
  return `[${tool}] ignored structured-state ownership receipt for undeclared path "${relativePath}" and relinquished AgentSync ownership`;
}

function partitionRelinquishments(
  statePlan: StructuredStatePlan,
  prepared: PreparedLifecycle,
  partitions: ReadonlyMap<ToolName, MutableProviderPartition>,
): void {
  const configuredPaths = new Set(
    statePlan.configs.map((config) => config.declaration.path),
  );
  for (const relinquishment of statePlan.relinquishments) {
    const tool = ownerFor(prepared.pathOwners, relinquishment.path);
    const partition = partitionFor(partitions, tool);
    const providerRelinquishment = { tool, ...relinquishment };
    partition.relinquishments.push(providerRelinquishment);
    if (
      relinquishment.kind === "config" &&
      relinquishment.reason === "incompatible" &&
      !configuredPaths.has(relinquishment.path)
    ) {
      partition.warnings.push(
        undeclaredReceiptWarning(tool, relinquishment.path),
      );
    }
    if (relinquishment.reason === "modified") {
      for (const dependency of relinquishment.dependencies) {
        partition.protectedDependencies.add(dependency);
      }
    }
    if (relinquishment.reason === "incompatible") {
      for (const dependency of prepared.artifactDependencies.get(tool) ?? []) {
        partition.protectedDependencies.add(dependency);
      }
    }
  }
}

function partitionNextReceipts(
  statePlan: StructuredStatePlan,
  prepared: PreparedLifecycle,
  partitions: ReadonlyMap<ToolName, MutableProviderPartition>,
): void {
  for (const [tool, receipts] of prepared.preservedReceipts) {
    partitionFor(partitions, tool).nextReceipts = cloneReceipts(receipts);
  }
  for (const [relativePath, receipt] of Object.entries(
    statePlan.nextReceipts,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const tool = ownerFor(prepared.declarationOwners, relativePath);
    partitionFor(partitions, tool).nextReceipts[relativePath] =
      structuredClone(receipt);
  }
}

function receiptChangedFor(partition: MutableProviderPartition): boolean {
  return (
    partition.configs.some((config) => config.receiptChanged) ||
    partition.relinquishments.some(
      (relinquishment) => relinquishment.kind === "config",
    )
  );
}

function finalizeProviderPlan(
  partition: MutableProviderPartition,
): StructuredProviderLifecyclePlan {
  const configChanged = partition.configs.some(
    (config) => config.configChanged,
  );
  const receiptChanged = receiptChangedFor(partition);
  return {
    tool: partition.tool,
    configs: partition.configs,
    nextReceipts: partition.nextReceipts,
    warnings: partition.warnings,
    relinquishments: partition.relinquishments,
    protectedDependencies: [...partition.protectedDependencies].sort(),
    configChanged,
    receiptChanged,
    changed: configChanged || receiptChanged,
  };
}

function collectNextReceipts(
  providers: readonly StructuredProviderLifecyclePlan[],
): StructuredReceiptsByProvider {
  return Object.fromEntries(
    providers.flatMap((provider) =>
      Object.keys(provider.nextReceipts).length > 0
        ? [[provider.tool, provider.nextReceipts]]
        : [],
    ),
  );
}

function collectProtectedDependencies(
  providers: readonly StructuredProviderLifecyclePlan[],
): StructuredProtectedDependenciesByProvider {
  return Object.fromEntries(
    providers.flatMap((provider) =>
      provider.protectedDependencies.length > 0
        ? [[provider.tool, provider.protectedDependencies]]
        : [],
    ),
  );
}

function partitionLifecyclePlan(
  prepared: PreparedLifecycle,
  statePlan: StructuredStatePlan,
): StructuredLifecyclePlan {
  const partitions = createPartitions(prepared);
  partitionConfigs(statePlan, prepared, partitions);
  partitionRelinquishments(statePlan, prepared, partitions);
  partitionNextReceipts(statePlan, prepared, partitions);
  const providers = [...partitions.values()]
    .map(finalizeProviderPlan)
    .sort((left, right) => left.tool.localeCompare(right.tool));
  const configChanged = providers.some((provider) => provider.configChanged);
  const receiptChanged = providers.some((provider) => provider.receiptChanged);
  return {
    request: prepared.request,
    statePlan,
    providers,
    nextReceipts: collectNextReceipts(providers),
    warnings: providers.flatMap((provider) => provider.warnings),
    relinquishments: providers.flatMap((provider) => provider.relinquishments),
    protectedDependencies: collectProtectedDependencies(providers),
    configChanged,
    receiptChanged,
    changed: configChanged || receiptChanged,
  };
}

/** Preflight every provider in one shared structured-state filesystem plan. */
export async function planStructuredLifecycle(
  request: StructuredLifecycleRequest,
): Promise<StructuredLifecyclePlan> {
  const prepared = prepareLifecycle(request);
  const statePlan = await planStructuredState(prepared.stateRequest);
  return partitionLifecyclePlan(prepared, statePlan);
}

/**
 * Re-read every provider config, then apply the refreshed combined plan.
 *
 * Receipt and protection publication must consume the returned `plan`, never
 * the stale input plan, because the applicator preserves concurrent unrelated
 * edits and can discover newly modified managed state during its re-read.
 */
export async function applyStructuredLifecyclePlan(
  plan: StructuredLifecyclePlan,
  options: ApplyStructuredStateOptions = {},
): Promise<AppliedStructuredLifecycle> {
  // Validate and freeze the provider partition map before any config write.
  const prepared = prepareLifecycle(plan.request);
  const applied: AppliedStructuredState = await applyStructuredStatePlan(
    plan.statePlan,
    options,
    async () => {
      for (const projection of plan.request.providers) {
        const binding = projection.pathBinding;
        if (!binding) continue;
        const actual = await binding.resolve(plan.request.cwd);
        if (actual === binding.expected) continue;
        throw lifecycleError(
          `Structured-config target for "${projection.tool}" changed after preflight from "${binding.expected}" to "${actual}".`,
          "Preserve the newly active config, then rerun AgentSync against the current provider path precedence.",
        );
      }
    },
  );
  return {
    plan: partitionLifecyclePlan(prepared, applied.plan),
    writtenFiles: applied.writtenFiles,
    removedFiles: applied.removedFiles,
  };
}
