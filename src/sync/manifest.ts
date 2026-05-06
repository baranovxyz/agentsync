/**
 * Sync Manifest
 *
 * Records content hashes of all files written during sync.
 * Used by `doctor` to detect direct modifications to synced outputs
 * (content drift) that bypass the source-of-truth in `.agents/`.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { pathExists, readJsonValidated, writeJson } from "../utils/fs.js";
import { toPosixPath } from "../utils/path-normalization.js";

// ── Schema ─────────────────────────────────────────────────

export const SyncManifestSchema = z.object({
  files: z.record(z.string(), z.string()),
  timestamp: z.string(),
});

export type SyncManifest = z.infer<typeof SyncManifestSchema>;

// ── Constants ──────────────────────────────────────────────

const MANIFEST_FILENAME = ".sync-manifest.json";

/** Resolve the manifest path for a given project root */
export function getManifestPath(cwd: string): string {
  return path.join(cwd, ".agents", MANIFEST_FILENAME);
}

// ── Hashing ────────────────────────────────────────────────

/** Compute SHA-256 hash of a file's contents. Returns `sha256:<hex>`. */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hex = createHash("sha256").update(content).digest("hex");
  return `sha256:${hex}`;
}

// ── Read / Write ───────────────────────────────────────────

/** Read an existing manifest. Returns `undefined` if the file does not exist. */
export async function readManifest(
  cwd: string,
): Promise<SyncManifest | undefined> {
  const manifestPath = getManifestPath(cwd);
  if (!(await pathExists(manifestPath))) return undefined;
  try {
    return await readJsonValidated(manifestPath, SyncManifestSchema);
  } catch {
    // Corrupted manifest — treat as absent so doctor skips gracefully
    return undefined;
  }
}

/**
 * Write a manifest recording the SHA-256 hash of each written file.
 *
 * @param cwd - Project root
 * @param filePaths - Absolute paths of files that were written during sync
 */
export async function writeManifest(
  cwd: string,
  filePaths: string[],
): Promise<void> {
  const files: Record<string, string> = {};

  for (const abs of filePaths) {
    if (!(await pathExists(abs))) continue;
    const rel = toPosixPath(path.relative(cwd, abs));
    files[rel] = await hashFile(abs);
  }

  const manifest: SyncManifest = {
    files,
    timestamp: new Date().toISOString(),
  };

  await writeJson(getManifestPath(cwd), manifest, { spaces: 2 });
}
