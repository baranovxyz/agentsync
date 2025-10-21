/**
 * Native Node.js filesystem utilities
 * Replacements for fs-extra methods using node:fs/promises
 */

import {
  access,
  mkdir,
  writeFile,
  cp,
  rm,
  readFile,
  appendFile,
  readdir,
  stat,
  symlink,
  rename,
  mkdtemp,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";

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
  options?: { encoding?: BufferEncoding }
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
export async function readJson(file: string): Promise<any> {
  const content = await readFile(file, "utf-8");
  return JSON.parse(content);
}

/**
 * Write JSON data to a file, creating parent directories if needed
 * Replacement for fs-extra's writeJson()
 */
export async function writeJson(
  file: string,
  data: any,
  options?: { encoding?: BufferEncoding; spaces?: number }
): Promise<void> {
  const dir = dirname(file);
  await mkdir(dir, { recursive: true });
  const spaces = options?.spaces || 2;
  const content = JSON.stringify(data, null, spaces);
  await writeFile(file, content, { encoding: options?.encoding || "utf-8" });
}

// Re-export native APIs that don't need wrappers
export {
  readFile,
  appendFile,
  readdir,
  stat,
  symlink,
  rename,
  writeFile,
  access,
  mkdtemp,
};
export { constants } from "node:fs";
