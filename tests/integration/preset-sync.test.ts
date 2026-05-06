/**
 * Preset Sync Integration Tests
 * Verifies that preset skills, commands, and agents are wired into the sync pipeline.
 * Tests namespace isolation, coexistence with project content, and error handling.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../src/sync/agents.js";
import { syncCommands } from "../../src/sync/commands.js";
import { syncSkills } from "../../src/sync/skills.js";
import { getToolProviders } from "../../src/tools/index.js";
import { pathExists } from "../../src/utils/fs.js";
import {
  createTestProject,
  type TestProject,
} from "../helpers/create-project.js";
import { SIMPLE_SKILL } from "../helpers/fixtures.js";

/** Absolute path to the static preset fixtures */
const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "__fixtures__",
  "presets",
);
const VALID_FULL = path.join(FIXTURES_DIR, "valid-full");
const VALID_OVERLAPPING = path.join(FIXTURES_DIR, "valid-overlapping");

describe("Preset sync integration", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["claude"]);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("syncs preset skills to holdout tool with namespace prefix", async () => {
    const providers = getToolProviders(["claude"]);
    const presetSkills = new Map<string, string[]>([
      ["test-preset", [path.join(VALID_FULL, "skills")]],
    ]);

    const results = await syncSkills(providers, project.dir, presetSkills);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult!.skillCount).toBeGreaterThanOrEqual(1);
    expect(claudeResult!.skills).toContain("test-preset--tdd");

    // Verify the file exists on disk at the expected namespaced path
    const skillPath = path.join(
      project.dir,
      ".claude",
      "skills",
      "test-preset--tdd",
      "SKILL.md",
    );
    expect(await pathExists(skillPath)).toBe(true);

    // Verify the content includes the original skill text
    const content = await readFile(skillPath, "utf-8");
    expect(content).toContain("TDD Skill");
    expect(content).toContain("test-preset--tdd");
  });

  it("syncs preset commands to holdout tool with namespace prefix", async () => {
    const providers = getToolProviders(["claude"]);
    const presetCommands = new Map<string, string[]>([
      ["test-preset", [path.join(VALID_FULL, "commands")]],
    ]);

    const results = await syncCommands(providers, project.dir, presetCommands);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult!.commandCount).toBeGreaterThanOrEqual(1);
    expect(claudeResult!.commands).toContain(
      path.join("test-preset", "commit.md"),
    );

    // Verify the file exists on disk
    const commandPath = path.join(
      project.dir,
      ".claude",
      "commands",
      "test-preset",
      "commit.md",
    );
    expect(await pathExists(commandPath)).toBe(true);

    const content = await readFile(commandPath, "utf-8");
    expect(content).toContain("Commit Command");
  });

  it("syncs preset agents to holdout tool with namespace prefix", async () => {
    const providers = getToolProviders(["claude"]);
    const presetAgents = new Map<string, string[]>([
      ["test-preset", [path.join(VALID_FULL, "agents")]],
    ]);

    const results = await syncAgents(providers, project.dir, presetAgents);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult!.agentCount).toBeGreaterThanOrEqual(1);
    expect(claudeResult!.agents).toContain(
      path.join("test-preset", "reviewer.md"),
    );

    // Verify the file exists on disk
    const agentPath = path.join(
      project.dir,
      ".claude",
      "agents",
      "test-preset",
      "reviewer.md",
    );
    expect(await pathExists(agentPath)).toBe(true);

    const content = await readFile(agentPath, "utf-8");
    expect(content).toContain("Reviewer Agent");
  });

  it("multiple presets coexist with namespace isolation", async () => {
    const providers = getToolProviders(["claude"]);
    const presetSkills = new Map<string, string[]>([
      ["preset-a", [path.join(VALID_FULL, "skills")]],
      ["preset-b", [path.join(VALID_OVERLAPPING, "skills")]],
    ]);

    const results = await syncSkills(providers, project.dir, presetSkills);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult!.skills).toContain("preset-a--tdd");
    expect(claudeResult!.skills).toContain("preset-b--tdd");

    // Both files exist on disk
    const pathA = path.join(
      project.dir,
      ".claude",
      "skills",
      "preset-a--tdd",
      "SKILL.md",
    );
    const pathB = path.join(
      project.dir,
      ".claude",
      "skills",
      "preset-b--tdd",
      "SKILL.md",
    );
    expect(await pathExists(pathA)).toBe(true);
    expect(await pathExists(pathB)).toBe(true);

    // Content is different (namespace isolation = no clobbering)
    const contentA = await readFile(pathA, "utf-8");
    const contentB = await readFile(pathB, "utf-8");
    expect(contentA).toContain("Red-green-refactor");
    expect(contentB).toContain("Different Version");
  });

  it("preset skills coexist with project custom skills", async () => {
    // Add a local project skill
    await project.addSkill("local-lint", SIMPLE_SKILL);

    const providers = getToolProviders(["claude"]);
    const presetSkills = new Map<string, string[]>([
      ["test-preset", [path.join(VALID_FULL, "skills")]],
    ]);

    const results = await syncSkills(providers, project.dir, presetSkills);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();

    // Both project and preset skills exist
    expect(claudeResult!.skills).toContain("local-lint");
    expect(claudeResult!.skills).toContain("test-preset--tdd");
    expect(claudeResult!.skillCount).toBeGreaterThanOrEqual(2);

    // Both files on disk
    const localPath = path.join(
      project.dir,
      ".claude",
      "skills",
      "local-lint",
      "SKILL.md",
    );
    const presetPath = path.join(
      project.dir,
      ".claude",
      "skills",
      "test-preset--tdd",
      "SKILL.md",
    );
    expect(await pathExists(localPath)).toBe(true);
    expect(await pathExists(presetPath)).toBe(true);
  });

  it("gracefully handles preset with missing skills dir", async () => {
    const providers = getToolProviders(["claude"]);
    const presetSkills = new Map<string, string[]>([
      ["ghost-preset", ["/tmp/nonexistent-preset-dir-12345/skills"]],
    ]);

    // Should not throw
    const results = await syncSkills(providers, project.dir, presetSkills);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    // No skills synced from the missing dir
    expect(claudeResult!.skillCount).toBe(0);
  });
});
