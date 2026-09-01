/**
 * Doctor Command — Shared Types
 */

import type { ToolName } from "../../constants.js";
import type { McpServerConfig } from "../../types/schemas.js";

export interface DoctorResult {
  config: { found: boolean; valid: boolean; error?: string };
  tools: Array<{ name: string }>;
  skills: { count: number; synced: boolean };
  mcp: Array<{
    name: string;
    configured: boolean;
    envResolved: boolean;
    missingEnvVars: string[];
    hasEnvRefs: boolean;
    /** "ok" = all env resolved, "warning" = no env refs, "critical" = unresolved tokens */
    severity: "ok" | "warning" | "critical";
  }>;
  presets: Array<{ source: string; valid: boolean }>;
  drift: Array<{ tool: string; status: "stale" | "missing" | "ok" }>;
  contentDrift: Array<{
    file: string;
    status: "ok" | "modified" | "missing";
  }>;
  /**
   * Per-tool status for the "reads project .agents/ but not global
   * ~/.agents/" gap (see `src/sync/global-skills-gap.ts`). Only includes
   * tools where `ToolProvider.readsGlobalAgentsDir === false`.
   * "ok" covers both "no global skills to lose" and "remedy symlink/dir
   * present"; "gap" means global skills exist and the remedy is missing.
   */
  globalSkillsGap: Array<{
    tool: string;
    status: "ok" | "gap";
    skillCount: number;
    skills: string[];
    message?: string;
    fix?: string;
  }>;
}

/** Intermediate result from config check, carrying parsed fields for downstream checks. */
export interface ConfigCheckResult {
  config: DoctorResult["config"];
  configPath?: string;
  tools: ToolName[];
  mcpServers: Record<string, McpServerConfig>;
  extendsSources: string[];
}
