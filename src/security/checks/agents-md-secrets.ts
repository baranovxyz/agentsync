import { readFile } from "node:fs/promises";
import { join } from "node:path";
import SecurityScanner from "../scanner.js";
import type { SecurityCheck, SecurityContext, SecurityFinding } from "./types.js";

export class AgentsMdSecretsCheck implements SecurityCheck {
  name = "agents-md-secrets" as const;

  async run(ctx: SecurityContext): Promise<SecurityFinding[]> {
    const filePath = join(ctx.cwd, "AGENTS.md");
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      // No AGENTS.md present - nothing to scan
      return [];
    }

    const scanner = new SecurityScanner();
    const result = await scanner.scan(content, filePath);

    if (!result.hasSensitiveData || result.findings.length === 0) {
      return [];
    }

    return result.findings.map((f) => ({
      check: this.name,
      // Map critical to high for unified severity
      severity: (f.severity === "critical" ? "high" : (f.severity as "low" | "medium" | "high")),
      message: `${f.type} at line ${f.line}: ${f.suggestion}`,
      file: filePath,
    }));
  }
}

export default AgentsMdSecretsCheck;
