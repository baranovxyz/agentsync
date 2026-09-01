/** Project canonical extensions through provider-native codecs. */

import { ConfigError } from "../core/errors.js";
import type { ToolExtensionsInput, ToolProvider } from "../tools/types.js";
import type { HookSpec } from "../types/schemas.js";
import type { StructuredProtectedDependenciesByProvider } from "./structured-lifecycle.js";
import { unsupportedExtensionWarning } from "./surface-warning.js";

type PermissionsConfig = ToolExtensionsInput["permissions"];
type StatuslineConfig = ToolExtensionsInput["statusline"];
type OutputStyleConfig = ToolExtensionsInput["outputStyle"];
type ProjectionMode = "preview" | "write";

interface ExtensionProjection {
  warnings: string[];
  generatedFiles?: string[];
}

export interface ExtensionsSyncResult {
  tool: string;
  hooksWritten: number;
  permissionsWritten: boolean;
  statuslineWritten: boolean;
  outputStyleWritten: boolean;
  /** Absolute provider artifact paths planned or actually written. */
  generatedFiles: string[];
  warnings: string[];
  droppedHooks: Array<{ event: string; id: string; reason: string }>;
}

export interface ExtensionsInput extends ToolExtensionsInput {}

export interface ExtensionsLifecycleOptions {
  protectedDependencies?: StructuredProtectedDependenciesByProvider;
}

function emptyResult(tool: string): ExtensionsSyncResult {
  return {
    tool,
    hooksWritten: 0,
    permissionsWritten: false,
    statuslineWritten: false,
    outputStyleWritten: false,
    generatedFiles: [],
    warnings: [],
    droppedHooks: [],
  };
}

function recordProjection(
  result: ExtensionsSyncResult,
  projection: ExtensionProjection,
): void {
  result.warnings.push(...projection.warnings);
  result.generatedFiles = [
    ...new Set([
      ...result.generatedFiles,
      ...(projection.generatedFiles ?? []),
    ]),
  ];
}

function hookCount(hooks: Record<string, HookSpec[]>): number {
  return Object.values(hooks).reduce((count, specs) => count + specs.length, 0);
}

function unsupportedHooks(
  provider: ToolProvider,
  hooks: Record<string, HookSpec[]>,
): ExtensionsSyncResult["droppedHooks"] {
  return Object.entries(hooks).flatMap(([event, specs]) =>
    specs.map((spec) => ({
      event,
      id: spec.id,
      reason: `${provider.name} does not support hooks`,
    })),
  );
}

function protectedArtifactWarning(tool: string, surface: string): string {
  return `[${tool}] preserved ${surface} artifacts because related structured config was preserved; relinquished AgentSync file ownership`;
}

function artifactIsProtected(
  dependency: string | undefined,
  protectedDependencies: ReadonlySet<string>,
): boolean {
  return dependency !== undefined && protectedDependencies.has(dependency);
}

async function projectHooks(
  provider: ToolProvider,
  hooks: Record<string, HookSpec[]> | undefined,
  cwd: string,
  protectedDependencies: ReadonlySet<string>,
  mode: ProjectionMode,
  result: ExtensionsSyncResult,
): Promise<void> {
  if (!hooks || Object.keys(hooks).length === 0) return;
  const format = provider.hooksFormat;
  if (!(provider.capabilities.hooks && format)) {
    result.droppedHooks.push(...unsupportedHooks(provider, hooks));
    return;
  }
  if (artifactIsProtected(format.artifactDependency, protectedDependencies)) {
    result.warnings.push(protectedArtifactWarning(provider.name, "hook"));
    return;
  }

  const projection =
    mode === "write"
      ? await format.writeHooks(hooks, cwd)
      : await format.previewHooks(hooks, cwd);
  result.droppedHooks = projection.dropped;
  recordProjection(result, {
    warnings: projection.warnings ?? [],
    generatedFiles: projection.generatedFiles,
  });
  result.hooksWritten = hookCount(hooks) - result.droppedHooks.length;
}

interface OptionalSurfaceProjection<T> {
  value: T | undefined;
  supported: boolean;
  surface: string;
  dependency?: string;
  protectedDependencies: ReadonlySet<string>;
  project?: (value: T) => Promise<ExtensionProjection>;
  result: ExtensionsSyncResult;
}

async function projectOptionalSurface<T>(
  input: OptionalSurfaceProjection<T>,
): Promise<boolean> {
  if (!input.value) return false;
  const protectedArtifact = artifactIsProtected(
    input.dependency,
    input.protectedDependencies,
  );
  if (!(input.supported && input.project)) {
    input.result.warnings.push(
      unsupportedExtensionWarning(input.result.tool, input.surface),
    );
    return false;
  }
  if (protectedArtifact) {
    input.result.warnings.push(
      protectedArtifactWarning(input.result.tool, input.surface),
    );
    return false;
  }
  recordProjection(input.result, await input.project(input.value));
  return true;
}

