/**
 * Cursor commands converter
 * Cursor commands use plain markdown
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "../rules/rule-converter-base.js";

export class CursorCommandsConverter extends RuleConverterBase {
  /**
   * Cursor commands use plain markdown
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Keep as markdown, namespace in filename
    const outputFilename = `${namespace}:${filename}`;

    return {
      filename: outputFilename,
      content: content,
    };
  }
}
