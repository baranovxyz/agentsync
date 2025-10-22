/**
 * GitHub source parser for preset references
 * Parses github:org/repo[@ref] format
 */

export interface GitHubSource {
  org: string;
  repo: string;
  ref: string; // Always 'main' in v0.3.0-beta
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

    const withoutPrefix = source.slice(7); // Remove "github:"

    // Split ref if present
    const [repoPath, ref = "main"] = withoutPrefix.split("@");

    // Split org/repo
    const parts = repoPath.split("/");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid GitHub source: ${source}. Format: github:org/repo[@ref]`,
      );
    }

    const [org, repo] = parts;

    // Validate
    if (!(org && repo)) {
      throw new Error(
        `Invalid GitHub source: ${source}. Both org and repo required`,
      );
    }

    // v0.3.0-beta: Only support @main
    if (ref !== "main") {
      throw new Error(
        `GitHub ref "${ref}" not supported in v0.3.0-beta.\n` +
          `Only @main is supported. Version tags coming in v0.4.0.`,
      );
    }

    return { org, repo, ref };
  }

  /**
   * Convert back to source string
   */
  toString(source: GitHubSource): string {
    return `github:${source.org}/${source.repo}@${source.ref}`;
  }

  /**
   * Generate cache key (safe for filesystem)
   */
  toCacheKey(source: GitHubSource): string {
    return `github-${source.org}-${source.repo}`;
  }
}
