/**
 * Exit Code Integration Tests
 *
 * Runs the CLI as a subprocess to verify exit codes match JSON status.
 * Requires `pnpm build` to have been run first.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { CliResultSchema } from "../../../src/types/output.js";

const execFileAsync = promisify(execFile);

const CLI_PATH = path.resolve(__dirname, "../../../dist/cli.js");

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("node", [CLI_PATH, ...args], {
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
  const parsed = JSON.parse(stdout.trim());
  const validation = CliResultSchema.safeParse(parsed);
  expect(validation.success, `Invalid CliResult: ${stdout}`).toBe(true);

  if (exitCode === 0) expect(parsed.status).toBe("success");
  if (exitCode === 1) expect(parsed.status).toBe("partial");
  if (exitCode >= 2) expect(parsed.status).toBe("error");
}

describe("exit code integration", () => {
  let validProject: string;
  let emptyDir: string;

  beforeAll(async () => {
    validProject = await mkdtemp(path.join(tmpdir(), "agentsync-exit-valid-"));
    const agentsDir = path.join(validProject, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    emptyDir = await mkdtemp(path.join(tmpdir(), "agentsync-exit-empty-"));
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
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.errors[0].code).toBeDefined();
  });

  it("config show --json on missing project exits with status error", async () => {
    const { exitCode, stdout } = await runCli(
      ["config", "show", "--json"],
      emptyDir,
    );
    expect(exitCode).toBeGreaterThanOrEqual(2);
    assertExitStatusConsistency(exitCode, stdout);
  });

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
  });
});
