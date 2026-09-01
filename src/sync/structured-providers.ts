import { SUPPORTED_TOOLS, type ToolName } from "../constants.js";
import { ConfigError } from "../core/errors.js";
import { getToolProvider } from "../tools/index.js";
import type {
  StructuredConfigProjectionInput,
  ToolProvider,
} from "../tools/types.js";
import { hashOrderedSemanticValue } from "./semantic-ownership.js";
import {
  planStructuredLifecycle,
  type StructuredLifecyclePlan,
  type StructuredProviderProjection,
  type StructuredReceiptsByProvider,
} from "./structured-lifecycle.js";

export interface ToolStructuredLifecycleRequest {
  cwd: string;
  /** Providers selected by this operation. */
  providers: readonly ToolProvider[];
  previousReceipts?: Readonly<StructuredReceiptsByProvider>;
  /** Desired canonical input; omit it to withdraw every selected claim. */
  desired?: StructuredConfigProjectionInput;
  /** Filtered mode retains receipts for providers omitted above. */
  preserveUnselected: boolean;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function declaredArtifactDependencies(provider: ToolProvider): string[] {
  return sortedUnique(
    (provider.extensionFileOutputs ?? []).flatMap((output) =>
      output.dependency ? [output.dependency] : [],
    ),
  );
}

function assertCompleteArtifactDependencies(provider: ToolProvider): void {
  const declared = declaredArtifactDependencies(provider);
  const codec = sortedUnique(
    provider.structuredConfig?.artifactDependencies ?? [],
  );
  if (
    declared.length === codec.length &&
    declared.every((dependency, index) => dependency === codec[index])
  ) {
    return;
  }
  throw new ConfigError(
    `Invalid structured-config codec for "${provider.name}": artifact dependency declarations do not match extension file groups.`,
    provider.name,
    "Declare every structured artifact dependency once on both the provider codec and its bounded extension file output.",
  );
}

async function providerProjection(
  provider: ToolProvider,
  desired: StructuredConfigProjectionInput | undefined,
  cwd: string,
): Promise<StructuredProviderProjection | undefined> {
  const codec = provider.structuredConfig;
  const artifactDependencies = declaredArtifactDependencies(provider);
  if (!codec) {
    return artifactDependencies.length > 0
      ? {
          tool: provider.name,
          declarations: [],
          claims: [],
          artifactDependencies,
        }
      : undefined;
  }
  assertCompleteArtifactDependencies(provider);
  const resolveProjectConfigPath = codec.resolveProjectConfigPath;
  const boundPath =
    desired && resolveProjectConfigPath
      ? await resolveProjectConfigPath(cwd)
      : undefined;
  const projection = desired
    ? await codec.project(desired, cwd, boundPath)
    : { claims: [] };
  return {
    tool: provider.name,
    declarations: codec.declarations,
    claims: projection.claims,
    artifactDependencies: codec.artifactDependencies,
    ...(boundPath && resolveProjectConfigPath && projection.claims.length > 0
      ? {
          pathBinding: {
            expected: boundPath,
            resolve: resolveProjectConfigPath,
          },
        }
      : {}),
  };
}

function priorTools(
  receipts: Readonly<StructuredReceiptsByProvider> | undefined,
): ToolName[] {
  return SUPPORTED_TOOLS.filter(
    (tool) => receipts?.[tool] !== undefined,
  ).sort();
}

/**
 * Project selected providers and add current empty declarations for prior-only
 * owners during full/clean/zero-tool reconciliation.
 */
export async function planToolStructuredLifecycle(
  request: ToolStructuredLifecycleRequest,
): Promise<StructuredLifecyclePlan> {
  const selected = new Set(request.providers.map((provider) => provider.name));
  const providers = [...request.providers];
  if (!request.preserveUnselected) {
    for (const tool of priorTools(request.previousReceipts)) {
      if (!selected.has(tool)) providers.push(getToolProvider(tool));
    }
  }

  const projections: StructuredProviderProjection[] = [];
  for (const provider of providers) {
    const projection = await providerProjection(
      provider,
      selected.has(provider.name) ? request.desired : undefined,
      request.cwd,
    );
    if (projection) projections.push(projection);
  }
  return planStructuredLifecycle({
    cwd: request.cwd,
    providers: projections,
    previousReceipts: request.previousReceipts,
    preserveUnselected: request.preserveUnselected,
  });
}

function projectedClaimsByTool(
  plan: StructuredLifecyclePlan,
): Map<ToolName, StructuredProviderProjection["claims"]> {
  return new Map(
    plan.request.providers.map((projection) => [
      projection.tool,
      projection.claims,
    ]),
  );
}

/**
 * Reproject canonical inputs after artifact writes and reject source drift.
 * The returned lifecycle also rereads provider configs before the final apply.
 */
export async function refreshToolStructuredLifecycle(
  request: ToolStructuredLifecycleRequest,
  expected: StructuredLifecyclePlan,
): Promise<StructuredLifecyclePlan> {
  const refreshed = await planToolStructuredLifecycle(request);
  const expectedClaims = projectedClaimsByTool(expected);
  const refreshedClaims = projectedClaimsByTool(refreshed);
  const tools = [
    ...new Set([...expectedClaims.keys(), ...refreshedClaims.keys()]),
  ].sort();
  for (const tool of tools) {
    const before = expectedClaims.get(tool) ?? [];
    const after = refreshedClaims.get(tool) ?? [];
    if (hashOrderedSemanticValue(before) === hashOrderedSemanticValue(after)) {
      continue;
    }
    throw new ConfigError(
      `Structured-config projection for "${tool}" changed after preflight.`,
      tool,
      "Restore the canonical extension and rule sources, then rerun AgentSync so config is published only for artifacts that were materialized from the same projection.",
    );
  }
  return refreshed;
}
