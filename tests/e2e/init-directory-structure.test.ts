/**
 * Init Directory Structure E2E Test
 * Tests that after init-like setup, the correct directory structure exists:
 * .agents/skills/, commands/, agents/, backups/.
 * Tests agentsync.toml creation with default tools.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTomlConfig } from "../../src/config/toml-loader.js";
import type { ToolName } from "../../src/constants.js";
import { ensureProjectConfig } from "../../src/utils/config-creation.js";
import { ensureDir, pathExists } from "../../src/utils/fs.js";

describe("Init Directory Structure E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-init-structure-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Simulate the directory creation from init command
   * Creates .agents/ with skills/, commands/, agents/, backups/
   */
  async function simulateInit(tools: ToolName[]): Promise<void> {
    const agentsDir = path.join(tmpDir, ".agents");
    const dirs = [
      agentsDir,
      path.join(agentsDir, "skills"),
      path.join(agentsDir, "commands"),
      path.join(agentsDir, "agents"),
      path.join(agentsDir, "backups"),
    ];

    for (const dir of dirs) {
      await ensureDir(dir);
    }

    await ensureProjectConfig(tmpDir, { tools });
  }

  it("creates .agents/ root directory", async () => {
    await simulateInit(["claude", "cursor"]);

    expect(await pathExists(path.join(tmpDir, ".agents"))).toBe(true);
  });

  it("creates skills/ subdirectory", async () => {
    await simulateInit(["claude"]);

    expect(await pathExists(path.join(tmpDir, ".agents", "skills"))).toBe(true);
  });

  it("creates commands/ subdirectory", async () => {
    await simulateInit(["claude"]);

    expect(await pathExists(path.join(tmpDir, ".agents", "commands"))).toBe(
      true,
    );
  });

  it("creates agents/ subdirectory", async () => {
    await simulateInit(["claude"]);

    expect(await pathExists(path.join(tmpDir, ".agents", "agents"))).toBe(true);
  });

  it("creates backups/ subdirectory", async () => {
    await simulateInit(["claude"]);

    expect(await pathExists(path.join(tmpDir, ".agents", "backups"))).toBe(
      true,
    );
  });

  it("creates agentsync.toml with specified tools", async () => {
    const tools: ToolName[] = ["claude", "cursor", "gemini"];
    await simulateInit(tools);

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    expect(await pathExists(configPath)).toBe(true);

    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(tools);
  });

  it("creates agentsync.toml with default tools when none specified", async () => {
    await ensureProjectConfig(tmpDir);

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    expect(await pathExists(configPath)).toBe(true);

    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(["claude", "opencode", "codex"]);
  });

  it("agentsync.toml contains tools array", async () => {
    await simulateInit(["claude"]);

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(["claude"]);
  });

  it("creates all expected directories in one init", async () => {
    const allTools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    await simulateInit(allTools);

    const expectedDirs = [
      ".agents",
      ".agents/skills",
      ".agents/commands",
      ".agents/agents",
      ".agents/backups",
    ];

    for (const dir of expectedDirs) {
      expect(
        await pathExists(path.join(tmpDir, dir)),
        `${dir} should exist`,
      ).toBe(true);
    }

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(allTools);
  });
});
