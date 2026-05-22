/**
 * Doctor Command — Shared Types
 */

import type { ToolName } from "../../constants.js";

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
  workerHints: Array<{
    tool: string;
    severity: "warning";
    message: string;
    fix: string;
  }>;
}

/** Intermediate result from config check, carrying parsed fields for downstream checks. */
export interface ConfigCheckResult {
  config: DoctorResult["config"];
  configPath?: string;
  tools: ToolName[];
  mcpServers: Record<string, Record<string, unknown>>;
  extendsSources: string[];
}
