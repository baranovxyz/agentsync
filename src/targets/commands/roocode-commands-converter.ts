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
   * Extracts description and argument hints from content, strips existing frontmatter
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Keep as markdown, use nested directory format
    const outputFilename = this.formatOutputPath(namespace, filename);

    // Parse existing frontmatter and get content without it
    const parsed = this.parseFrontmatter(content);

    // Extract or use defaults
    const description =
      this.extractFrontmatterField(content, "description") ||
      this.extractFirstNonHeaderLine(parsed.content) ||
      "Command";
    const argumentHint =
      this.extractFrontmatterField(content, "argument-hint") ||
      "[optional arguments]";

    // Build new frontmatter and use content WITHOUT old frontmatter
    const frontmatter = this.buildCommandFrontmatter(description, argumentHint);
    const convertedContent = `${frontmatter}\n${parsed.content}`;

    return {
      filename: outputFilename,
      content: convertedContent,
    };
  }

  /**
   * Extract first non-empty, non-header line from content
   */
  private extractFirstNonHeaderLine(content: string): string | null {
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        return trimmed.substring(0, 100); // Limit to 100 chars
      }
    }
    return null;
  }
}
