/**
 * Zod schemas for AGENTS.md validation
 * Ensures compliance with the official AGENTS.md specification
 */

import { z } from "zod";

// Command schema for build and test commands
export const CommandSchema = z.object({
  description: z.string().min(1),
  command: z.string().min(1),
  scope: z.enum(["file", "project"]).default("project"),
});

// Rule schema for code style and git workflow
export const RuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).default([]),
});

// Permission rule schema
export const PermissionRuleSchema = z.object({
  action: z.string(),
  resource: z.string(),
  allowed: z.boolean(),
});

// Git rule schema
export const GitRuleSchema = z.object({
  type: z.enum(["commit", "branch", "pr", "merge"]),
  rule: z.string(),
  description: z.string().optional(),
});

// MCP Server schema
export const McpServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  description: z.string().optional(),
});

// File mapping schema for project structure
export const FileMappingSchema = z.object({
  pattern: z.string(),
  description: z.string(),
  purpose: z.string().optional(),
});

// Main AGENTS.md schema
export const AgentsMdSchema = z.object({
  projectOverview: z.string().min(1),
  buildCommands: z.array(CommandSchema).default([]),
  testCommands: z.array(CommandSchema).default([]),
  codeStyle: z.array(RuleSchema).default([]),
  projectStructure: z.array(FileMappingSchema).default([]),
  gitWorkflow: z.array(GitRuleSchema).default([]),
  permissions: z
    .object({
      allowedWithoutPrompt: z.array(z.string()).default([]),
      requireApproval: z.array(z.string()).default([]),
      blocked: z.array(z.string()).default([]),
    })
    .optional(),
  mcpServers: z.array(McpServerSchema).optional(),
  metadata: z.object({
    filePath: z.string(),
    lineCount: z.number(),
    warnings: z.array(z.string()).default([]),
    lastModified: z.string().optional(),
    version: z.string().optional(),
  }),
});

// Configuration schema for .agentsync/config.json
export const AgentSyncConfigSchema = z.object({
  version: z.string().default("1.0"),

  // GitHub registry sources (v0.3.0-beta)
  extends: z
    .array(
      z.union([
        z.string(), // Simple: "github:company/standards"
        z.object({
          source: z.string(),
          namespace: z.string().optional(), // Override default namespace
          include: z.array(z.string()).optional(), // Glob patterns
          exclude: z.array(z.string()).optional(), // Glob patterns
        }),
      ])
    )
    .optional(),

  // MCP servers (moved to main config in v0.3.0-beta)
  mcpServers: z
    .union([
      z.array(z.string()),
      z.record(
        z.string(),
        z.union([
          z.boolean(),
          z.object({
            command: z.string().optional(),
            args: z.array(z.string()).optional(),
            env: z.record(z.string(), z.string()).optional(),
          }),
        ])
      ),
    ])
    .optional(),

  tools: z.array(z.enum(["cursor", "claude", "cline", "windsurf", "copilot"])),
  useSymlinks: z.boolean().default(true),
  security: z
    .object({
      secretScanning: z
        .object({
          enabled: z.boolean().default(true),
          blockOnHighSeverity: z.boolean().default(true),
          warnOnMediumSeverity: z.boolean().default(true),
          customPatterns: z
            .array(
              z.object({
                name: z.string(),
                pattern: z.string(),
                severity: z.enum(["high", "medium", "low"]),
                description: z.string(),
              })
            )
            .optional(),
        })
        .optional(),
      unicodeDetection: z
        .object({
          enabled: z.boolean().default(true),
          blockOnHighRisk: z.boolean().default(true),
          autoSanitize: z.boolean().default(false),
          allowedUnicode: z.array(z.string()).optional(),
        })
        .optional(),
      auditLogging: z
        .object({
          enabled: z.boolean().default(true),
          logPath: z.string().default(".agentsync/logs/audit.jsonl"),
          maxSizeBytes: z.number().default(10485760),
          retentionDays: z.number().default(90),
          compressRotated: z.boolean().default(true),
        })
        .optional(),
    })
    .optional(),
  watch: z
    .object({
      enabled: z.boolean().default(true),
      debounceMs: z.number().default(500),
      ignorePatterns: z.array(z.string()).optional(),
    })
    .optional(),
});

// Translator result schema
export const TranslateResultSchema = z.object({
  success: z.boolean(),
  operations: z.array(
    z.object({
      type: z.enum([
        "create",
        "write",
        "modify",
        "delete",
        "symlink",
        "create_dir",
      ]),
      path: z.string(),
      content: z.string().optional(),
      expectedTarget: z.string().optional(),
      expectedContent: z.string().optional(),
    })
  ),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

// Sync result schema
export const SyncResultSchema = z.object({
  success: z.boolean(),
  changes: z.array(
    z.object({
      tool: z.string(),
      operations: z.array(
        z.object({
          type: z.string(),
          path: z.string(),
          status: z.enum(["success", "failed", "skipped"]),
          error: z.string().optional(),
        })
      ),
    })
  ),
  duration: z.number(),
  timestamp: z.string(),
});

// Workspace schema for monorepo support
export const WorkspaceSchema = z.object({
  type: z.enum(["nx", "turborepo", "pnpm", "npm", "yarn", "single"]),
  root: z.string(),
  packages: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      agentsMdPath: z.string().optional(),
      version: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
    })
  ),
});

