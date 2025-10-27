import picocolors from "picocolors";
import { ErrorSeverity, SecurityError } from "../../core/errors.js";
import type { AgentSyncConfig } from "../../types/schemas.js";
import { getEnabledChecks } from "./index.js";
import type { SecurityFinding } from "./types.js";

const pc = picocolors;

export async function runSecurityChecks(
  cwd: string,
  config: AgentSyncConfig,
  env: Record<string, string>,
): Promise<{ warnings: SecurityFinding[] }> {
  const checks = getEnabledChecks(config);
  if (checks.length === 0) {
    return { warnings: [] };
  }

  const findings: SecurityFinding[] = [];
  for (const check of checks) {
    try {
      const result = await check.run({ cwd, config, env });
      findings.push(...result);
    } catch (error) {
      // Non-fatal: treat check failure as a warning in alpha/beta
      console.log(
        pc.yellow(
          `  ⚠ Security check failed: ${check.name} - ${(error as Error).message}`,
        ),
      );
    }
  }

  // Group findings by severity
  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");
  const low = findings.filter((f) => f.severity === "low");

  // Blocking behavior
  const blockOnHighSecrets =
    config.security?.secretScanning?.blockOnHighSeverity !== false;
  const blockOnHighUnicode =
    config.security?.unicodeDetection?.blockOnHighRisk !== false;

  const hasHighSecrets = high.some((f) => f.check === "agents-md-secrets");
  const hasHighUnicode = high.some((f) => f.check === "agents-md-unicode");

  if (
    (blockOnHighSecrets && hasHighSecrets) ||
    (blockOnHighUnicode && hasHighUnicode)
  ) {
    const reasons: string[] = [];
    if (blockOnHighSecrets && hasHighSecrets)
      reasons.push("high-severity secrets");
    if (blockOnHighUnicode && hasHighUnicode) reasons.push("high-risk Unicode");

    throw new SecurityError(
      `Security checks failed: ${reasons.join(" and ")} detected in AGENTS.md`,
      ErrorSeverity.HIGH,
      {
        findings: high,
      },
    );
  }

  // Print warnings (non-blocking)
  const warnCount = medium.length + low.length + high.length;
  if (warnCount > 0) {
    console.log(pc.yellow("\n🔐 Security warnings detected in AGENTS.md:"));
    for (const f of findings) {
      const sev = f.severity.toUpperCase();
      console.log(
        pc.yellow(
          `  - [${sev}] (${f.check}) ${f.message}${f.file ? ` [${f.file}]` : ""}`,
        ),
      );
    }
    console.log();
  }

  return { warnings: findings };
}

export default runSecurityChecks;
