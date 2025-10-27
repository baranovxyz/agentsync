/**
 * Cline rules converter
 * Cline supports plain markdown in .clinerules directory
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "./rule-converter-base.js";

export class ClineRulesConverter extends RuleConverterBase {
  /**
   * Cline supports plain markdown
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Cline keeps .md extension
    const outputFilename = `${namespace}:${filename}`;

    // Cline uses markdown as-is
    return {
      filename: outputFilename,
      content: content,
    };
  }
}
