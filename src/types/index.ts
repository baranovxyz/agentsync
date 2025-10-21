/**
 * Core type definitions for AgentSync
 */

// Re-export schema types
export * from "./schemas";

// Re-export preset types
export * from "./preset";

// Re-export interactive selection types
export type {
  FileSelection,
  PresetSelection,
  UserRegistryConfig,
  LocalConfig,
  ProjectConfig,
  InteractiveSelectionConfig,
} from "./schemas";

// Tool types
export type ToolName = "cursor" | "claude" | "cline" | "windsurf" | "copilot";

// Translator interface
export interface Translator {
  name: ToolName;
  translate(agentsMd: AgentsMd, targetDir: string): Promise<TranslateResult>;
  getCurrentFiles(targetDir: string): Promise<string[]>;
  dryRun(agentsMd: AgentsMd, targetDir: string): Promise<TranslateResult>;
  cleanup(targetDir: string): Promise<void>;
}

// File operation types
export interface FileOperation {
  type: "create" | "write" | "modify" | "delete" | "symlink" | "create_dir";
  path: string;
  content?: string;
  target?: string;
  permissions?: string;
}

// Sync operation types
export interface SyncOperation extends FileOperation {
  tool: ToolName;
  status?: "pending" | "in-progress" | "success" | "failed";
  error?: Error;
}

// CLI options types
export interface InitOptions {
  template?: string;
  tools?: ToolName[];
  useSymlinks?: boolean;
  force?: boolean;
}

export interface SyncOptions {
  tools?: ToolName[];
  dryRun?: boolean;
  force?: boolean;
  skipValidation?: boolean;
  skipSecurity?: boolean;
}

export interface WatchOptions extends SyncOptions {
  debounce?: number;
  ignore?: string[];
}

export interface ValidateOptions {
  strict?: boolean;
  fix?: boolean;
  showSecrets?: boolean;
}

export interface DiffOptions {
  tools?: ToolName[];
  verbose?: boolean;
}

export interface MigrateOptions {
  symlinks?: boolean;
  sources?: string[];
  force?: boolean;
}

export interface DoctorOptions {
  fix?: boolean;
  verbose?: boolean;
}

export interface AuditOptions {
  command?: string;
  result?: "success" | "failure" | "partial";
  after?: string;
  before?: string;
  limit?: number;
}

// Template types
export interface Template {
  name: string;
  description: string;
  content: string;
  tags?: string[];
  category?: string;
}

// Security types
export interface SecurityCheckResult {
  passed: boolean;
  findings: {
    secrets: SecretFinding[];
    unicode: UnicodeFinding[];
  };
  blockers: string[];
  warnings: string[];
}

// Import necessary types from other modules
import type { AgentsMd, TranslateResult } from "./schemas";

// Temporary type definitions until we implement the full modules
export interface SecretFinding {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  match: string;
  line: number;
  column: number;
}

export interface UnicodeFinding {
  type: string;
  risk: "low" | "medium" | "high";
  position: number;
  character: string;
  description: string;
}

// Parser types
export interface ParsedSection {
  title: string;
  content: string;
  level: number;
  children?: ParsedSection[];
}

export interface ParseResult {
  agentsMd: AgentsMd;
  raw: string;
  sections: ParsedSection[];
  frontmatter?: Record<string, unknown>;
}
