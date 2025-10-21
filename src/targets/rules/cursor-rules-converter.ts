/**
 * Cursor rules converter
 * Converts markdown to Cursor .mdc format
 */

import {
  RuleConverterBase,
  type RuleConversionResult,
} from './rule-converter-base.js';

export class CursorRulesConverter extends RuleConverterBase {
  /**
   * Convert markdown to Cursor .mdc format
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } = this.parseNamespacedFilename(
      namespacedFilename
    );

    // Cursor uses .mdc extension
    const baseFilename = filename.replace(/\.md$/, '');
    const outputFilename = `${namespace}:${baseFilename}.mdc`;

    // Cursor .mdc is essentially markdown with frontmatter
    // Keep content as-is (Cursor handles frontmatter)
    return {
      filename: outputFilename,
      content: content,
    };
  }
}
