/**
 * YAML frontmatter parsing shared by the tool adapters and the rules sync module.
 */

import yaml from "js-yaml";
import { z } from "zod";

const FrontmatterSchema = z.record(z.string(), z.unknown());

/**
 * Parse YAML frontmatter from a markdown file body.
 * Returns null fm + full content if no frontmatter present.
 */
export function splitFrontmatter(raw: string): {
  fm: Record<string, unknown> | null;
  body: string;
  eol: "\n" | "\r\n";
} {
  const match = raw.match(
    /^---[ \t]*(\r?\n)([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?([\s\S]*)$/,
  );
  const fallbackEol = raw.includes("\r\n") ? "\r\n" : "\n";
  if (!match) return { fm: null, body: raw, eol: fallbackEol };
  try {
    const parsed = yaml.load(match[2]);
    const frontmatter = FrontmatterSchema.safeParse(parsed);
    if (frontmatter.success) {
      const eol = match[1] === "\r\n" ? "\r\n" : "\n";
      return {
        fm: frontmatter.data,
        body: match[3],
        eol,
      };
    }
  } catch {
    // fall through — treat as no frontmatter
  }
  return { fm: null, body: raw, eol: fallbackEol };
}
