/**
 * Exit Code Integration Tests
 *
 * Runs the CLI as a subprocess to verify exit codes match JSON status.
 * Requires `pnpm build` to have been run first.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CliResultSchema } from "../../../src/types/output.js";
import { parseJsonValidated } from "../../../src/utils/fs.js";

const execFileAsync = promisify(execFile);

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const DIST_DIR = path.join(PACKAGE_ROOT, "dist");
const CLI_PATH = path.join(DIST_DIR, "cli.js");
let cliPath = CLI_PATH;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function distReady(distDir: string): Promise<boolean> {
  if (!(await pathExists(path.join(distDir, "cli.js")))) return false;

  // During `pnpm build`, tsc writes module files and Vite later replaces the
  // directory with a bundled cli.js. Both final shapes are usable; the transient
  // broken shape is a module tree missing a dependency.
  if (!(await pathExists(path.join(distDir, "sync")))) return true;
  return pathExists(path.join(distDir, "utils", "fs.js"));
}

async function prepareCliCopy(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await distReady(DIST_DIR))) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const root = await mkdtemp(path.join(PACKAGE_ROOT, ".temp-cli-e2e-dist-"));
    const copiedDist = path.join(root, "dist");
    try {
      await cp(DIST_DIR, copiedDist, { recursive: true });
      if (await distReady(copiedDist)) return path.join(copiedDist, "cli.js");
    } catch {
      // Another test may be rebuilding dist concurrently; retry with a fresh copy.
    }
    await rm(root, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("dist/cli.js is not built or is being rebuilt");
}

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("node", [cliPath, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.code ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

/** Assert exit code and JSON status are consistent */
function assertExitStatusConsistency(exitCode: number, stdout: string) {
  const parsed = parseJsonValidated(stdout.trim(), CliResultSchema);

  if (exitCode === 0) expect(parsed.status).toBe("success");
  if (exitCode === 1) expect(parsed.status).toBe("partial");
  if (exitCode >= 2) expect(parsed.status).toBe("error");
}

describe("exit code integration", () => {
  let validProject: string;
  let emptyDir: string;
  let cliCopyRoot: string | undefined;

  beforeAll(async () => {
    cliPath = await prepareCliCopy();
    cliCopyRoot = path.dirname(path.dirname(cliPath));

    validProject = await mkdtemp(path.join(tmpdir(), "agentsync-exit-valid-"));
    const agentsDir = path.join(validProject, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    emptyDir = await mkdtemp(path.join(tmpdir(), "agentsync-exit-empty-"));
  });

  afterAll(async () => {
    if (cliCopyRoot) await rm(cliCopyRoot, { recursive: true, force: true });
  });

  it("doctor --json on valid project exits 0 with status success", async () => {
    const { exitCode, stdout } = await runCli(
      ["doctor", "--json"],
      validProject,
    );
    expect(exitCode).toBe(0);
    assertExitStatusConsistency(exitCode, stdout);
  });

  it("config ls --json on valid project exits 0 with status success", async () => {
    const { exitCode, stdout } = await runCli(
      ["config", "ls", "--json"],
      validProject,
    );
    expect(exitCode).toBe(0);
    assertExitStatusConsistency(exitCode, stdout);
  });

  it("config add tool with invalid name exits 2 with status error", async () => {
    const { exitCode, stdout } = await runCli(
      ["config", "add", "tool", "nonexistent-tool-xyz", "--json"],
      validProject,
    );
    expect(exitCode).toBe(2);
    assertExitStatusConsistency(exitCode, stdout);
    const parsed = parseJsonValidated(stdout.trim(), CliResultSchema);
    expect(parsed.command).toBe("config.add");
    expect(parsed.errors?.[0]).toMatchObject({
      code: "VALIDATION_FAILED",
      suggestion: expect.stringContaining("agentsync config add tool"),
      context: expect.objectContaining({
        provided: "nonexistent-tool-xyz",
      }),
    });
  });

  it("config show --json on missing project exits with status error", async () => {
    const { exitCode, stdout } = await runCli(
      ["config", "show", "--json"],
      emptyDir,
    );
    expect(exitCode).toBeGreaterThanOrEqual(2);
    assertExitStatusConsistency(exitCode, stdout);
  });

  // This serially launches three CLI processes and measured 5.18s under the
  // full workspace suite, just over the shared 5s unit-test budget.
  it("exit code and status are always consistent across commands", async () => {
    const cases = [
      { args: ["doctor", "--json"], cwd: validProject },
      { args: ["config", "ls", "--json"], cwd: validProject },
      {
        args: ["config", "add", "tool", "zzz-bogus", "--json"],
        cwd: validProject,
      },
    ];

    for (const { args, cwd } of cases) {
      const { exitCode, stdout } = await runCli(args, cwd);
      assertExitStatusConsistency(exitCode, stdout);
    }
  }, 10_000);
});
