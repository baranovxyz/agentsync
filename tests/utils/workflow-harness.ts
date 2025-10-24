/**
 * Workflow Harness for In-Process CLI Testing
 *
 * Provides utilities to run CLI commands in-process without spawning child processes.
 * This enables faster, more reliable tests with better control over environment and isolation.
 *
 * Reference: Test Architecture Plan Section 5 (Workflow Harness Design)
 */

import { createProgram } from "../../src/cli.js";
import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Result of running a CLI command
 */
export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string; // Combined stdout + stderr
}

/**
 * Options for running a CLI command
 */
export interface RunCliOptions {
  /** Current working directory for the command */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Standard input (for interactive commands) */
  stdin?: string;
  /** Whether to capture output (default: true) */
  capture?: boolean;
  /** Additional setup/cleanup functions */
  setup?: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

/**
 * Context for temporary test projects
 */
export interface TestContext {
  /** Temporary project directory */
  projectDir: string;
  /** Home directory override */
  homeDir: string;
  /** Cleanup function */
  cleanup: () => Promise<void>;
}

/**
 * Run a CLI command in-process
 *
 * @param args - Command line arguments (without program name)
 * @param options - Execution options
 * @returns CLI result with exit code and captured output
 *
 * @example
 * const result = await runCli(['--version']);
 * expect(result.exitCode).toBe(0);
 * expect(result.stdout).toContain('0.2.0');
 */
export async function runCli(
  args: string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const {
    cwd = process.cwd(),
    env = {},
    capture = true,
    setup,
    cleanup: cleanupFn,
  } = options;

  // Save original state
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    // Setup
    if (setup) {
      await setup();
    }

    // Change directory
    process.chdir(cwd);

    // Merge environment
    process.env = { ...originalEnv, ...env };

    // Capture output if requested
    if (capture) {
      process.stdout.write = ((chunk: string) => {
        stdout += chunk;
        return true;
      }) as any;

      process.stderr.write = ((chunk: string) => {
        stderr += chunk;
        return true;
      }) as any;
    }

    // Create and parse program
    const program = createProgram();
    program.exitOverride();

    try {
      await program.parseAsync([
        process.execPath,
        process.argv[1], // Node and script
        ...args,
      ]);
    } catch (err) {
      if (err instanceof Error && "exitCode" in err) {
        exitCode = (err as any).exitCode || 1;
      } else if (err instanceof Error) {
        stderr += err.message;
        exitCode = 1;
      } else {
        exitCode = 1;
      }
    }

    return {
      exitCode,
      stdout,
      stderr,
      output: stdout + stderr,
    };
  } finally {
    // Cleanup
    process.chdir(originalCwd);
    process.env = originalEnv;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;

    if (cleanupFn) {
      await cleanupFn();
    }
  }
}

/**
 * Create a temporary project directory for testing
 *
 * @param fn - Test function that receives the temporary context
 * @returns The result of the test function
 *
 * @example
 * await withTempProject(async ({ projectDir, homeDir }) => {
 *   const configPath = path.join(projectDir, '.agentsync', 'config.json');
 *   await fs.writeFile(configPath, JSON.stringify(config));
 *   const result = await runCli(['sync'], { cwd: projectDir });
 *   expect(result.exitCode).toBe(0);
 * });
 */
export async function withTempProject<T>(
  fn: (context: TestContext) => Promise<T>,
): Promise<T> {
  // Create temporary directories
  const baseTemp = await fs.mkdtemp(path.join(tmpdir(), "agentsync-test-"));
  const projectDir = path.join(baseTemp, "project");
  const homeDir = path.join(baseTemp, "home");

  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  const cleanup = async () => {
    // Clean up recursively
    await fs.rm(baseTemp, { recursive: true, force: true });
  };

  const context: TestContext = {
    projectDir,
    homeDir,
    cleanup,
  };

  try {
    return await fn(context);
  } finally {
    await cleanup();
  }
}

/**
 * Create a standard project structure for testing
 *
 * @param projectDir - Project directory
 * @param config - Project configuration (optional)
 *
 * @example
 * await withTempProject(async ({ projectDir }) => {
 *   await setupProjectStructure(projectDir, {
 *     version: "1.0",
 *     tools: ["cursor"],
 *     mcpServers: []
 *   });
 *   // Now projectDir has .agentsync/config.json with the provided config
 * });
 */
