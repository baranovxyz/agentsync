import type { AgentSyncConfig } from "../../types/schemas.js";
import type { SecurityCheck } from "./types.js";
import { AgentsMdSecretsCheck } from "./agents-md-secrets.js";
import { AgentsMdUnicodeCheck } from "./agents-md-unicode.js";

export function getEnabledChecks(config: AgentSyncConfig): SecurityCheck[] {
  const checks: SecurityCheck[] = [];

  if (config.security?.secretScanning?.enabled !== false) {
    checks.push(new AgentsMdSecretsCheck());
  }

  if (config.security?.unicodeDetection?.enabled !== false) {
    checks.push(new AgentsMdUnicodeCheck());
  }

  return checks;
}
