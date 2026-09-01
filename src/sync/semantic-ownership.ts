import { createHash } from "node:crypto";
import * as path from "node:path";
import { z } from "zod";

export const ContentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalHashValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalHashValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalHashValue(item)]),
  );
}

/** Hash a structured value independently of object-key and file formatting. */
export function hashSemanticValue(value: unknown): string {
  const serialized = JSON.stringify(canonicalHashValue(value)) ?? "undefined";
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

/** Hash a structured value while retaining object-key insertion order. */
export function hashOrderedSemanticValue(value: unknown): string {
  const serialized = JSON.stringify(value) ?? "undefined";
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

/**
 * Validate the canonical spelling used by project-relative ownership paths.
 *
 * Receipt and manifest paths are POSIX-style on every platform. Rejecting
 * alternate spellings keeps authority checks exact and prevents aliases.
 */
export function isCanonicalManifestPath(relativePath: string): boolean {
  if (
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath)
  ) {
    return false;
  }
  const normalized = path.posix.normalize(relativePath);
  return (
    normalized === relativePath &&
    normalized !== "." &&
    normalized !== ".." &&
    !normalized.startsWith("../")
  );
}
