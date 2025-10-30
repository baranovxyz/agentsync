/**
 * GitHub source plugin
 * Wraps GitHubResolver in the SourcePlugin interface
 */

import type { GitHubResolver } from "./github-resolver.js";
import { GitHubSourceParser } from "./github-source.js";
import type {
  ResolveOptions,
  SourcePlugin,
  SourceType,
} from "./source-plugin.js";

/**
 * Plugin for handling GitHub repository sources (github:org/repo format)
 * Provides optimized handling for GitHub-specific features like SSH/HTTPS fallback
 */
export class GitHubSourcePlugin implements SourcePlugin {
  private parser: GitHubSourceParser;

  constructor(
    private githubResolver: GitHubResolver,
    parser?: GitHubSourceParser,
  ) {
    this.parser = parser || new GitHubSourceParser();
  }

  getType(): SourceType {
    return "github";
  }

  canHandle(source: string): boolean {
    return source.startsWith("github:");
  }

  validate(source: string): void {
    // GitHubSourceParser.parse() throws if invalid
    this.parser.parse(source);
  }

  async resolve(source: string, options?: ResolveOptions): Promise<string> {
    return this.githubResolver.resolve(source, options);
  }

  getCacheKey(source: string): string {
    const parsed = this.parser.parse(source);
    return this.parser.toCacheKey(parsed);
  }
}
