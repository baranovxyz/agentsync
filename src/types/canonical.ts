/**
 * Canonical format types for rules and commands
 * All data flows through this format to ensure consistency
 */

// Frontmatter types
export interface RuleFrontmatter {
  description: string;
  globs?: string[];
  alwaysApply?: boolean;
  priority?: number;
  [key: string]: unknown; // Allow other fields
}

export interface CommandFrontmatter {
  description: string;
  argumentHint?: string;
  [key: string]: unknown;
}

// Canonical format (separated frontmatter + markdown)
export interface CanonicalRule {
  frontmatter: RuleFrontmatter;
  markdown: string;
}

export interface CanonicalCommand {
  frontmatter: CommandFrontmatter;
  markdown: string;
}
