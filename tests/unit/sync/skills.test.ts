import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Skills Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-skills-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies skills to tool directories", async () => {
    // Create a skill
    const skillDir = path.join(tmpDir, ".agents", "skills", "code-review");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\n---\n# Code Review",
    );

    const providers = [getToolProvider("claude"), getToolProvider("cursor")];
    const results = await syncSkills(providers, tmpDir);

    expect(results).toHaveLength(2);

    // Check Claude output
    const claudeSkill = path.join(
      tmpDir,
      ".claude",
      "skills",
      "code-review",
      "SKILL.md",
    );
    expect(await pathExists(claudeSkill)).toBe(true);
    const content = await readFile(claudeSkill, "utf-8");
    expect(content).toContain("# Code Review");

    // Check Cursor output
    const cursorSkill = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "code-review",
      "SKILL.md",
    );
    expect(await pathExists(cursorSkill)).toBe(true);
  });

  it("handles empty skills directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].skillCount).toBe(0);
  });

  it("copies skills with namespace prefix for presets", async () => {
    // Create a preset skills directory
    const presetDir = path.join(tmpDir, "preset-skills", "tdd");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "SKILL.md"), "# TDD Skill");

    const presetSkills = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(1);
    expect(results[0].skills).toContain("company--tdd");

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "company--tdd",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
  });

  it("skips tools without skills support", async () => {
    // Codex reads from .agents/skills/ shared directory, not its own
    // But it still has a skillsDir configured
    const skillDir = path.join(tmpDir, ".agents", "skills", "test");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

    const providers = [getToolProvider("codex")];
    const results = await syncSkills(providers, tmpDir);

    // Codex points to .agents/skills which is the shared dir
    expect(results).toHaveLength(1);
  });
});
