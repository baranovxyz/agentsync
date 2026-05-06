import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../src/sync/agents.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Agents Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-agents-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies agents to Claude agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\nname: reviewer\n---\n# Code Reviewer Agent",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].agentCount).toBe(1);

    const agentFile = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(await pathExists(agentFile)).toBe(true);
    const content = await readFile(agentFile, "utf-8");
    expect(content).toContain("# Code Reviewer Agent");
  });

  it("copies agents to Copilot agents directory with .agent.md extension", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "tester.md"), "# Test Agent");

    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".github", "agents", "tester.agent.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("copies agents to OpenCode agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "planner.md"), "# Planner");

    const providers = [getToolProvider("opencode")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".opencode", "agents", "planner.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("skips tools that do not support agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "test.md"), "# Agent");

    // Cursor, RooCode, Codex, Gemini don't support agents
    const providers = [
      getToolProvider("cursor"),
      getToolProvider("roocode"),
      getToolProvider("codex"),
      getToolProvider("gemini"),
    ];
    const results = await syncAgents(providers, tmpDir);

    for (const result of results) {
      expect(result.agentCount).toBe(0);
    }
  });

  it("handles multiple agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "reviewer.md"), "# Reviewer");
    await outputFile(path.join(agentsDir, "tester.md"), "# Tester");
    await outputFile(path.join(agentsDir, "planner.md"), "# Planner");

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(3);
  });

  it("copies agents with namespace prefix for presets", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "auditor.md"), "# Auditor");

    const presetAgents = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir, presetAgents);

    expect(results[0].agentCount).toBe(1);
    expect(results[0].agents).toContain(path.join("company", "auditor.md"));
  });

  it("handles empty agents directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(0);
  });
});
