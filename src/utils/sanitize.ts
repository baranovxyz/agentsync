/**
 * Content sanitization for preset pipeline.
 *
 * Strips bytes that are never legitimate in markdown skill/command files.
 * This is hygiene, not injection detection — users choose their presets
 * (same trust model as npm dependencies).
 */

/** Default maximum content length (100KB) */
const DEFAULT_MAX_LENGTH = 100 * 1024;

/** Control characters below 0x20 except \t (0x09), \n (0x0A), \r (0x0D) */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/** ANSI escape sequences */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching ANSI escape sequences
const ANSI_ESCAPES = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Dangerous Unicode ranges:
 * - Bidi overrides: U+202A–U+202E (embedding controls)
 * - Bidi isolates: U+2066–U+2069
 * - Tag Block: U+E0001–U+E007F (invisible tag characters)
 * - Zero-width characters: U+200B (ZWS), U+200C (ZWNJ), U+200D (ZWJ),
 *   U+200E/U+200F (LRM/RLM), U+FEFF (BOM, also ZWNBSP)
 */
const DANGEROUS_UNICODE =
  /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]|\uDB40[\uDC01-\uDC7F]/g;

export interface SanitizeResult {
  content: string;
  warnings: string[];
}

/**
 * Strip dangerous characters from a string: ANSI escapes, control chars, bidi/tag/zero-width Unicode.
 * Shared by both content sanitization and MCP config sanitization.
 */
function stripDangerous(
  str: string,
  source: string,
  label: string,
  warnings: string[],
): string {
  let result = str;
  const ansiStripped = result.replace(ANSI_ESCAPES, "");
  if (ansiStripped.length !== result.length) {
    warnings.push(
      `Stripped ANSI escape sequences from ${label} in "${source}"`,
    );
    result = ansiStripped;
  }
  const controlStripped = result.replace(CONTROL_CHARS, "");
  if (controlStripped.length !== result.length) {
    warnings.push(`Stripped control characters from ${label} in "${source}"`);
    result = controlStripped;
  }
  const unicodeStripped = result.replace(DANGEROUS_UNICODE, "");
  if (unicodeStripped.length !== result.length) {
    warnings.push(
      `Stripped dangerous Unicode characters from ${label} in "${source}"`,
    );
    result = unicodeStripped;
  }
  return result;
}

/**
 * Sanitize preset content by stripping illegitimate bytes.
 *
 * What it strips:
 * - Null bytes and control characters (except \n, \r, \t)
 * - ANSI escape sequences
 * - Bidi override/isolate characters
 * - Tag Block characters (U+E0001–U+E007F)
 * - Zero-width characters (ZWS, ZWNJ, ZWJ, LRM, RLM, BOM)
 *
 * What it does NOT do:
 * - Prompt injection detection (unreliable, false positives)
 * - HTML/script removal (code blocks can legitimately contain these)
 */
export function sanitizeContent(
  content: string,
  opts?: { maxLength?: number; source?: string },
): SanitizeResult {
  const warnings: string[] = [];
  const maxLength = opts?.maxLength ?? DEFAULT_MAX_LENGTH;
  const source = opts?.source ?? "unknown";
  let result = content;

  // Truncate excessive length
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
    warnings.push(
      `Content from "${source}" truncated from ${content.length} to ${maxLength} bytes`,
    );
  }

  result = stripDangerous(result, source, "content", warnings);

  return { content: result, warnings };
}

/**
 * Sanitize an MCP server config by stripping control characters from
 * command, args, and env values. Same hygiene as content sanitization
 * but for config strings (no length truncation).
 */
export function sanitizeMcpConfig(
  config: Record<string, unknown>,
  source: string,
): { config: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];

  function cleanString(value: string, field: string): string {
    return stripDangerous(value, source, `MCP ${field}`, warnings);
  }

  const cleaned = { ...config };
  if (typeof cleaned.command === "string") {
    cleaned.command = cleanString(cleaned.command, "command");
  }
  if (Array.isArray(cleaned.args)) {
    cleaned.args = cleaned.args.map((arg, i) =>
      typeof arg === "string" ? cleanString(arg, `args[${i}]`) : arg,
    );
  }
  if (
    cleaned.env &&
    typeof cleaned.env === "object" &&
    !Array.isArray(cleaned.env)
  ) {
    const env: Record<string, string> = {};
    for (const [key, val] of Object.entries(
      cleaned.env as Record<string, unknown>,
    )) {
      if (typeof val === "string") {
        env[key] = cleanString(val, `env.${key}`);
      }
    }
    cleaned.env = env;
  }
  return { config: cleaned, warnings };
}
