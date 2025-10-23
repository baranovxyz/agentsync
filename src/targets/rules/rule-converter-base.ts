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
    namespacedFilename: string, // e.g., "team:typescript.md"
    content: string,
  ): RuleConversionResult;

  /**
   * Extract namespace and base filename
   */
  protected parseNamespacedFilename(namespacedFilename: string): {
    namespace: string;
    filename: string;
  } {
    const colonIndex = namespacedFilename.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid namespaced filename: ${namespacedFilename}`);
    }

    return {
      namespace: namespacedFilename.slice(0, colonIndex),
      filename: namespacedFilename.slice(colonIndex + 1),
    };
  }
}
