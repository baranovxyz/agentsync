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

// Import result types (includes metadata from source)
export interface ImportedRule extends CanonicalRule {
  sourcePath: string; // Original file path
  modifiedTime?: Date;
}

export interface ImportedCommand extends CanonicalCommand {
  sourcePath: string;
  modifiedTime?: Date;
}

// Tool directory detection result
export interface ToolDirectoryInfo {
  toolName: "cursor" | "claude" | "cline" | "roocode";
  path: string;
  scope: "global" | "project";
  hasRules: boolean;
  hasCommands: boolean;
  hasMCP: boolean;
  ruleCount?: number;
  commandCount?: number;
}
