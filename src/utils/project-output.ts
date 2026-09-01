import type { Stats } from "node:fs";
import { lstat, readlink, realpath, stat } from "node:fs/promises";
import * as path from "node:path";
import { ConfigError, getErrorMessage } from "../core/errors.js";

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
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

async function realExistingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function lstatIfPresent(candidate: string): Promise<Stats | undefined> {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

function unsafeOutputError(
  projectRoot: string,
  destination: string,
): ConfigError {
  return new ConfigError(
    `Refusing to write project output through a path outside the project: ${destination}`,
    destination,
    `Replace the symlink with a path inside "${projectRoot}", or remove it and rerun agentsync sync.`,
  );
}

async function assertSymlinkTargetInside(
  projectRoot: string,
  realProjectRoot: string,
  candidate: string,
): Promise<void> {
  const link = await readlink(candidate);
  const target = path.resolve(path.dirname(candidate), link);
  const realTargetAncestor = await realExistingAncestor(target);
  const targetIsLexicallyInside =
    isWithin(projectRoot, target) || isWithin(realProjectRoot, target);
  if (
    !(targetIsLexicallyInside && isWithin(realProjectRoot, realTargetAncestor))
  ) {
    throw unsafeOutputError(projectRoot, candidate);
  }
}

/**
 * Fail closed before mutating a generated project output.
 *
 * The destination must be lexically below `projectRoot`, and every existing
 * symlink in its ancestry (including the destination leaf) must resolve back
 * inside the same real project root. Dangling symlinks are checked against
 * their nearest existing target ancestor rather than treated as absent.
 */
export async function assertSafeProjectOutputPath(
  projectRoot: string,
  destination: string,
): Promise<void> {
  const absoluteRoot = path.resolve(projectRoot);
  const absoluteDestination = path.resolve(destination);
  try {
    const realRoot = await realpath(absoluteRoot);
    if (!isWithin(absoluteRoot, absoluteDestination)) {
      throw unsafeOutputError(absoluteRoot, absoluteDestination);
    }

    const relative = path.relative(absoluteRoot, absoluteDestination);
    let current = absoluteRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const stats = await lstatIfPresent(current);
      if (!stats) break;
      if (stats.isSymbolicLink()) {
        await assertSymlinkTargetInside(absoluteRoot, realRoot, current);
        continue;
      }
      const currentReal = await realpath(current);
      if (!isWithin(realRoot, currentReal)) {
        throw unsafeOutputError(absoluteRoot, current);
      }
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(
      `Cannot safely validate project output path "${absoluteDestination}": ${getErrorMessage(error)}`,
      absoluteDestination,
      `Check path permissions and replace symlinked output ancestors with paths inside "${absoluteRoot}".`,
    );
  }
}

/**
 * Validate a generated file destination before a multi-surface sync starts.
 * Existing ancestors must resolve to directories, while the leaf must be a
 * regular file (or absent). A leaf symlink is rejected even when it points
 * inside the project so a later writer cannot mutate an unexpected target.
 */
export async function assertSafeProjectOutputFile(
  projectRoot: string,
  destination: string,
): Promise<void> {
  await assertSafeProjectOutputPath(projectRoot, destination);
  const absoluteRoot = path.resolve(projectRoot);
  const absoluteDestination = path.resolve(destination);
  const segments = path
    .relative(absoluteRoot, absoluteDestination)
    .split(path.sep)
    .filter(Boolean);
  if (segments.length === 0) {
    throw new ConfigError(
      `Refusing to use the project root as an output file: ${absoluteDestination}`,
      absoluteDestination,
      "Configure a project-relative file path below the project root.",
    );
  }

  let current = absoluteRoot;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const existing = await lstatIfPresent(current);
    if (!existing) return;
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      if (existing.isFile()) return;
      throw new ConfigError(
        `Cannot write generated file "${absoluteDestination}": the destination is not a regular file.`,
        absoluteDestination,
        "Move the directory, symlink, or special file aside, then rerun agentsync sync.",
      );
    }
    const resolved = existing.isSymbolicLink() ? await stat(current) : existing;
    if (!resolved.isDirectory()) {
      throw new ConfigError(
        `Cannot write generated file "${absoluteDestination}": ancestor "${current}" is not a directory.`,
        absoluteDestination,
        "Move the blocking file aside or replace it with a directory, then rerun agentsync sync.",
      );
    }
  }
}

async function isSymlinkToSource(
  destination: string,
  source: string,
): Promise<boolean> {
  try {
    const stats = await lstat(destination);
    if (!stats.isSymbolicLink()) return false;
    const target = path.resolve(
      path.dirname(destination),
      await readlink(destination),
    );
    return target === path.resolve(source);
  } catch {
    return false;
  }
}

/**
 * Validate a file destination that will be unlinked before replacement.
 *
 * `--link` intentionally creates output links to canonical sources that may
 * live outside the project (for example, global content). Such a leaf is safe
 * to replace only when it points to the exact source being projected: unlink
 * changes the project entry, never its target. Every ancestor remains subject
 * to the normal project boundary, and arbitrary leaf links remain rejected.
 */
export async function assertSafeProjectFileReplacement(
  projectRoot: string,
  destination: string,
  source: string,
): Promise<void> {
  if (await isSymlinkToSource(destination, source)) {
    await assertSafeProjectOutputPath(projectRoot, path.dirname(destination));
    return;
  }
  await assertSafeProjectOutputPath(projectRoot, destination);
}
