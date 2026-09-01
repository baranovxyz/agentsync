/**
 * Sync "zero resolved tools" warning tests.
 *
 * A config that resolves to zero tools used to silently exit 0 with
 * `status: "success"` and write nothing. This is almost always a config
 * mistake. The unrelated dallay/Rust config uses the same file path, so its
 * explicitly classified read-only layout gets separate recovery guidance.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import { CliResultSchema } from "../../../src/types/output.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

// Isolate from real ~/.agents/ so a global `tools = [...]` on the dev
// machine can't mask a zero-tools project config.
vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

describe("Sync: zero resolved tools warning", () => {
  let tmpDir: string;
  let consoleOutput: string[];
  let warnOutput: string[];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-no-tools-"));
    consoleOutput = [];
    warnOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.warn = (...args: unknown[]) => {
      warnOutput.push(args.map(String).join(" "));
    };
    process.exitCode = undefined;
  });

  afterEach(async () => {
    console.log = originalLog;
    console.warn = originalWarn;
    process.exitCode = originalExitCode;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeConfig(toml: string): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(path.join(tmpDir, ".agents", "agentsync.toml"), toml);
  }

  function parseCliResult(): Record<string, unknown> {
    const jsonLine = consoleOutput.find((line) => {
      try {
        const p = JSON.parse(line);
        return p.version === "1.0";
      } catch {
        return false;
      }
    });
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    CliResultSchema.parse(parsed);
    return parsed;
  }

  describe("(a) zero tools, no foreign keys", () => {
    it("--json: status=error with an actionable warning, exit code 2", async () => {
      await writeConfig("tools = []\n");

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("error");
      const warnings = output.warnings as string[];
      expect(warnings).toBeDefined();
      expect(warnings.length).toBeGreaterThan(0);
      const combined = warnings.join(" ");
      expect(combined).toContain("No tools configured");
      expect(combined).toContain("tools = [...]");
      expect(combined).toContain("--tool");
      expect(combined).not.toContain("dallay/Rust");

      expect(process.exitCode).toBe(2);
    });

    it("human mode: prints the same actionable warning and sets exit code 2", async () => {
      await writeConfig("tools = []\n");

      await sync({ cwd: tmpDir });

      const combined = warnOutput.join(" ");
      expect(combined).toContain("No tools configured");
      expect(combined).toContain("tools = [...]");
      expect(process.exitCode).toBe(2);
    });

    it("--dry-run --json: also flags zero tools (not treated as a clean preview)", async () => {
      await writeConfig("tools = []\n");

      await sync({ cwd: tmpDir, dryRun: true, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("error");
      const warnings = output.warnings as string[];
      expect(warnings.some((w) => w.includes("No tools configured"))).toBe(
        true,
      );
      expect(process.exitCode).toBe(2);
    });
  });

  describe("(b) zero tools, foreign (dallay) keys present", () => {
    // A config without `tools` that has `default_agents` or `[agents.*]` is
    // explicitly classified as the dallay/Rust format. Non-empty selectors
    // can resolve tools; empty or disabled selectors still reach this
    // actionable zero-tools warning.

    it("gives read-only foreign recovery for an empty default_agents selector", async () => {
      await writeConfig(
        "default_agents = []\n\n" +
          "[mcp_servers.example]\n" +
          'command = "npx"\n' +
          'args = ["-y", "example-server"]\n',
      );

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("error");
      const warnings = output.warnings as string[];
      const combined = warnings.join(" ");
      expect(combined).toContain("default_agents");
      expect(combined).toContain("Read-only dallay/Rust config");
      expect(combined).toContain("selected no supported tools");
      expect(combined).toContain("will not rewrite the foreign config");
      expect(combined).not.toContain("agentsync config add");
    });

    it("names agents (map form) when present but all entries are disabled", async () => {
      await writeConfig(
        "[agents.claude]\n" +
          "enabled = false\n" +
          'description = "disabled"\n',
      );

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("error");
      const warnings = (output.warnings as string[]).join(" ");
      expect(warnings).toContain("[agents.<id>]");
    });

    it("reads a standalone foreign default_agents selector", async () => {
      await writeConfig('default_agents = ["claude"]\n');

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("success");
      expect(output.warnings).toBeUndefined();
      const data = output.data as Record<string, unknown>;
      expect(data.tools).toEqual(["claude"]);
    });
  });

  describe("(c) normal config with tools -- regression guard", () => {
    it("no warning and status=success when tools resolve normally", async () => {
      await writeConfig('tools = ["claude"]\n');

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("success");
      expect(output.warnings).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });

    it("rejects a current tools config mixed with a foreign selector", async () => {
      await writeConfig('tools = ["claude"]\ndefault_agents = ["cursor"]\n');

      await sync({ cwd: tmpDir, json: true, pretty: true });

      const output = parseCliResult();
      expect(output.status).toBe("error");
      expect(output.errors).toEqual([
        expect.objectContaining({ code: "CONFIG_ERROR" }),
      ]);
      expect(process.exitCode).toBe(2);
    });
  });
});
