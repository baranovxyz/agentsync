/**
 * Copilot Agents Sync E2E Test
 * Tests that Copilot agents go to .github/agents/ with correct content,
 * .agent.md extension handling, and namespace prefixing from presets.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../src/sync/agents.js";
import { generateHeader } from "../../src/sync/header.js";
import { getToolProvider } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

describe("Copilot Agents Sync E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-copilot-agents-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("syncs agents to .github/agents/ directory with .agent.md extension", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Code review agent\n---\n\n# Reviewer\n\nReview code changes.",
    );

    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].agentCount).toBe(1);

    const agentPath = path.join(
      tmpDir,
      ".github",
      "agents",
      "reviewer.agent.md",
    );
    expect(await pathExists(agentPath)).toBe(true);
  });

  it("preserves agent content through sync", async () => {
    const agentContent =
      "---\nname: deployer\ndescription: Deploy automation agent\n---\n\n# Deployer\n\nHandles CI/CD deployment pipelines.";
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "deployer.md"),
      agentContent,
    );

    const providers = [getToolProvider("copilot")];
    await syncAgents(providers, tmpDir);

    const outputPath = path.join(
      tmpDir,
      ".github",
      "agents",
      "deployer.agent.md",
    );
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/agents/deployer.md");
    expect(written).toBe(header + agentContent);
  });

  it("syncs multiple agents to Copilot with .agent.md extension", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      "# Reviewer Agent",
    );
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "deployer.md"),
      "# Deployer Agent",
    );
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "tester.md"),
      "# Tester Agent",
    );

    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(3);
    expect(
      await pathExists(
        path.join(tmpDir, ".github", "agents", "reviewer.agent.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".github", "agents", "deployer.agent.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".github", "agents", "tester.agent.md"),
      ),
    ).toBe(true);
  });

  it("applies namespace prefix for preset agents with .agent.md extension", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(
      path.join(presetDir, "qa-bot.md"),
      "# QA Bot\n\nAutomated QA agent.",
    );

    const presetAgents = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir, presetAgents);

    expect(results[0].agentCount).toBe(1);
    expect(results[0].agents).toContain(
      path.join("company", "qa-bot.agent.md"),
    );

    const namespacedPath = path.join(
      tmpDir,
      ".github",
      "agents",
      "company",
      "qa-bot.agent.md",
    );
    expect(await pathExists(namespacedPath)).toBe(true);
  });

  it("handles both project and preset agents simultaneously", async () => {
    // Project agent
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "local-bot.md"),
      "# Local Bot",
    );

    // Preset agent
    const presetDir = path.join(tmpDir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "shared-bot.md"), "# Shared Bot");

    const presetAgents = new Map([["team", [presetDir]]]);
    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir, presetAgents);

    expect(results[0].agentCount).toBe(2);
    expect(
      await pathExists(
        path.join(tmpDir, ".github", "agents", "local-bot.agent.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".github", "agents", "team", "shared-bot.agent.md"),
      ),
    ).toBe(true);
  });

  it("returns empty result when no agents exist", async () => {
    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].agentCount).toBe(0);
    expect(results[0].agents).toEqual([]);
  });

  it("creates .github/agents/ parent directories automatically", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "test.md"),
      "# Test Agent",
    );

    // Confirm .github doesn't exist yet
    expect(await pathExists(path.join(tmpDir, ".github"))).toBe(false);

    const providers = [getToolProvider("copilot")];
    await syncAgents(providers, tmpDir);

    expect(await pathExists(path.join(tmpDir, ".github", "agents"))).toBe(true);
    expect(
      await pathExists(path.join(tmpDir, ".github", "agents", "test.agent.md")),
    ).toBe(true);
  });
});
