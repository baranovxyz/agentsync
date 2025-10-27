/**
 * In-Process CLI Testing Harness
 * Allows running CLI commands without spawning processes
 * Replaces execa/spawn pattern with direct function invocation
 */

import * as os from "node:os";
import * as path from "node:path";
import { createProgram } from "../../src/cli.js";
import * as fs from "../../src/utils/fs.js";

export interface RunCliOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  capture?: boolean;
}

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run CLI command in-process without spawning
 * @param args - Command arguments (excluding 'node' and 'agentsync')
 * @param options - Options for execution
 * @returns Result with exit code and output
 */
export async function runCli(
  args: string[],
  options: RunCliOptions = {}
): Promise<RunCliResult> {
  const { cwd, env, capture = true } = options;
  const originalCwd = process.cwd();
  const savedEnv = { ...process.env };
  let stdout = "";
  let stderr = "";

  try {
    // Change directory if specified
    if (cwd) {
      process.chdir(cwd);
    }

    // Apply environment overrides
    if (env) {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) {
          delete (process.env as any)[k];
        } else {
          (process.env as any)[k] = v;
        }
      }
    }

    // Create fresh program instance with exitOverride
    const program = createProgram();

    // Capture output if requested
    if (capture) {
      program.configureOutput({
        writeOut: (s) => (stdout += s),
        writeErr: (s) => (stderr += s),
        outputError: (s) => (stderr += s),
      });
    }

    // Parse and execute
    let exitCode = 0;
    try {
      exitCode = await program
        .parseAsync(args, { from: "user" })
        .then(() => 0)
        .catch((err) => {
          // Commander with exitOverride throws on exit
          if (err && typeof err.code === "number") {
            return err.code;
          }
          // Re-throw if not an exit error
          throw err;
        });
    } catch (err) {
      // Catch any errors and convert to stderr/exit code
      if (err instanceof Error) {
        stderr += err.message;
        exitCode = 1;
      } else {
        stderr += String(err);
        exitCode = 1;
      }
    }

    return { exitCode, stdout, stderr };
  } finally {
    // Restore environment
    process.chdir(originalCwd);
    Object.keys(process.env).forEach((key) => {
      if (!(key in savedEnv)) {
        delete (process.env as any)[key];
      }
    });
    Object.assign(process.env, savedEnv);
  }
}

/**
 * Create temporary project structure for testing
 * @param fn - Async function to run with temp dirs
 * @returns Result of fn
 */
export async function withTempProject<T>(
  fn: (ctx: { projectDir: string; homeDir: string }) => Promise<T>
): Promise<T> {
  const projectDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "agentsync-project-")
  );
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-home-"));

  try {
    return await fn({ projectDir, homeDir });
  } finally {
    await fs.remove(projectDir);
    await fs.remove(homeDir);
  }
}

/**
 * Normalize output for deterministic assertions
 * - Converts CRLF to LF
 * - Trims trailing whitespace
 * - Replaces temp paths with placeholders
 * @param output - Raw output
 * @param tempPaths - Temp paths to replace
 * @returns Normalized output
 */
export function normalizeOutput(
  output: string,
  tempPaths: Record<string, string> = {}
): string {
  let normalized = output
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\n\s*$/g, "\n") // Trim trailing whitespace
    .replace(/^(\s*\n)+/g, ""); // Remove leading blank lines

  // Replace temp paths with placeholders
  for (const [original, placeholder] of Object.entries(tempPaths)) {
    normalized = normalized.replace(new RegExp(original, "g"), placeholder);
  }

  return normalized;
}

/**
 * Assert CLI success
 * @param result - CLI result
 */
export function assertSuccess(result: RunCliResult): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
    );
  }
}

/**
 * Assert CLI failure
 * @param result - CLI result
 * @param expectedCode - Expected exit code (default 1)
 */
export function assertFailure(result: RunCliResult, expectedCode = 1): void {
  if (result.exitCode === 0) {
    throw new Error(
      `Expected CLI to fail with code ${expectedCode}, but succeeded\nStdout: ${result.stdout}`
    );
  }
  if (result.exitCode !== expectedCode) {
    throw new Error(
      `Expected exit code ${expectedCode}, got ${result.exitCode}\nStderr: ${result.stderr}`
    );
  }
}
