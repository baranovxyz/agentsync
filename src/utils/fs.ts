/**
 * Native Node.js filesystem utilities
 * Replacements for fs-extra methods using node:fs/promises
 */

import { constants } from "node:fs";
import {
  access,
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

/**
 * Check if a path exists
 * Replacement for fs-extra's pathExists()
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed
 * Replacement for fs-extra's ensureDir()
 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Write a file, creating parent directories if needed
 * Replacement for fs-extra's outputFile()
 */
export async function outputFile(
  file: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding },
): Promise<void> {
  const dir = dirname(file);
  await mkdir(dir, { recursive: true });
  await writeFile(file, data, options);
}

/**
 * Copy a file or directory recursively
 * Replacement for fs-extra's copy()
 */
export async function copy(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true });
}

/**
 * Remove a file or directory recursively
 * Replacement for fs-extra's remove()
 */
export async function remove(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/**
 * Read and parse a JSON file
 * Replacement for fs-extra's readJson()
 */
export async function readJson<T = unknown>(file: string): Promise<T> {
  const content = await readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Read and parse a JSON file with Zod schema validation
 * Always prefer this over readJson() for runtime type safety
 * @param file - Path to JSON file
 * @param schema - Zod schema to validate against
 * @returns Validated and typed data
 * @throws ZodError if validation fails
 */
export async function readJsonValidated<T>(
  file: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const content = await readJson(file);
  return schema.parse(content);
}

/**
 * Write JSON data to a file, creating parent directories if needed
 * Replacement for fs-extra's writeJson()
 */
export async function writeJson(
  file: string,
  data: unknown,
  options?: { encoding?: BufferEncoding; spaces?: number },
): Promise<void> {
  const dir = dirname(file);
  await mkdir(dir, { recursive: true });
  const spaces = options?.spaces || 2;
  const content = JSON.stringify(data, null, spaces);
  await writeFile(file, content, { encoding: options?.encoding || "utf-8" });
}

// Re-export native APIs that don't need wrappers
// Note: We explicitly list each export to ensure they're included in the bundle
export {
  access,
  appendFile,
  mkdtemp,
  readFile,
  readdir,
  rename,
  stat,
  symlink,
  writeFile,
};
export { constants } from "node:fs";
export { cp };