// Diff result schema
export const DiffResultSchema = z.object({
  changes: z.array(
    z.object({
      type: z.enum(["create", "modify", "delete"]),
      path: z.string(),
      diff: z.string().optional(),
      oldContent: z.string().optional(),
      newContent: z.string().optional(),
    })
  ),
  summary: z.object({
    created: z.number(),
    modified: z.number(),
    deleted: z.number(),
    total: z.number(),
  }),
});

// Validation result schema
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      type: z.string(),
      message: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
      severity: z.enum(["error", "warning", "info"]),
    })
  ),
  warnings: z.array(
    z.object({
      type: z.string(),
      message: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
    })
  ),
  securityIssues: z.array(
    z.object({
      type: z.enum(["secret", "unicode"]),
      severity: z.enum(["high", "medium", "low"]),
      description: z.string(),
      location: z.string(),
    })
  ),
});

// Type exports for TypeScript usage
export type AgentsMd = z.infer<typeof AgentsMdSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type GitRule = z.infer<typeof GitRuleSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type FileMapping = z.infer<typeof FileMappingSchema>;
export type AgentSyncConfig = z.infer<typeof AgentSyncConfigSchema>;
export type TranslateResult = z.infer<typeof TranslateResultSchema>;
export type SyncResult = z.infer<typeof SyncResultSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type DiffResult = z.infer<typeof DiffResultSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Validate AGENTS.md content against schema
 */
export function validateAgentsMd(data: unknown): AgentsMd {
  return AgentsMdSchema.parse(data);
}

/**
 * Validate configuration file
 */
export function validateConfig(data: unknown): AgentSyncConfig {
  return AgentSyncConfigSchema.parse(data);
}

/**
 * Safe parse with error details
 */
export function safeParseAgentsMd(
  data: unknown
): { success: true; data: AgentsMd } | { success: false; error: z.ZodError } {
  const result = AgentsMdSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Parsed extends entry with normalized namespace
 */
export interface ExtendsEntry {
  source: string;
  namespace: string;
  include?: string[];
  exclude?: string[];
}

/**
 * Parse extends field to normalized format with extracted namespaces
 * @example
 * normalizeExtends(['github:company/standards']) → [{source: 'github:company/standards', namespace: 'company'}]
 */
export function normalizeExtends(
  extends_?: AgentSyncConfig["extends"]
): ExtendsEntry[] {
  if (!extends_) return [];

  return extends_.map((entry) => {
    if (typeof entry === "string") {
      // Extract namespace from source: github:company/standards → namespace: company
      const namespace = extractNamespace(entry);
      return { source: entry, namespace };
    }

    return {
      source: entry.source,
      namespace: entry.namespace || extractNamespace(entry.source),
      include: entry.include,
      exclude: entry.exclude,
    };
  });
}

/**
 * Extract namespace from GitHub source
 * @example
 * extractNamespace('github:company/standards') → 'company'
 * extractNamespace('github:acme-corp/backend-rules') → 'acme-corp'
 */
function extractNamespace(source: string): string {
  // github:company/standards → company
  // github:acme-corp/backend-rules → acme-corp
  const match = source.match(/^github:([^/]+)\//);
  if (!match) {
    throw new Error(
      `Invalid GitHub source: ${source}. Expected format: github:org/repo`
    );
  }
  return match[1];
}

// Interactive Selection Configuration Schema (v2.0)

// File-level selection schema
export const FileSelectionSchema = z.object({
  include: z.array(z.string()).min(1, "Include patterns cannot be empty"),
  exclude: z.array(z.string()).optional(),
});

// Preset selection schema for rules, commands, and MCPs
export const PresetSelectionSchema = z.object({
  rules: FileSelectionSchema.optional(),
  commands: FileSelectionSchema.optional(),
  mcps: z.array(z.string()).optional(),
});

// User registry configuration
export const UserRegistryConfigSchema = z.object({
  presets: z.array(z.string()).min(1, "User presets cannot be empty"),
  defaultSelections: z.record(z.string(), PresetSelectionSchema).optional(),
});

// Local configuration (personal overrides)
export const LocalConfigSchema = z.object({
  selections: z.record(z.string(), PresetSelectionSchema).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
});

// Project configuration (team-shared)
export const ProjectConfigSchema = z.object({
  selections: z.record(z.string(), PresetSelectionSchema).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
  tools: z
    .array(z.enum(["cursor", "claude", "cline", "windsurf", "copilot"]))
    .optional(),
});

// Main interactive selection configuration schema
export const InteractiveSelectionConfigSchema = z.object({
  version: z.string().default("2.0"),
  user: UserRegistryConfigSchema.optional(),
  project: ProjectConfigSchema.optional(),
  local: LocalConfigSchema.optional(),
});

// Type exports for interactive selection configuration
export type FileSelection = z.infer<typeof FileSelectionSchema>;
export type PresetSelection = z.infer<typeof PresetSelectionSchema>;
export type UserRegistryConfig = z.infer<typeof UserRegistryConfigSchema>;
export type LocalConfig = z.infer<typeof LocalConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type InteractiveSelectionConfig = z.infer<
  typeof InteractiveSelectionConfigSchema
>;

/**
 * Validate interactive selection configuration
 */
export function validateInteractiveSelectionConfig(
  data: unknown
): InteractiveSelectionConfig {
  return InteractiveSelectionConfigSchema.parse(data);
}

/**
 * Safe parse interactive selection configuration with error details
 */
export function safeParseInteractiveSelectionConfig(
  data: unknown
):
  | { success: true; data: InteractiveSelectionConfig }
  | { success: false; error: z.ZodError } {
  const result = InteractiveSelectionConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}
