import type { AgentSyncConfig } from "../../types/schemas.js";

export interface SecurityFinding {
  check: string;
  severity: "low" | "medium" | "high";
  message: string;
  file?: string;
}

export interface SecurityContext {
  cwd: string;
  config: AgentSyncConfig;
  env: Record<string, string>;
}

export interface SecurityCheck {
  name: string;
  run(ctx: SecurityContext): Promise<SecurityFinding[]>;
}
