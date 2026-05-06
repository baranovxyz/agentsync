/**
 * Skills Subdirectory Files Tests
 * Verifies that skill directories with additional files (scripts, references, assets)
 * alongside SKILL.md are correctly copied to tool outputs
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider, getToolProviders } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Skills Subdirectory Files", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-skill-files-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies SKILL.md and extra files in the skill directory", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "code-review");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Code Review Skill");
    await outputFile(
      path.join(skillDir, "checklist.md"),
      "# Review Checklist\n- Check types\n- Check tests",
    );
    await outputFile(
      path.join(skillDir, "template.txt"),
      "Review template content",
    );

    const providers = [getToolProvider("claude")];
    await syncSkills(providers, tmpDir);

    const base = path.join(tmpDir, ".claude", "skills", "code-review");
    expect(await pathExists(path.join(base, "SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(base, "checklist.md"))).toBe(true);
    expect(await pathExists(path.join(base, "template.txt"))).toBe(true);

    const checklist = await readFile(path.join(base, "checklist.md"), "utf-8");
    expect(checklist).toContain("Check types");
  });

  it("copies script files alongside SKILL.md", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "deploy");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Deploy");
    await outputFile(
      path.join(skillDir, "deploy.sh"),
      "#!/bin/bash\necho 'deploying'",
    );
    await outputFile(
      path.join(skillDir, "rollback.sh"),
      "#!/bin/bash\necho 'rolling back'",
    );

    const providers = [getToolProvider("cursor")];
    await syncSkills(providers, tmpDir);

    const base = path.join(tmpDir, ".cursor", "skills", "deploy");
    expect(await pathExists(path.join(base, "deploy.sh"))).toBe(true);
    expect(await pathExists(path.join(base, "rollback.sh"))).toBe(true);

    const deployScript = await readFile(path.join(base, "deploy.sh"), "utf-8");
    expect(deployScript).toContain("deploying");
  });

  it("copies JSON config files alongside SKILL.md", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "lint");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Lint Skill");
    await outputFile(
      path.join(skillDir, "config.json"),
      JSON.stringify({ rules: { semi: "error" } }, null, 2),
    );

    // Use cursor (holdout tool, readsAgentsDir=false) instead of roocode (native)
    const providers = [getToolProvider("cursor")];
    await syncSkills(providers, tmpDir);

    const configPath = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "lint",
      "config.json",
    );
    expect(await pathExists(configPath)).toBe(true);

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.rules.semi).toBe("error");
  });

  it("extra files are copied to holdout tool directories", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "test-skill");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test Skill");
    await outputFile(path.join(skillDir, "reference.md"), "# Reference Doc");

    // Only holdout tools (readsAgentsDir=false) get copies
    const providers = getToolProviders(["claude", "cursor"]);
    await syncSkills(providers, tmpDir);

    const holdoutDirs = [".claude/skills", ".cursor/skills"];
    for (const dir of holdoutDirs) {
      expect(
        await pathExists(path.join(tmpDir, dir, "test-skill", "reference.md")),
      ).toBe(true);
    }
  });

  it("extra files in preset skills are copied with namespace", async () => {
    const presetDir = path.join(tmpDir, "preset", "analysis");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "SKILL.md"), "# Analysis Skill");
    await outputFile(
      path.join(presetDir, "patterns.txt"),
      "Pattern 1\nPattern 2",
    );

    const presetSkills = new Map([["company", [path.join(tmpDir, "preset")]]]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skills).toContain("company--analysis");

    const base = path.join(tmpDir, ".claude", "skills", "company--analysis");
    expect(await pathExists(path.join(base, "SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(base, "patterns.txt"))).toBe(true);
  });

  it("multiple skills each with different extra files", async () => {
    // Skill 1 with .sh files
    const skill1 = path.join(tmpDir, ".agents", "skills", "build");
    await ensureDir(skill1);
    await outputFile(path.join(skill1, "SKILL.md"), "# Build");
    await outputFile(path.join(skill1, "build.sh"), "#!/bin/bash");

    // Skill 2 with .json files
    const skill2 = path.join(tmpDir, ".agents", "skills", "config");
    await ensureDir(skill2);
    await outputFile(path.join(skill2, "SKILL.md"), "# Config");
    await outputFile(path.join(skill2, "defaults.json"), '{"key": "value"}');

    const providers = [getToolProvider("claude")];
    await syncSkills(providers, tmpDir);

    // Build skill
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "build", "build.sh"),
      ),
    ).toBe(true);
    // Config skill
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "config", "defaults.json"),
      ),
    ).toBe(true);

    // Cross-check: build doesn't have config's files
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "build", "defaults.json"),
      ),
    ).toBe(false);
  });

  it("skill directory without extra files still copies only SKILL.md", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "simple");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Simple skill");

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results[0].skillCount).toBe(1);
    const base = path.join(tmpDir, ".claude", "skills", "simple");
    expect(await pathExists(path.join(base, "SKILL.md"))).toBe(true);
  });

  it("copies files in subdirectories of a skill (e.g. references/)", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "agent-first-cli");
    await ensureDir(path.join(skillDir, "references"));
    await outputFile(path.join(skillDir, "SKILL.md"), "# Agent-first CLI");
    await outputFile(
      path.join(skillDir, "references", "cli-patterns.md"),
      "# CLI Patterns",
    );
    await outputFile(
      path.join(skillDir, "references", "examples.md"),
      "# Examples",
    );

    const providers = [getToolProvider("claude")];
    await syncSkills(providers, tmpDir);

    const base = path.join(tmpDir, ".claude", "skills", "agent-first-cli");
    expect(await pathExists(path.join(base, "SKILL.md"))).toBe(true);
    expect(
      await pathExists(path.join(base, "references", "cli-patterns.md")),
    ).toBe(true);
    expect(await pathExists(path.join(base, "references", "examples.md"))).toBe(
      true,
    );
  });

  it("copies nested subdirectory files in preset skills", async () => {
    const presetDir = path.join(tmpDir, "preset", "tdd");
    await ensureDir(path.join(presetDir, "references"));
    await outputFile(path.join(presetDir, "SKILL.md"), "# TDD Skill");
    await outputFile(
      path.join(presetDir, "references", "patterns.md"),
      "# TDD Patterns",
    );

    const presetSkills = new Map([["company", [path.join(tmpDir, "preset")]]]);
    const providers = [getToolProvider("claude")];
    await syncSkills(providers, tmpDir, presetSkills);

    const base = path.join(tmpDir, ".claude", "skills", "company--tdd");
    expect(await pathExists(path.join(base, "references", "patterns.md"))).toBe(
      true,
    );
  });
});
