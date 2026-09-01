/**
 * GitHub source parser for preset references
 * Parses github:org/repo[@ref] format
 */

import { GITHUB_SOURCE_PATTERN } from "../../types/schemas.js";

export interface GitHubSource {
  org: string;
  repo: string;
  ref: string;
}

export class GitHubSourceParser {
  /**
   * Parse github:company/standards[@main] → {org, repo, ref}
   * @example
   * parse('github:company/standards') → {org: 'company', repo: 'standards', ref: 'main'}
   * parse('github:company/standards@main') → {org: 'company', repo: 'standards', ref: 'main'}
   */
  parse(source: string): GitHubSource {
    // Format: github:org/repo[@ref]
    if (!source.startsWith("github:")) {
      throw new Error(
        `Invalid GitHub source: ${source}. Must start with "github:"`,
      );
    }

    const match = source.match(GITHUB_SOURCE_PATTERN);
    if (!match) {
      throw new Error(
        `Invalid GitHub source: ${source}. Format: github:org/repo[@ref]`,
      );
    }

    const [, org, repo, ref = "main"] = match;
    return { org, repo, ref };
  }
}