export async function setupProjectStructure(
  projectDir: string,
  config?: Record<string, any>,
): Promise<void> {
  const agentsyncDir = path.join(projectDir, ".agentsync");
  await fs.mkdir(agentsyncDir, { recursive: true });

  if (config) {
    const configPath = path.join(agentsyncDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  // Create AGENTS.md placeholder
  const agentsMdPath = path.join(projectDir, "AGENTS.md");
  await fs.writeFile(
    agentsMdPath,
    "# AGENTS.md\n\nAgent configuration file.\n",
  );
}

/**
 * Create a standard home directory structure for testing
 *
 * @param homeDir - Home directory path
 * @param config - Global MCP configuration (optional)
 *
 * @example
 * await withTempProject(async ({ projectDir, homeDir }) => {
 *   await setupHomeStructure(homeDir, {
 *     github: { command: "npx", args: ["..."] }
 *   });
 *   // Now homeDir has .agentsync/mcp.json with the provided config
 * });
 */
export async function setupHomeStructure(
  homeDir: string,
  config?: Record<string, any>,
): Promise<void> {
  const agentsyncDir = path.join(homeDir, ".agentsync");
  await fs.mkdir(agentsyncDir, { recursive: true });

  if (config) {
    const mcpPath = path.join(agentsyncDir, "mcp.json");
    await fs.writeFile(mcpPath, JSON.stringify(config, null, 2));
  }
}

/**
 * Assert CLI result indicates success
 *
 * @param result - CLI result to check
 * @param message - Optional assertion message
 *
 * @example
 * const result = await runCli(['--version']);
 * assertCliSuccess(result);
 */
export function assertCliSuccess(
  result: CliResult,
  message?: string,
): asserts result is CliResult {
  if (result.exitCode !== 0) {
    throw new Error(
      message ||
        `CLI exited with code ${result.exitCode}.\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`,
    );
  }
}

/**
 * Assert CLI result indicates failure
 *
 * @param result - CLI result to check
 * @param expectedCode - Expected exit code (default: 1)
 * @param message - Optional assertion message
 *
 * @example
 * const result = await runCli(['invalid-command']);
 * assertCliFailed(result);
 */
export function assertCliFailed(
  result: CliResult,
  expectedCode = 1,
  message?: string,
): void {
  if (result.exitCode === 0) {
    throw new Error(
      message ||
        `Expected CLI to fail with code ${expectedCode} but exited with 0.\nOutput:\n${result.output}`,
    );
  }
  if (result.exitCode !== expectedCode) {
    throw new Error(
      message ||
        `Expected exit code ${expectedCode} but got ${result.exitCode}.\nOutput:\n${result.output}`,
    );
  }
}

/**
 * Read JSON file from project
 *
 * @param projectDir - Project directory
 * @param filePath - Relative file path
 * @returns Parsed JSON content
 *
 * @example
 * const config = await readProjectFile(projectDir, '.agentsync/config.json');
 */
export async function readProjectFile(
  projectDir: string,
  filePath: string,
): Promise<any> {
  const fullPath = path.join(projectDir, filePath);
  const content = await fs.readFile(fullPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Write JSON file to project
 *
 * @param projectDir - Project directory
 * @param filePath - Relative file path
 * @param content - Content to write (will be JSON stringified)
 *
 * @example
 * await writeProjectFile(projectDir, '.agentsync/config.json', config);
 */
export async function writeProjectFile(
  projectDir: string,
  filePath: string,
  content: any,
): Promise<void> {
  const fullPath = path.join(projectDir, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(content, null, 2));
}

/**
 * Check if file exists in project
 *
 * @param projectDir - Project directory
 * @param filePath - Relative file path
 * @returns Whether the file exists
 *
 * @example
 * if (await projectFileExists(projectDir, '.agentsync/config.json')) {
 *   // ...
 * }
 */
export async function projectFileExists(
  projectDir: string,
  filePath: string,
): Promise<boolean> {
  const fullPath = path.join(projectDir, filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}
