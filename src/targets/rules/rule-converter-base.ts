/**
 * Base class for rule converters
 * Converts namespaced rules to tool-specific formats
 */

export interface RuleConversionResult {
  filename: string;
  content: string;
}

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown> | null;
  content: string; // content without frontmatter
}

export interface FrontmatterValidationResult {
  isValid: boolean;
  warnings: string[];
}

export abstract class RuleConverterBase {
  /**
   * Convert a rule to tool-specific format
   */
  abstract convert(
    namespacedFilename: string, // e.g., "team_typescript.md"
    content: string,
  ): RuleConversionResult;

  /**
   * Whether this tool supports nested directories for namespace organization
   */
  abstract supportsNestedDirs(): boolean;

  /**
   * Extract namespace and base filename
   * Handles both namespaced files (preset: "company_typescript.md")
   * and non-namespaced files (project custom: "auth.md")
   */
  protected parseNamespacedFilename(namespacedFilename: string): {
    namespace: string;
    filename: string;
  } {
    const underscoreIndex = namespacedFilename.indexOf("_");
    if (underscoreIndex === -1) {
      // No underscore = project custom file (not namespaced)
      // Return empty namespace and full filename
      return {
        namespace: "",
        filename: namespacedFilename,
      };
    }

    return {
      namespace: namespacedFilename.slice(0, underscoreIndex),
      filename: namespacedFilename.slice(underscoreIndex + 1),
    };
  }

  /**
   * Format the output path based on tool's nested directory support
   */
  protected formatOutputPath(namespace: string, filename: string): string {
    if (this.supportsNestedDirs()) {
      // Nested tools: use namespace/filename format if namespace exists
      // For project custom files (empty namespace), just use filename
      return namespace ? `${namespace}/${filename}` : filename;
    }
    // Flat tools: use namespace_filename format if namespace exists
    // For project custom files (empty namespace), just use filename
    return namespace ? `${namespace}_${filename}` : filename;
  }

  /**
   * Parse YAML frontmatter from markdown content
   * Returns frontmatter object and content without frontmatter
   */
  protected parseFrontmatter(content: string): FrontmatterParseResult {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!frontmatterMatch) {
      return { frontmatter: null, content };
    }

    const frontmatterText = frontmatterMatch[1];
    const frontmatter: Record<string, unknown> = {};

    // Simple YAML parser for key: value pairs
    const lines = frontmatterText.split("\n");
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Handle basic types
        if (value === "true" || value === "false") {
          frontmatter[key] = value === "true";
        } else if (/^\d+$/.test(value)) {
          frontmatter[key] = Number.parseInt(value, 10);
        } else {
          // Remove quotes if present
          frontmatter[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

    // Remove frontmatter from content
    const contentWithoutFrontmatter = content.slice(frontmatterMatch[0].length);

    return { frontmatter, content: contentWithoutFrontmatter };
  }

  /**
   * Strip frontmatter from content, returning only body
   */
  protected stripFrontmatter(content: string): string {
    return this.parseFrontmatter(content).content;
  }

  /**
   * Extract a specific field from frontmatter
   */
  protected extractFrontmatterField(
    content: string,
    field: string,
  ): string | null {
    const { frontmatter } = this.parseFrontmatter(content);
    if (!(frontmatter && field in frontmatter)) {
      return null;
    }
    const value = frontmatter[field];
    return typeof value === "string" ? value : String(value);
  }

  /**
   * Validate command frontmatter
   * Commands require: description
   * Optional: argument-hint
   */
  protected validateCommandFrontmatter(
    frontmatter: Record<string, unknown> | null,
  ): FrontmatterValidationResult {
    const warnings: string[] = [];

    if (!frontmatter) {
      warnings.push("Missing frontmatter");
      return { isValid: false, warnings };
    }

    if (!frontmatter.description) {
      warnings.push("Missing required field: description");
    }

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Validate rule frontmatter
   * Rules should have at least a description
   */
  protected validateRuleFrontmatter(
    frontmatter: Record<string, unknown> | null,
  ): FrontmatterValidationResult {
    const warnings: string[] = [];

    if (!frontmatter) {
      warnings.push("Missing frontmatter");
      return { isValid: false, warnings };
    }

    if (!frontmatter.description) {
      warnings.push("Missing recommended field: description");
    }

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Build command frontmatter
   */
  protected buildCommandFrontmatter(
    description: string,
    argumentHint: string,
  ): string {
    return `---
description: ${description}
argument-hint: ${argumentHint}
---`;
  }
}
