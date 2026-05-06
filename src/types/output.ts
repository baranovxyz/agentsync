/**
 * CLI Output Contract Types
 *
 * Defines the universal JSON envelope for all --json output.
 * This is a public API — additive changes only after v1.0.
 */
import { z } from "zod";
import { ValidationError } from "../core/errors.js";

// ── Interfaces ──────────────────────────────────────────────

export interface CliResult<T> {
  version: "1.0";
  status: "success" | "partial" | "error";
  command: string;
  data: T;
  errors?: CliError[];
  warnings?: string[];
}

export interface CliError {
  code: string;
  message: string;
  suggestion?: string;
  retryable?: boolean;
  context?: Record<string, unknown>;
}

// ── Per-Command Data Types ──────────────────────────────────

export interface InitData {
  action: "created" | "already_initialized";
  configPath: string;
  tools: string[];
}

export interface SyncToolDetail {
  tool: string;
  skills: string[];
  commands: string[];
  agents: string[];
  mcp: string[];
}

export interface SyncData {
  tools: string[];
  skills: number;
  commands: number;
  agents: number;
  mcpServers: number;
  details: SyncToolDetail[];
}

export interface DoctorData {
  config: { found: boolean; valid: boolean; error?: string };
  tools: Array<{ name: string }>;
  skills: { count: number; synced: boolean };
  mcp: Array<{
    name: string;
    configured: boolean;
    envResolved: boolean;
    missingEnvVars: string[];
    hasEnvRefs: boolean;
    severity: string;
  }>;
  presets: Array<{ source: string; valid: boolean }>;
  drift: Array<{ tool: string; status: "stale" | "missing" | "ok" }>;
  contentDrift: Array<{
    file: string;
    status: "ok" | "modified" | "missing";
  }>;
}

export interface CleanData {
  dryRun: boolean;
  results: Array<{
    tool: string;
    removedFiles: string[];
    removedDirs: string[];
  }>;
  summary: { files: number; directories: number };
}

export interface ConfigAddData {
  type: string;
  name: string;
  action: "added" | "exists";
  path?: string;
}

export interface ConfigRmData {
  type: string;
  name: string;
  action: "removed" | "not_found";
  path?: string;
}

export interface ConfigLsData {
  tools?: string[];
  mcp?: string[];
  presets?: string[];
  skills?: string[];
  commands?: string[];
}

export interface ConfigShowData {
  [key: string]: unknown;
}

// ── Zod Schemas ─────────────────────────────────────────────

export const CliErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
  retryable: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const CliResultSchema = z
  .object({
    version: z.literal("1.0"),
    status: z.enum(["success", "partial", "error"]),
    command: z.string(),
    data: z.record(z.string(), z.unknown()),
    errors: z.array(CliErrorSchema).optional(),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

// ── Per-Command Data Schemas (for contract tests) ──────────

const SyncToolDetailSchema = z
  .object({
    tool: z.string(),
    skills: z.array(z.string()),
    commands: z.array(z.string()),
    agents: z.array(z.string()),
    mcp: z.array(z.string()),
  })
  .strict();

export const SyncDataSchema = z
  .object({
    tools: z.array(z.string()),
    skills: z.number(),
    commands: z.number(),
    agents: z.number(),
    mcpServers: z.number(),
    details: z.array(SyncToolDetailSchema),
  })
  .strict();

export const InitDataSchema = z
  .object({
    action: z.enum(["created", "already_initialized"]),
    configPath: z.string(),
    tools: z.array(z.string()),
  })
  .strict();

export const DoctorDataSchema = z
  .object({
    config: z.object({
      found: z.boolean(),
      valid: z.boolean(),
      error: z.string().optional(),
    }),
    tools: z.array(z.object({ name: z.string() })),
    skills: z.object({ count: z.number(), synced: z.boolean() }),
    mcp: z.array(
      z.object({
        name: z.string(),
        configured: z.boolean(),
        envResolved: z.boolean(),
        missingEnvVars: z.array(z.string()),
        hasEnvRefs: z.boolean(),
        severity: z.string(),
      }),
    ),
    presets: z.array(z.object({ source: z.string(), valid: z.boolean() })),
    drift: z.array(
      z.object({
        tool: z.string(),
        status: z.enum(["stale", "missing", "ok"]),
      }),
    ),
    contentDrift: z.array(
      z.object({
        file: z.string(),
        status: z.enum(["ok", "modified", "missing"]),
      }),
    ),
  })
  .strict();

export const CleanDataSchema = z
  .object({
    dryRun: z.boolean(),
    results: z.array(
      z.object({
        tool: z.string(),
        removedFiles: z.array(z.string()),
        removedDirs: z.array(z.string()),
      }),
    ),
    summary: z.object({ files: z.number(), directories: z.number() }),
  })
  .strict();

export const ConfigAddDataSchema = z
  .object({
    type: z.string(),
    name: z.string(),
    action: z.enum(["added", "exists"]),
    path: z.string().optional(),
  })
  .strict();

export const ConfigRmDataSchema = z
  .object({
    type: z.string(),
    name: z.string(),
    action: z.enum(["removed", "not_found"]),
    path: z.string().optional(),
  })
  .strict();

export const ConfigLsDataSchema = z
  .object({
    tools: z.array(z.string()).optional(),
    mcp: z.array(z.string()).optional(),
    presets: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
  })
  .strict();

export const ConfigShowDataSchema = z.record(z.string(), z.unknown());

// ── Factory Functions ───────────────────────────────────────

export function cliResult<T>(
  command: string,
  data: T,
  opts?: {
    status?: "success" | "partial" | "error";
    errors?: CliError[];
    warnings?: string[];
  },
): CliResult<T> {
  const result: CliResult<T> = {
    version: "1.0",
    status: opts?.status ?? "success",
    command,
    data,
  };
  if (opts?.errors && opts.errors.length > 0) {
    result.errors = opts.errors;
  }
  if (opts?.warnings && opts.warnings.length > 0) {
    result.warnings = opts.warnings;
  }
  return result;
}

export function cliError<T>(
  command: string,
  data: T,
  error: CliError | CliError[],
): CliResult<T> {
  const errors = Array.isArray(error) ? error : [error];
  return {
    version: "1.0",
    status: "error",
    command,
    data,
    errors,
  };
}

// ── JSON Serialization ─────────────────────────────────────

/**
 * Serialize a value to JSON with context-aware formatting.
 * - `pretty === true`: always indent (--pretty flag)
 * - `pretty === false`: always minify
 * - `pretty === undefined`: minify (safe default for agent consumers)
 *
 * The previous behavior used isTTY as default, which pretty-printed when
 * agents ran in a TTY. Agents are the primary consumer — default to minified.
 */
export function jsonStringify(value: unknown, pretty?: boolean): string {
  const indent = pretty === true ? 2 : undefined;
  return JSON.stringify(value, null, indent);
}

// ── Field Projection ────────────────────────────────────────

export function projectFields<T extends object>(
  data: T,
  fields: string | undefined,
  validFields: readonly string[],
): Partial<T> {
  if (!fields) return data;
  const requested = fields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const invalid = requested.filter((f) => !validFields.includes(f));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Invalid field(s): ${invalid.join(", ")}. Valid fields: ${validFields.join(", ")}`,
      undefined,
      {
        suggestion: `Valid fields: ${validFields.join(", ")}`,
        validValues: [...validFields],
        provided: invalid,
      },
    );
  }
  const obj = data as Record<string, unknown>;
  const result: Partial<T> = {};
  for (const field of requested) {
    if (field in obj) {
      (result as Record<string, unknown>)[field] = obj[field];
    }
  }
  return result;
}
