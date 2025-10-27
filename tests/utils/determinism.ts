/**
 * Determinism Utilities for Test Reliability
 *
 * Provides utilities to eliminate non-deterministic behavior from tests,
 * ensuring consistent results across runs. This includes time freezing,
 * path normalization, and output sanitization.
 *
 * Reference: Test Architecture Plan Section 11 (Determinism Strategy)
 */

import { beforeEach, afterEach, vi } from "vitest";

/**
 * Deterministic test configuration
 *
 * Should be called in a describe() block to set up deterministic test environment:
 * - Freeze system time to a fixed value
 * - Reset after each test
 *
 * @param timestamp - Fixed timestamp (milliseconds since epoch)
 *
 * @example
 * describe('MCP Config', () => {
 *   useDeterminism(1666992000000); // Oct 24, 2022 00:00:00
 *
 *   it('generates consistent timestamps', () => {
 *     const now = Date.now();
 *     expect(now).toBe(1666992000000);
 *   });
 * });
 */
export function useDeterminism(
  timestamp: number = 1666992000000, // Oct 24, 2022 00:00:00 UTC
): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

/**
 * Normalize file paths for comparison
 *
 * Converts all path separators to forward slashes and removes redundant slashes.
 * This ensures paths are consistent regardless of OS.
 *
 * @param filePath - File path to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * const path1 = normalizePath('src\\components\\App.tsx');
 * const path2 = normalizePath('src/components/App.tsx');
 * expect(path1).toBe(path2); // Both become 'src/components/App.tsx'
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Normalize all paths in an object (recursively)
 *
 * @param obj - Object with path values
 * @param pathKeys - Keys that contain paths (default: ['path', 'file', 'dir'])
 * @returns New object with normalized paths
 *
 * @example
 * const config = {
 *   path: 'src\\components\\App.tsx',
 *   nested: { path: 'src\\types\\index.ts' }
 * };
 * const normalized = normalizePathsInObject(config);
 * // Results in: { path: 'src/components/App.tsx', nested: { path: 'src/types/index.ts' } }
 */
