/**
 * Doctor Command
 * Runs diagnostics to help developers debug configuration issues.
 * Enterprise-focused: when a new dev clones and things don't work,
 * `doctor` tells them exactly what is wrong.
 */

import { ExitCode } from "../../core/errors.js";
import { cliResult, jsonStringify, projectFields } from "../../types/output.js";
import { hasFailures, runDiagnostics } from "./checks.js";
import { displayDoctorReport } from "./render.js";

export { runDiagnostics } from "./checks.js";
export { displayDoctorReport } from "./render.js";
export type { DoctorResult } from "./types.js";

/**
 * Main doctor command entry point.
 */
export async function doctor(
  options: {
    cwd?: string;
    json?: boolean;
    pretty?: boolean;
    fields?: string;
  } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const result = await runDiagnostics(cwd);
  const failed = hasFailures(result);

  if (options.json) {
    const validFields = [
      "config",
      "tools",
      "skills",
      "mcp",
      "presets",
      "drift",
      "contentDrift",
    ] as const;
    const projected = projectFields(result, options.fields, validFields);
    const status = failed ? ("error" as const) : ("success" as const);
    console.log(
      jsonStringify(cliResult("doctor", projected, { status }), options.pretty),
    );
    if (failed) process.exitCode = ExitCode.USER_ERROR;
    return;
  }

  displayDoctorReport(result);
  if (failed) process.exitCode = ExitCode.USER_ERROR;
}
