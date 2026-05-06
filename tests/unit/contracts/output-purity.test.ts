/**
 * Output Purity Contract Tests
 *
 * Validates that --json output:
 * 1. Is exactly one JSON object on stdout
 * 2. Matches the CliResult schema
 * 3. Contains no log leakage (ANSI codes, emojis, bare text)
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliResultSchema } from "../../../src/types/output.js";

/** Capture stdout by temporarily replacing console.log */
function captureStdout(): { getOutput: () => string; restore: () => void } {
  const chunks: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  return {
    getOutput: () => chunks.join("\n"),
    restore: () => {
      console.log = origLog;
    },
  };
}

/** Assert stdout is a single valid CliResult JSON object with no leakage */
function assertPureJson(raw: string, expectedCommand: string) {
  const trimmed = raw.trim();

  // No ANSI escape sequences (ESC character = char code 27)
  expect(trimmed.includes(String.fromCharCode(27))).toBe(false);
  // No emoji indicators
  expect(trimmed).not.toMatch(/[✅⚠❌🔍]/u);
  // Starts with { ends with }
  expect(trimmed[0]).toBe("{");
  expect(trimmed[trimmed.length - 1]).toBe("}");

  // Parses as exactly one JSON object
  const parsed = JSON.parse(trimmed);
  expect(typeof parsed).toBe("object");
  expect(parsed).not.toBeNull();

  // Matches CliResult schema
  const validation = CliResultSchema.safeParse(parsed);
  expect(
    validation.success,
    `Schema validation failed: ${JSON.stringify(validation.error?.issues)}`,
  ).toBe(true);

  // Command field matches
  expect(parsed.command).toBe(expectedCommand);
}

describe("output purity contract", () => {
  let tempDir: string;
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agentsync-purity-"));
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("init --json produces valid CliResult", async () => {
    const origCwd = process.cwd;
    process.cwd = () => tempDir;
    try {
      const { init } = await import("../../../src/commands/init.js");
      await init({ json: true });
      assertPureJson(capture.getOutput(), "init");
    } finally {
      process.cwd = origCwd;
    }
  });

  it("config ls --json produces valid CliResult", async () => {
    const agentsDir = path.join(tempDir, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    const { configLs } = await import("../../../src/commands/config/ls.js");
    const result = await configLs(undefined, { cwd: tempDir });

    const { cliResult } = await import("../../../src/types/output.js");
    const output = cliResult("config.ls", result);
    console.log(JSON.stringify(output, null, 2));

    assertPureJson(capture.getOutput(), "config.ls");
  });

  it("config show --json produces valid CliResult", async () => {
    const agentsDir = path.join(tempDir, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    const { configShow } = await import("../../../src/commands/config/show.js");
    const config = await configShow({ cwd: tempDir });

    const { cliResult } = await import("../../../src/types/output.js");
    const output = cliResult("config.show", config);
    console.log(JSON.stringify(output, null, 2));

    assertPureJson(capture.getOutput(), "config.show");
  });

  it("doctor --json produces valid CliResult", async () => {
    const agentsDir = path.join(tempDir, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    const { doctor } = await import("../../../src/commands/doctor/index.js");

    const origCwd = process.cwd;
    process.cwd = () => tempDir;
    try {
      await doctor({ json: true, cwd: tempDir });
      assertPureJson(capture.getOutput(), "doctor");
    } finally {
      process.cwd = origCwd;
    }
  });

  it("error in --json mode produces valid CliResult with status error", async () => {
    const { cliError } = await import("../../../src/types/output.js");
    const output = cliError(
      "config.add",
      {},
      {
        code: "VALIDATION_ERROR",
        message: "Unknown tool",
        suggestion: "agentsync config add tool cursor",
      },
    );
    console.log(JSON.stringify(output, null, 2));

    const raw = capture.getOutput();
    assertPureJson(raw, "config.add");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.status).toBe("error");
    expect(parsed.errors).toHaveLength(1);
  });
});
