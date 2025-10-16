/**
 * Zod schemas for AGENTS.md validation
 * Ensures compliance with the official AGENTS.md specification
 */

import { z } from 'zod';

// Command schema for build and test commands
export const CommandSchema = z.object({
  description: z.string().min(1),
  command: z.string().min(1),
  scope: z.enum(['file', 'project']).default('project'),
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
  type: z.enum(['commit', 'branch', 'pr', 'merge']),
  rule: z.string(),
  description: z.string().optional(),
});

// MCP Server schema
export const McpServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
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
  version: z.string().default('1.0'),
  tools: z.array(
    z.enum(['cursor', 'claude', 'cline', 'windsurf', 'copilot'])
  ),
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
                severity: z.enum(['high', 'medium', 'low']),
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
          logPath: z.string().default('.agentsync/logs/audit.jsonl'),
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
        'create',
        'write',
        'modify',
        'delete',
        'symlink',
        'create_dir',
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
          status: z.enum(['success', 'failed', 'skipped']),
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
  type: z.enum(['nx', 'turborepo', 'pnpm', 'npm', 'yarn', 'single']),
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
      type: z.enum(['create', 'modify', 'delete']),
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
      severity: z.enum(['error', 'warning', 'info']),
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
      type: z.enum(['secret', 'unicode']),
      severity: z.enum(['high', 'medium', 'low']),
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