export function normalizePathsInObject(
  obj: any,
  pathKeys: string[] = ["path", "file", "dir", "filePath"],
): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizePathsInObject(item, pathKeys));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (pathKeys.includes(key) && typeof value === "string") {
      result[key] = normalizePath(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = normalizePathsInObject(value, pathKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize output for consistent snapshots
 *
 * Removes trailing whitespace and normalizes line endings.
 * This ensures snapshots are consistent regardless of editor settings.
 *
 * @param output - Output string to sanitize
 * @returns Sanitized output
 *
 * @example
 * const output = "line1  \nline2\r\n";
 * const sanitized = sanitizeOutput(output);
 * // Results in: "line1\nline2\n"
 */
export function sanitizeOutput(output: string): string {
  return (
    output
      // Normalize line endings to \n
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove trailing whitespace from each line
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Remove trailing newlines (keep single trailing newline if present)
      .replace(/\n+$/, "\n")
      // Remove leading newlines
      .replace(/^\n+/, "")
  );
}

/**
 * Sort object keys recursively
 *
 * Ensures consistent ordering when comparing objects or creating snapshots.
 * Useful when object property order is non-deterministic.
 *
 * @param obj - Object to sort
 * @returns New object with sorted keys
 *
 * @example
 * const obj = { z: 1, a: 2, nested: { y: 1, x: 2 } };
 * const sorted = sortObjectKeys(obj);
 * // Results in: { a: 2, nested: { x: 2, y: 1 }, z: 1 }
 */
export function sortObjectKeys(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: any = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Sort array of objects by specific key(s)
 *
 * Ensures consistent ordering when comparing arrays.
 *
 * @param arr - Array of objects to sort
 * @param sortKey - Key(s) to sort by (supports nested keys with dot notation)
 * @param direction - Sort direction (asc or desc)
 * @returns New sorted array
 *
 * @example
 * const results = [
 *   { name: 'charlie', id: 3 },
 *   { name: 'alice', id: 1 },
 *   { name: 'bob', id: 2 }
 * ];
 * const sorted = sortArray(results, 'name');
 * // Results in sorted by name: alice, bob, charlie
 */
export function sortArray(
  arr: any[],
  sortKey: string,
  direction: "asc" | "desc" = "asc",
): any[] {
  const sorted = [...arr].sort((a, b) => {
    const valA = getNestedValue(a, sortKey);
    const valB = getNestedValue(b, sortKey);

    let comparison = 0;
    if (valA < valB) comparison = -1;
    if (valA > valB) comparison = 1;

    return direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Get nested value from object using dot notation
 *
 * @param obj - Object to access
 * @param path - Dot-notation path (e.g., 'nested.value.here')
 * @returns Value at path or undefined
 *
 * @example
 * const obj = { user: { name: 'Alice', age: 30 } };
 * const name = getNestedValue(obj, 'user.name'); // 'Alice'
 */
export function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Normalize a collection for deterministic comparison
 *
 * Applies multiple normalization steps:
 * - Sort array elements if it's an array
 * - Sort object keys if it's an object
 * - Normalize paths within the structure
 *
 * @param collection - Collection to normalize (array or object)
 * @param arrayKey - If array, sort by this key
 * @returns Normalized collection
 *
 * @example
 * const config = {
 *   paths: [
 *     { path: 'src\\file2.ts', line: 2 },
 *     { path: 'src\\file1.ts', line: 1 }
 *   ]
 * };
 * const normalized = normalizeCollection(config, 'path');
 * // Sorted by path and all paths normalized
 */
export function normalizeCollection(
  collection: any,
  arrayKey?: string,
): any {
  if (Array.isArray(collection)) {
    const sorted = arrayKey
      ? sortArray(collection, arrayKey)
      : collection;
    return sorted.map((item) =>
      normalizePathsInObject(normalizeCollection(item, arrayKey)),
    );
  }

  const withPaths = normalizePathsInObject(collection);
  return sortObjectKeys(withPaths);
}

/**
 * Create a snapshot-safe version of an object
 *
 * Applies all determinism transformations:
 * - Fixes timestamps to frozen value
 * - Normalizes paths
 * - Sorts keys and arrays
 * - Sanitizes output
 *
 * @param obj - Object to prepare for snapshot
 * @param options - Snapshot options
 * @returns Snapshot-safe object
 *
 * @example
 * const result = {
 *   timestamp: 1234567890,
 *   paths: [{ path: 'src\\file2.ts' }, { path: 'src\\file1.ts' }],
 *   message: 'done  \n'
 * };
 * const snapshotReady = toSnapshot(result);
 * expect(snapshotReady).toMatchSnapshot();
 */
export interface SnapshotOptions {
  /** Timestamp to use for all date values (default: frozen time) */
  timestamp?: number;
  /** Key names that contain paths */
  pathKeys?: string[];
  /** Key name to sort arrays by */
  arrayKey?: string;
  /** Whether to sanitize string outputs */
  sanitizeStrings?: boolean;
}

export function toSnapshot(
  obj: any,
  options: SnapshotOptions = {},
): any {
  const {
    timestamp = Date.now(),
    pathKeys = ["path", "file", "dir", "filePath"],
    arrayKey,
    sanitizeStrings = true,
  } = options;

  const replaceTimestamps = (value: any): any => {
    if (typeof value === "number" && Math.abs(value - Date.now()) < 1000) {
      return timestamp;
    }
    if (typeof value === "string" && sanitizeStrings) {
      return sanitizeOutput(value);
    }
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        return value.map(replaceTimestamps);
      }
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = replaceTimestamps(val);
      }
      return result;
    }
    return value;
  };

  let normalized = normalizePathsInObject(
    replaceTimestamps(obj),
    pathKeys,
  );

  if (Array.isArray(normalized) && arrayKey) {
    normalized = sortArray(normalized, arrayKey);
  } else if (typeof normalized === "object" && normalized !== null) {
    normalized = sortObjectKeys(normalized);
  }

  return normalized;
}

/**
 * Assert two values are equal after determinism normalization
 *
 * @param actual - Actual value
 * @param expected - Expected value
 * @param message - Optional assertion message
 *
 * @example
 * const actual = { path: 'src\\file.ts', name: 'test' };
 * const expected = { name: 'test', path: 'src/file.ts' };
 * assertDeterministic(actual, expected);
 */
export function assertDeterministic(
  actual: any,
  expected: any,
  message?: string,
): void {
  const actualSnap = toSnapshot(actual);
  const expectedSnap = toSnapshot(expected);

  if (JSON.stringify(actualSnap) !== JSON.stringify(expectedSnap)) {
    throw new Error(
      message ||
        `Deterministic assertion failed:\nActual: ${JSON.stringify(actualSnap, null, 2)}\nExpected: ${JSON.stringify(expectedSnap, null, 2)}`,
    );
  }
}
