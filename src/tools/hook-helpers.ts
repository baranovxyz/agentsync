import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  realpath,
  stat,
} from "node:fs/promises";
import * as path from "node:path";
import { ConfigError } from "../core/errors.js";
import { toPosixPath } from "../utils/path-normalization.js";
import { assertSafeProjectOutputFile } from "../utils/project-output.js";

/** Convert canonical hook milliseconds to a provider's whole-second field. */
export function hookTimeoutSeconds(milliseconds: number): number {
  return Math.ceil(milliseconds / 1000);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

interface HookMaterializationPaths {
  destination: string;
  destinationRoot: string;
  source: string;
}

function hookMaterializationPaths(
  command: string,
  cwd: string,
  destinationDir: string,
): HookMaterializationPaths | undefined {
  if (
    path.isAbsolute(command) ||
    !command.includes("/") ||
    /\s/.test(command)
  ) {
    return undefined;
  }
  const source = path.resolve(cwd, command);
  const sourceRel = path.relative(cwd, source);
  if (sourceRel === "" || !isWithin(cwd, source)) return undefined;
  const canonicalPrefix = path.join(".agents", "hooks", "scripts");
  const destinationRel = sourceRel.startsWith(`${canonicalPrefix}${path.sep}`)
    ? sourceRel.slice(canonicalPrefix.length + 1)
    : sourceRel;
  const destinationRoot = path.resolve(cwd, destinationDir);
  const destination = path.resolve(destinationRoot, destinationRel);
  return isWithin(cwd, destinationRoot) &&
    destination !== destinationRoot &&
    isWithin(destinationRoot, destination)
    ? { destination, destinationRoot, source }
    : undefined;
}

/** Read-only validation of the destination a hook command would materialize. */
export async function preflightHookCommand(
  command: string,
  cwd: string,
  destinationDir: string,
): Promise<void> {
  await eligibleHookMaterialization(command, cwd, destinationDir);
}

async function eligibleHookMaterialization(
  command: string,
  cwd: string,
  destinationDir: string,
): Promise<HookMaterializationPaths | undefined> {
  const projection = hookMaterializationPaths(command, cwd, destinationDir);
  if (!projection) return undefined;

  // A declaration that already points into the provider directory is manual
  // provider configuration, not a canonical source to copy and own.
  if (isWithin(projection.destinationRoot, projection.source)) return undefined;

  try {
    const [realCwd, realSource] = await Promise.all([
      realpath(cwd),
      realpath(projection.source),
    ]);
    if (!(isWithin(realCwd, realSource) && (await stat(realSource)).isFile())) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  // Missing and ineligible sources produce no output, so they must not make
  // an otherwise unrelated destination participate in collision preflight.
  await assertSafeProjectOutputFile(cwd, projection.destination);
  return projection;
}

/** Exact destination planned for an existing, safe project hook script. */
export async function previewHookCommandFile(
  command: string,
  cwd: string,
  destinationDir: string,
): Promise<string | undefined> {
  return (await eligibleHookMaterialization(command, cwd, destinationDir))
    ?.destination;
}

/** Exact provider-facing command plus its optional generated artifact. */
export interface HookCommandProjection {
  /** Canonical command before provider-specific materialization. */
  sourceCommand: string;
  command: string;
  generatedFile?: string;
}

export async function projectHookCommand(
  command: string,
  cwd: string,
  destinationDir: string,
): Promise<HookCommandProjection> {
  const generatedFile = await previewHookCommandFile(
    command,
    cwd,
    destinationDir,
  );
  return generatedFile
    ? {
        sourceCommand: command,
        command: toPosixPath(path.relative(cwd, generatedFile)),
        generatedFile,
      }
    : { sourceCommand: command, command };
}

/** Materialize exactly one prior projection or fail instead of changing it. */
export async function materializeProjectedHookCommand(
  projection: HookCommandProjection,
  cwd: string,
  destinationDir: string,
): Promise<void> {
  const materialized = await materializeHookCommand(
    projection.sourceCommand,
    cwd,
    destinationDir,
  );
  if (materialized === projection.command) return;
  throw new ConfigError(
    `Hook command "${projection.sourceCommand}" could not be materialized as the preflight projection "${projection.command}".`,
    projection.generatedFile,
    "Restore the projected hook source and destination, then rerun AgentSync so provider config never references a missing generated script.",
  );
}

/** Exact, de-duplicated hook destinations, rejecting ambiguous source maps. */
export async function previewHookCommandFiles(
  commands: readonly string[],
  cwd: string,
  destinationDir: string,
): Promise<string[]> {
  const projections: HookMaterializationPaths[] = [];
  for (const command of commands) {
    const projection = await eligibleHookMaterialization(
      command,
      cwd,
      destinationDir,
    );
    if (projection) projections.push(projection);
  }

  const sourcesByDestination = new Map<string, Set<string>>();
  for (const { destination, source } of projections) {
    const sources = sourcesByDestination.get(destination) ?? new Set<string>();
    sources.add(source);
    sourcesByDestination.set(destination, sources);
  }
  const collision = [...sourcesByDestination.entries()]
    .filter(([, sources]) => sources.size > 1)
    .sort(([left], [right]) => left.localeCompare(right))[0];
  if (collision) {
    const [destination, sources] = collision;
    const relativeSources = [...sources]
      .map((source) => toPosixPath(path.relative(cwd, source)))
      .sort();
    throw new ConfigError(
      `Hook scripts ${relativeSources.map((source) => `"${source}"`).join(" and ")} resolve to the same generated destination "${toPosixPath(path.relative(cwd, destination))}".`,
      destination,
      "Use unique project-relative paths for hook commands.",
    );
  }

  return [...sourcesByDestination.keys()];
}

/**
 * Copy a simple project-relative hook script into a provider-owned directory.
 * Absolute and bare commands remain unchanged, matching shell-command semantics.
 */
export async function materializeHookCommand(
  command: string,
  cwd: string,
  destinationDir: string,
): Promise<string> {
  const projection = await eligibleHookMaterialization(
    command,
    cwd,
    destinationDir,
  );
  if (!projection) return command;
  const { destination, destinationRoot } = projection;
  try {
    const [realCwd, realSource] = await Promise.all([
      realpath(cwd),
      realpath(projection.source),
    ]);
    await mkdir(path.dirname(destination), { recursive: true });
    const [realDestinationRoot, realDestinationParent] = await Promise.all([
      realpath(destinationRoot),
      realpath(path.dirname(destination)),
    ]);
    if (
      !(
        isWithin(realCwd, realDestinationRoot) &&
        isWithin(realDestinationRoot, realDestinationParent)
      )
    ) {
      return command;
    }
    try {
      if ((await lstat(destination)).isSymbolicLink()) return command;
    } catch {
      // A missing destination is the normal first-sync case.
    }
    await copyFile(realSource, destination);
    await chmod(destination, 0o755);
    return toPosixPath(path.relative(cwd, destination));
  } catch {
    // Preserve the declaration so the target tool reports a missing script.
    return command;
  }
}
