/**
 * RooCode commands converter
 * RooCode commands use markdown with frontmatter for metadata
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "../rules/rule-converter-base.js";

export class RooCodeCommandsConverter extends RuleConverterBase {
  /**
   * RooCode supports nested directories (recursive reading, max depth 5)
   */
  supportsNestedDirs(): boolean {
    return true;
  }

  /**
   * RooCode commands use markdown with frontmatter
   * Extracts description and argument hints from content
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Keep as markdown, use nested directory format
    const outputFilename = this.formatOutputPath(namespace, filename);

    // Extract description and argument hint from content
    const description = this.extractDescription(content);
    const argumentHint = this.extractArgumentHint(content);

    // Add frontmatter with metadata
    const frontmatter = this.buildFrontmatter(description, argumentHint);
    const convertedContent = `${frontmatter}\n${content}`;

    return {
      filename: outputFilename,
      content: convertedContent,
    };
  }

  /**
   * Extract description from content (first line or first paragraph)
   */
  private extractDescription(content: string): string {
    // Try to extract from frontmatter if it exists
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
      if (descMatch) {
        return descMatch[1].trim();
      }
    }

    // Otherwise, use first non-empty line
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        return trimmed.substring(0, 100); // Limit to 100 chars
      }
    }

    return "Command";
  }

  /**
   * Extract argument hint from content
   */
  private extractArgumentHint(content: string): string {
    // Try to extract from frontmatter if it exists
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const hintMatch = frontmatterMatch[1].match(/argument-hint:\s*(.+)/);
      if (hintMatch) {
        return hintMatch[1].trim();
      }
    }

    // Default hint
    return "[optional arguments]";
  }

  /**
   * Build frontmatter for RooCode
   */
  private buildFrontmatter(description: string, argumentHint: string): string {
    return `---
description: ${description}
argument-hint: ${argumentHint}
---`;
  }
}
