/**
 * Zod schemas for AGENTS.md validation
 * Ensures compliance with the official AGENTS.md specification
 */

import { z } from "zod";
import { SUPPORTED_TOOLS } from "../constants.js";

// Extends entry: flat string with source validation
// Namespace is auto-derived from source (last segment)
export const ExtendsEntrySchema = z
  .string()
  .min(1, "Source cannot be empty")
  .refine(
    (s) => {
      if (s.startsWith("github:")) {
        return /^github:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/.test(
          s,
        );
      }
      if (s.startsWith("fs:")) {
        const path = s.slice(3);
        return path.length > 0 && !path.includes("://");
      }
      return !(
        s.includes("://") ||
        s.startsWith("http") ||
        s.startsWith("git@")
      );
    },
    {
      message:
        "Source must be github:org/repo[@ref], fs:./path, /absolute/path, or ./relative/path",
    },
  );

// MCP server config: command-based (stdio) or URL-based (http)
export const McpServerConfigSchema = z.union([
  z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// Profile config schema: filter semantics for CI/enterprise
export const ProfileConfigSchema = z
  .object({
    tools: z.array(z.string()).optional(), // Replaces base tools
    mcp: z.array(z.string()).optional(), // Filters to only these MCPs
    extends: z.array(ExtendsEntrySchema).optional(), // Replaces base presets
    skills: z.array(z.string()).optional(), // Filters to only these skills
    paths: z.array(z.string()).optional(), // Auto-activate on CWD match
    env: z.string().optional(), // Auto-activate on env var
  })
  .passthrough();

export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;

// Main configuration schema — v1.0 simplified format
// tools = flat list, mcp = defined means enabled, extends = flat strings
export const AgentSyncConfigSchema = z.object({
  // Flat tool list (no [agents.*] blocks)
  tools: z.array(z.enum(SUPPORTED_TOOLS)).optional(),

  // MCP servers: defined = enabled. No separate enable list.
  mcp: z.record(z.string(), McpServerConfigSchema).optional(),

  // Presets: flat string array. Namespace auto-derived from source.
  extends: z.array(ExtendsEntrySchema).optional(),

  // Active profile name
  profile: z.string().optional(),

  // Named profile overrides (filter semantics)
  profiles: z.record(z.string(), ProfileConfigSchema).optional(),
});

// Local config: MCP overrides + disable list
export const LocalConfigSchema = z.object({
  mcp: z.record(z.string(), McpServerConfigSchema).optional(),
  mcp_disabled: z.array(z.string()).optional(),
});

/** Schema for third-party tool config files that we merge MCP into */
export const ToolSettingsSchema = z.record(z.string(), z.unknown());
export type ToolSettings = z.infer<typeof ToolSettingsSchema>;

// Type exports for TypeScript usage
export type ExtendsEntry = z.infer<typeof ExtendsEntrySchema>;
export type AgentSyncConfig = z.infer<typeof AgentSyncConfigSchema>;
export type LocalConfig = z.infer<typeof LocalConfigSchema>;

/**
 * Validate local configuration file
 */
export function validateLocalConfig(data: unknown): LocalConfig {
  return LocalConfigSchema.parse(data);
}

/**
 * Validate namespace against reserved words and format constraints
 * @throws Error if namespace is invalid
 */
export function validateNamespace(namespace: string): void {
  const reserved = ["custom", "local", "project", "user", "core", "default"];

  if (reserved.includes(namespace.toLowerCase())) {
    throw new Error(
      `Namespace "${namespace}" is reserved. Choose a different namespace (e.g., "company", "team", "org").`,
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
    throw new Error(
      `Namespace "${namespace}" contains invalid characters. Use only alphanumeric characters, hyphens, and underscores.`,
    );
  }

  if (namespace.length > 50) {
    throw new Error(
      `Namespace "${namespace}" exceeds maximum length of 50 characters.`,
    );
  }
}

/**
 * Derive namespace from extends source string using hybrid algorithm.
 * Uses owner-repo for GitHub sources to reduce collision risk.
 *
 * "github:company/standards" → "company-standards"
 * "github:acme-corp/tools" → "acme-corp-tools"
 * "github:acme/mono/packages/presets" → "acme-mono-presets"
 * "github:company/standards@v2" → "company-standards"
 * "fs:./local-presets" → "local-presets"
 * "fs:~/.cursor" → "cursor"
 * "/absolute/path" → "path"
 * "fs:C:\\Users\\me\\.cursor" → "cursor"
 * "./relative/path" → "path"
 */
export function deriveNamespace(source: string): string {
  let cleaned = source;

  if (cleaned.startsWith("github:")) {
    // GitHub: use owner-repo (or owner-repo-leaf for subpaths)
    cleaned = cleaned.slice(7);
    // Strip @ref suffix
    cleaned = cleaned.replace(/@[a-zA-Z0-9_.-]+$/, "");
    const segments = cleaned.split("/").filter(Boolean);
    if (segments.length >= 3) {
      // Subpath: owner-repo-leaf
      const ns = `${segments[0]}-${segments[1]}-${segments[segments.length - 1]}`;
      return normalizeNamespaceString(ns);
    }
    if (segments.length === 2) {
      // Standard: owner-repo
      return normalizeNamespaceString(`${segments[0]}-${segments[1]}`);
    }
    return normalizeNamespaceString(segments[0] || "preset");
  }

  // fs: or bare paths — use basename
  if (cleaned.startsWith("fs:")) cleaned = cleaned.slice(3);
  // Strip @ref suffix
  cleaned = cleaned.replace(/@[a-zA-Z0-9_.-]+$/, "");
  // Get last path segment
  const segments = cleaned.split(/[\\/]+/).filter(Boolean);
  const last = segments[segments.length - 1] || "preset";
  return normalizeNamespaceString(last);
}

/**
 * Normalize a namespace string: lowercase, strip leading dots,
 * replace invalid chars with hyphens, collapse consecutive hyphens,
 * trim leading/trailing hyphens.
 */
function normalizeNamespaceString(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "") || "preset"
  );
}

// Legacy object format for extends entries (allocated once at module level)
const LegacyEntrySchema = z.object({
  source: z.string().min(1, "Source is required in extends entry"),
  namespace: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/**
 * Normalize extends entries to a consistent format with derived namespaces.
 * V1 format: flat string array → auto-derive namespace from source.
 * Legacy format: object with source/namespace → use as-is.
 *
 * Deduplicates by source URI: if the same source appears multiple times
 * (e.g., root and workspace configs both extend the same preset),
 * keeps the last occurrence. This preserves last-wins semantics for
 * MCP servers while ensuring each preset is resolved exactly once.
 */
export function normalizeExtends(
  extends_: (string | Record<string, unknown>)[] | undefined,
): Array<{
  source: string;
  namespace: string;
  include?: string[];
  exclude?: string[];
}> {
  if (!extends_ || extends_.length === 0) {
    return [];
  }

  const normalized = extends_.map((entry) => {
    // V1 flat string format: derive namespace from source
    if (typeof entry === "string") {
      const namespace = deriveNamespace(entry);
      validateNamespace(namespace);
      return { source: entry, namespace };
    }

    // Legacy object format: validate with Zod schema
    const parsed = LegacyEntrySchema.parse(entry);

    const namespace = parsed.namespace || deriveNamespace(parsed.source);
    validateNamespace(namespace);

    const result: {
      source: string;
      namespace: string;
      include?: string[];
      exclude?: string[];
    } = { source: parsed.source, namespace };

    if (parsed.include) result.include = parsed.include;
    if (parsed.exclude) result.exclude = parsed.exclude;
    return result;
  });

  // Deduplicate by source URI, keeping last occurrence
  const seen = new Map<string, number>();
  for (let i = 0; i < normalized.length; i++) {
    seen.set(normalized[i].source, i);
  }
  return normalized.filter((_, i) => {
    const entry = normalized[i];
    return seen.get(entry.source) === i;
  });
}

// Test utility — not used in production code. Callers should use the Zod schema directly.
export function validateConfig(data: unknown): AgentSyncConfig {
  return AgentSyncConfigSchema.parse(data);
}

// Test utility — not used in production code. Callers should use the Zod schema directly.
export function safeParseLocalConfig(
  data: unknown,
):
  | { success: true; data: LocalConfig }
  | { success: false; error: z.ZodError } {
  const result = LocalConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}
