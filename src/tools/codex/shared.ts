import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "smol-toml";
import { z } from "zod";
import { ConfigError, getErrorMessage } from "../../core/errors.js";
import { ToolSettingsSchema } from "../../types/schemas.js";
import { outputFile, readFile, readJsonValidated } from "../../utils/fs.js";
import { assertSafeProjectOutputFile } from "../../utils/project-output.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function withoutProperty(
  record: Record<string, unknown>,
  removedKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== removedKey),
  );
}

export function codexConfigPath(cwd: string): string {
  return path.join(cwd, ".codex", "config.toml");
}

export async function readTomlOrEmpty(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    return ToolSettingsSchema.parse(parse(content));
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw new ConfigError(
      `Cannot safely update shared configuration "${filePath}": ${getErrorMessage(error)}`,
      filePath,
      "Repair the existing TOML, or move it aside after preserving any user-authored settings, then rerun agentsync sync.",
    );
  }
}

export async function readProjectTomlOrEmpty(
  cwd: string,
  filePath: string,
): Promise<Record<string, unknown>> {
  await assertSafeProjectOutputFile(cwd, filePath);
  return readTomlOrEmpty(filePath);
}

export async function writeProjectText(
  cwd: string,
  filePath: string,
  content: string,
): Promise<void> {
  await assertSafeProjectOutputFile(cwd, filePath);
  await outputFile(filePath, content, { encoding: "utf-8" });
}

export function writeProjectToml(
  cwd: string,
  filePath: string,
  config: Record<string, unknown>,
): Promise<void> {
  return writeProjectText(cwd, filePath, stringify(config));
}

export function optionalConfigTable(
  config: Record<string, unknown>,
  key: string,
  filePath: string,
): Record<string, unknown> {
  const value = config[key];
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  throw new ConfigError(
    `Cannot safely update shared configuration "${filePath}": ${key} must be a TOML table.`,
    filePath,
    `Repair [${key}] after preserving user-authored settings, then rerun agentsync sync.`,
  );
}

const ContentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CodexRoleOwnershipSchema = z.object({
  entry_hash: ContentHashSchema,
  markdown_path: z.string().min(1),
  markdown_hash: ContentHashSchema,
  toml_path: z.string().min(1),
  toml_hash: ContentHashSchema,
});
const CodexOwnershipSchema = z.object({
  version: z.literal(1),
  roles: z.record(z.string(), CodexRoleOwnershipSchema),
  config: z.object({
    default_permissions: ContentHashSchema.optional(),
    status_line: ContentHashSchema.optional(),
    personality: ContentHashSchema.optional(),
  }),
  home_mcp: z.record(z.string(), ContentHashSchema),
});

export type CodexOwnership = z.infer<typeof CodexOwnershipSchema>;
export type CodexRoleOwnership = z.infer<typeof CodexRoleOwnershipSchema>;

function emptyCodexOwnership(): CodexOwnership {
  return { version: 1, roles: {}, config: {}, home_mcp: {} };
}

function canonicalHashValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalHashValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalHashValue(item)]),
  );
}

export function hashValue(value: unknown): string {
  const serialized = JSON.stringify(canonicalHashValue(value)) ?? "undefined";
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

function hashContent(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function codexOwnershipPath(cwd: string): string {
  return path.join(cwd, ".codex", ".agentsync-ownership.json");
}

export async function readCodexOwnership(cwd: string): Promise<CodexOwnership> {
  const receiptPath = codexOwnershipPath(cwd);
  await assertSafeProjectOutputFile(cwd, receiptPath);
  try {
    return await readJsonValidated(receiptPath, CodexOwnershipSchema);
  } catch (error) {
    if (isMissingFileError(error)) return emptyCodexOwnership();
    throw new ConfigError(
      `Cannot validate Codex ownership receipt "${receiptPath}": ${getErrorMessage(error)}`,
      receiptPath,
      "Restore the receipt from version control or remove it after preserving any modified Codex outputs, then rerun agentsync sync.",
    );
  }
}

export function hasCodexOwnership(receipt: CodexOwnership): boolean {
  return (
    Object.keys(receipt.roles).length > 0 ||
    Object.values(receipt.config).some((value) => value !== undefined) ||
    Object.keys(receipt.home_mcp).length > 0
  );
}

export async function writeCodexOwnership(
  cwd: string,
  receipt: CodexOwnership,
): Promise<void> {
  const receiptPath = codexOwnershipPath(cwd);
  await assertSafeProjectOutputFile(cwd, receiptPath);
  if (!hasCodexOwnership(receipt)) {
    await rm(receiptPath, { force: true });
    return;
  }
  await writeProjectText(
    cwd,
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

export function resolveRoleArtifact(cwd: string, relativePath: string): string {
  const normalized = path.posix.normalize(relativePath);
  if (
    normalized !== relativePath ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    !relativePath.startsWith("agents/")
  ) {
    throw new ConfigError(
      `Invalid Codex ownership path "${relativePath}".`,
      codexOwnershipPath(cwd),
      "Preserve any modified Codex outputs, remove the invalid ownership receipt, and rerun agentsync sync.",
    );
  }
  return path.join(cwd, ".codex", ...relativePath.split("/"));
}

export type FileHashState =
  | { kind: "missing" }
  | { kind: "readable"; hash: string }
  | { kind: "unreadable" };

export async function fileHashState(filePath: string): Promise<FileHashState> {
  try {
    return { kind: "readable", hash: hashContent(await readFile(filePath)) };
  } catch (error) {
    return isMissingFileError(error)
      ? { kind: "missing" }
      : { kind: "unreadable" };
  }
}

export async function validateCodexSharedState(cwd: string): Promise<{
  config: Record<string, unknown>;
  receipt: CodexOwnership;
}> {
  const configFile = codexConfigPath(cwd);
  const [config, receipt] = await Promise.all([
    readProjectTomlOrEmpty(cwd, configFile),
    readCodexOwnership(cwd),
  ]);
  for (const table of ["agents", "tui", "mcp_servers"]) {
    optionalConfigTable(config, table, configFile);
  }
  return { config, receipt };
}
