/**
 * Claude commands converter
 * Claude commands use plain markdown
 */

import {
  type RuleConversionResult,
  RuleConverterBase,
} from "../rules/rule-converter-base.js";

export class ClaudeCommandsConverter extends RuleConverterBase {
  /**
   * Claude Code supports nested directories
   */
  supportsNestedDirs(): boolean {
    return true;
  }

  /**
   * Claude commands use plain markdown
   */
  convert(namespacedFilename: string, content: string): RuleConversionResult {
    const { namespace, filename } =
      this.parseNamespacedFilename(namespacedFilename);

    // Keep as markdown, use nested directory format
    const outputFilename = this.formatOutputPath(namespace, filename);

    return {
      filename: outputFilename,
      content: content,
    };
  }
}
