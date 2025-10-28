/**
 * RooCode rules converter
 * RooCode supports markdown in .roo/rules directory
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "./rule-converter-base.js";

export class RooCodeRulesConverter extends RuleConverterBase {
  /**
   * RooCode supports nested directories (recursive reading, max depth 5)
   */
  supportsNestedDirs(): boolean {
    return true;
  }

  /**
   * RooCode supports plain markdown
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // RooCode keeps .md extension
    const outputFilename = this.formatOutputPath(namespace, filename);

    // RooCode uses markdown as-is
    return {
      filename: outputFilename,
      content: content,
    };
  }
}