async function projectProviderExtensions(
  provider: ToolProvider,
  input: ExtensionsInput,
  cwd: string,
  protectedDependencies: ReadonlySet<string>,
  mode: ProjectionMode,
): Promise<ExtensionsSyncResult> {
  const result = emptyResult(provider.name);
  const reconciler = provider.extensionsReconciler;
  if (reconciler) {
    if (mode === "preview") {
      await reconciler.preflight(input, cwd);
    } else {
      result.warnings.push(
        ...(await reconciler.reconcile(input, cwd)).warnings,
      );
    }
  }

  await projectHooks(
    provider,
    input.hooks,
    cwd,
    protectedDependencies,
    mode,
    result,
  );

  const permissionsFormat = provider.permissionsFormat;
  result.permissionsWritten = await projectOptionalSurface<
    NonNullable<PermissionsConfig>
  >({
    value: input.permissions,
    supported: !!(provider.capabilities.permissions && permissionsFormat),
    surface: "permissions",
    protectedDependencies,
    project: permissionsFormat
      ? (value) =>
          mode === "write"
            ? permissionsFormat.writePermissions(value, cwd)
            : permissionsFormat.previewPermissions(value, cwd)
      : undefined,
    result,
  });

  const statuslineFormat = provider.statuslineFormat;
  result.statuslineWritten = await projectOptionalSurface<
    NonNullable<StatuslineConfig>
  >({
    value: input.statusline,
    supported: !!(provider.capabilities.statusline && statuslineFormat),
    surface: "statusline",
    dependency: statuslineFormat?.artifactDependency,
    protectedDependencies,
    project: statuslineFormat
      ? (value) =>
          mode === "write"
            ? statuslineFormat.writeStatusline(value, cwd)
            : statuslineFormat.previewStatusline(value, cwd)
      : undefined,
    result,
  });

  const outputStyleFormat = provider.outputStyleFormat;
  result.outputStyleWritten = await projectOptionalSurface<
    NonNullable<OutputStyleConfig>
  >({
    value: input.outputStyle,
    supported: !!(provider.capabilities.outputStyle && outputStyleFormat),
    surface: "output style",
    dependency: outputStyleFormat?.artifactDependency,
    protectedDependencies,
    project: outputStyleFormat
      ? (value) =>
          mode === "write"
            ? outputStyleFormat.writeOutputStyle(value, cwd)
            : outputStyleFormat.previewOutputStyle(value, cwd)
      : undefined,
    result,
  });
  return result;
}

export async function syncExtensions(
  providers: ToolProvider[],
  input: ExtensionsInput,
  cwd: string,
  options: ExtensionsLifecycleOptions = {},
): Promise<ExtensionsSyncResult[]> {
  const results: ExtensionsSyncResult[] = [];
  for (const provider of providers) {
    results.push(
      await projectProviderExtensions(
        provider,
        input,
        cwd,
        new Set(options.protectedDependencies?.[provider.name] ?? []),
        "write",
      ),
    );
  }
  return results;
}

/** Read-only extension projection for dry-run. */
export async function previewExtensions(
  providers: ToolProvider[],
  input: ExtensionsInput,
  cwd: string,
  options: ExtensionsLifecycleOptions = {},
): Promise<ExtensionsSyncResult[]> {
  return Promise.all(
    providers.map((provider) =>
      projectProviderExtensions(
        provider,
        input,
        cwd,
        new Set(options.protectedDependencies?.[provider.name] ?? []),
        "preview",
      ),
    ),
  );
}

/** Flatten per-provider extension loss into the user-facing warning stream. */
export function extensionWarnings(
  results: readonly ExtensionsSyncResult[],
): string[] {
  return results.flatMap((result) => [
    ...result.warnings,
    ...result.droppedHooks.map(
      (drop) =>
        `[${result.tool}] hook ${drop.id} for ${drop.event} dropped: ${drop.reason}`,
    ),
  ]);
}

/** Reject any artifact set that no longer matches the read-only preflight. */
export function assertExtensionArtifactParity(
  expected: readonly ExtensionsSyncResult[],
  actual: readonly ExtensionsSyncResult[],
): void {
  const actualByTool = new Map(actual.map((result) => [result.tool, result]));
  for (const projection of expected) {
    const expectedFiles = [...projection.generatedFiles].sort();
    const actualFiles = [
      ...(actualByTool.get(projection.tool)?.generatedFiles ?? []),
    ].sort();
    if (JSON.stringify(expectedFiles) === JSON.stringify(actualFiles)) continue;
    throw new ConfigError(
      `Extension artifacts for "${projection.tool}" changed after preflight.`,
      projection.tool,
      "Restore the canonical extension sources and generated destinations, then rerun AgentSync so structured config references only the exact artifacts materialized during this sync.",
    );
  }
}
