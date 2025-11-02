/**
 * Frontmatter parsing and serialization utilities
 * Handles YAML frontmatter in markdown files
 */

import { load as parseYaml, dump as stringifyYaml } from "js-yaml";
import type {
  CommandFrontmatter,
  RuleFrontmatter,
} from "../types/canonical.js";

/**
 * Parse frontmatter from markdown content
 * Returns separated frontmatter object and pure markdown
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  markdown: string;
} {
  // Check for frontmatter delimiters
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, markdown: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { frontmatter: {}, markdown: content };
  }

  const yamlStr = content.slice(4, endIndex);
  const markdown = content.slice(endIndex + 5).trim();

  try {
    const parsed = parseYaml(yamlStr);
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { frontmatter, markdown };
  } catch {
    // If YAML parsing fails, treat entire content as markdown
    return { frontmatter: {}, markdown: content };
  }
}

/**
 * Serialize frontmatter and markdown into single string
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  markdown: string,
): string {
  if (Object.keys(frontmatter).length === 0) {
    return markdown;
  }

  const yaml = stringifyYaml(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${markdown}`;
}

/**
 * Auto-generate rule frontmatter with intelligent defaults
 */
export function generateRuleFrontmatter(filename: string): RuleFrontmatter {
  // Extract name from filename (remove extension and namespace separators)
  const name = filename
    .replace(/\.mdc?$/, "")
    .replace(/_/g, " ")
    .replace(/\//g, " / ");

  return {
    description: `Rule: ${name}`,
  };
}

/**
 * Auto-generate command frontmatter with intelligent defaults
 */
export function generateCommandFrontmatter(
  filename: string,
): CommandFrontmatter {
  // Extract name from filename
  const name = filename
    .replace(/\.md$/, "")
    .replace(/_/g, " ")
    .replace(/\//g, " / ");

  return {
    description: `Command: ${name}`,
    argumentHint: "[optional arguments]",
  };
}

/**
 * Validate rule frontmatter has required fields
 */
export function validateRuleFrontmatter(
  frontmatter: Record<string, unknown>,
): frontmatter is RuleFrontmatter {
  return typeof frontmatter.description === "string";
}

/**
 * Validate command frontmatter has required fields
 */
export function validateCommandFrontmatter(
  frontmatter: Record<string, unknown>,
): frontmatter is CommandFrontmatter {
  return typeof frontmatter.description === "string";
}
