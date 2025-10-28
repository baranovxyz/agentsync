/**
 * Base class for rule converters
 * Converts namespaced rules to tool-specific formats
 */

export interface RuleConversionResult {
  filename: string;
  content: string;
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
   */
  protected parseNamespacedFilename(namespacedFilename: string): {
    namespace: string;
    filename: string;
  } {
    const underscoreIndex = namespacedFilename.indexOf("_");
    if (underscoreIndex === -1) {
      throw new Error(`Invalid namespaced filename: ${namespacedFilename}`);
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
      // Nested tools use namespace/filename format
      return `${namespace}/${filename}`;
    }
    // Flat tools use namespace_filename format
    return `${namespace}_${filename}`;
  }
}
