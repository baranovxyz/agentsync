/**
 * Claude rules converter
 * Claude supports plain markdown
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "./rule-converter-base.js";

export class ClaudeRulesConverter extends RuleConverterBase {
  /**
   * Claude supports plain markdown
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Claude keeps .md extension
    const outputFilename = `${namespace}:${filename}`;

    // Claude uses markdown as-is
    return {
      filename: outputFilename,
      content: content,
    };
  }
}
