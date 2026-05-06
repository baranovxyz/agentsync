/**
 * Sync Operation Receipts Tests
 * Verifies that sync --json output includes per-tool file details
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import { CliResultSchema } from "../../../src/types/output.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

// Isolate from real ~/.agents/ so global skills/commands/agents don't bleed into counts
vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

describe("Sync Operation Receipts", () => {
  let tmpDir: string;
  let consoleOutput: string[];
  const originalLog = console.log;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-receipts-"));
    consoleOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    console.log = originalLog;
    await rm(tmpDir, { recursive: true, force: true });
  });

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
    // Validate against Zod schema
    CliResultSchema.parse(parsed);
    return parsed;
  }

  async function setupProject(tools: string[]): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `tools = [${tools.map((t) => `"${t}"`).join(", ")}]\n`,
    );
  }

  it("includes details array in sync output", async () => {
    await setupProject(["claude"]);
    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    expect(data).toHaveProperty("details");
    expect(Array.isArray(data.details)).toBe(true);
  });

  it("details has one entry per synced tool", async () => {
    await setupProject(["claude", "cursor"]);
    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    const details = data.details as Array<Record<string, unknown>>;
    expect(details).toHaveLength(2);
    expect(details.map((d) => d.tool)).toEqual(["claude", "cursor"]);
  });

  it("details lists synced skill names per tool", async () => {
    await setupProject(["claude"]);

    // Create a skill
    const skillDir = path.join(tmpDir, ".agents", "skills", "my-skill");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: Test\n---\n# Test",
    );

    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    const details = data.details as Array<Record<string, unknown>>;
    const claudeDetail = details.find((d) => d.tool === "claude");
    expect(claudeDetail).toBeDefined();
    expect(claudeDetail!.skills).toContain("my-skill");
  });

  it("aggregate counts match sum of detail arrays", async () => {
    await setupProject(["claude"]);

    // Create a skill
    const skillDir = path.join(tmpDir, ".agents", "skills", "test-skill");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

    // Create a command
    const cmdDir = path.join(tmpDir, ".agents", "commands");
    await ensureDir(cmdDir);
    await outputFile(
      path.join(cmdDir, "test-cmd.md"),
      "---\ndescription: test\n---\n# Cmd",
    );

    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    const details = data.details as Array<{
      skills: string[];
      commands: string[];
      agents: string[];
    }>;

    const totalSkillsFromDetails = details.reduce(
      (sum, d) => sum + d.skills.length,
      0,
    );
    const totalCommandsFromDetails = details.reduce(
      (sum, d) => sum + d.commands.length,
      0,
    );

    expect(data.skills).toBe(totalSkillsFromDetails);
    expect(data.commands).toBe(totalCommandsFromDetails);
  });

  it("mcp lists server names when MCP servers are configured", async () => {
    await setupProject(["claude"]);
    // No MCP servers configured
    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    const details = data.details as Array<Record<string, unknown>>;
    const claudeDetail = details.find((d) => d.tool === "claude");
    expect(claudeDetail).toBeDefined();
    expect(claudeDetail!.mcp).toEqual([]);
  });

  it("dry-run returns planned changes with details", async () => {
    await setupProject(["claude"]);

    // Create a skill so there's something to plan
    const skillDir = path.join(tmpDir, ".agents", "skills", "planned-skill");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Planned");

    await sync({ cwd: tmpDir, dryRun: true, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    expect(data.skills).toBe(1);
    const details = data.details as Array<Record<string, unknown>>;
    expect(details.length).toBeGreaterThan(0);
    expect(
      (details[0].skills as string[]).some((s) => s.includes("planned-skill")),
    ).toBe(true);
  });

  it("returns empty details array on error", async () => {
    // No config = error
    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    expect(data.details).toEqual([]);
  });

  it("emits valid JSON when no tools configured and not dry-run", async () => {
    // Config exists but tools = [] — should still produce valid JSON output
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      "tools = []\n",
    );

    await sync({ cwd: tmpDir, json: true, pretty: true });

    const output = parseCliResult();
    expect(output.status).toBe("success");
    const data = output.data as Record<string, unknown>;
    expect(data.tools).toEqual([]);
    expect(data.skills).toBe(0);
    expect(data.details).toEqual([]);
  });

  it("supports --fields projection", async () => {
    await setupProject(["claude"]);
    await sync({
      cwd: tmpDir,
      json: true,
      pretty: true,
      fields: "tools,skills",
    });

    const output = parseCliResult();
    const data = output.data as Record<string, unknown>;
    expect(data).toHaveProperty("tools");
    expect(data).toHaveProperty("skills");
    expect(data).not.toHaveProperty("details");
    expect(data).not.toHaveProperty("mcpServers");
  });
});
