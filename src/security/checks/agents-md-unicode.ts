import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UnicodeDetector } from "../unicode-detector.js";
import type { SecurityCheck, SecurityContext, SecurityFinding } from "./types.js";

export class AgentsMdUnicodeCheck implements SecurityCheck {
  name = "agents-md-unicode" as const;

  async run(ctx: SecurityContext): Promise<SecurityFinding[]> {
    const filePath = join(ctx.cwd, "AGENTS.md");
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      // No AGENTS.md present - nothing to scan
      return [];
    }

    const detector = new UnicodeDetector();
    const result = detector.detect(content, filePath);
    if (!result.hasProblems || result.findings.length === 0) {
      return [];
    }

    return result.findings.map((f) => ({
      check: this.name,
      severity: f.severity,
      message: `${f.type} at line ${f.line}: ${f.description}`,
      file: f.filePath || filePath,
    }));
  }
}

export default AgentsMdUnicodeCheck;
