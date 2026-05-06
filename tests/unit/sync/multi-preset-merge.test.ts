/**
 * Multi-Preset Merge Test
 * Tests 3 presets merging skills + commands with namespace isolation,
 * verifies no collision, and tests preset + project skill coexistence.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands } from "../../../src/sync/commands.js";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Multi-Preset Merge", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-multi-preset-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function createPresetSkill(
    baseDir: string,
    skillName: string,
    content: string,
  ): Promise<void> {
    const skillDir = path.join(baseDir, skillName);
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), content);
  }

  async function createPresetCommand(
    baseDir: string,
    commandName: string,
    content: string,
  ): Promise<void> {
    await ensureDir(baseDir);
    await outputFile(path.join(baseDir, `${commandName}.md`), content);
  }

  it("merges skills from 3 presets with namespace isolation", async () => {
    // Preset 1: company
    const companyDir = path.join(tmpDir, "presets", "company-skills");
    await createPresetSkill(companyDir, "typescript", "# Company TS Skill");

    // Preset 2: team
    const teamDir = path.join(tmpDir, "presets", "team-skills");
    await createPresetSkill(teamDir, "react", "# Team React Skill");

    // Preset 3: org
    const orgDir = path.join(tmpDir, "presets", "org-skills");
    await createPresetSkill(orgDir, "security", "# Org Security Skill");

    const presetSkills = new Map([
      ["company", [companyDir]],
      ["team", [teamDir]],
      ["org", [orgDir]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(3);
    expect(results[0].skills).toContain("company--typescript");
    expect(results[0].skills).toContain("team--react");
    expect(results[0].skills).toContain("org--security");
  });

  it("no collision between presets with same skill names but different namespaces", async () => {
    // Both presets have a skill called "review"
    const preset1Dir = path.join(tmpDir, "presets", "alpha-skills");
    await createPresetSkill(preset1Dir, "review", "# Alpha Review");

    const preset2Dir = path.join(tmpDir, "presets", "beta-skills");
    await createPresetSkill(preset2Dir, "review", "# Beta Review");

    const presetSkills = new Map([
      ["alpha", [preset1Dir]],
      ["beta", [preset2Dir]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(2);

    // Both should exist in separate flat namespace directories
    const alphaSkill = path.join(
      tmpDir,
      ".claude",
      "skills",
      "alpha--review",
      "SKILL.md",
    );
    const betaSkill = path.join(
      tmpDir,
      ".claude",
      "skills",
      "beta--review",
      "SKILL.md",
    );
    expect(await pathExists(alphaSkill)).toBe(true);
    expect(await pathExists(betaSkill)).toBe(true);

    const alphaContent = await readFile(alphaSkill, "utf-8");
    const betaContent = await readFile(betaSkill, "utf-8");
    expect(alphaContent).toContain("Alpha Review");
    expect(betaContent).toContain("Beta Review");
  });

  it("project skills coexist with preset skills (no namespace)", async () => {
    // Project skill (no namespace) — syncSkills reads from .agents/skills/
    const projectSkillDir = path.join(
      tmpDir,
      ".agents",
      "skills",
      "local-review",
    );
    await ensureDir(projectSkillDir);
    await outputFile(
      path.join(projectSkillDir, "SKILL.md"),
      "# Local Project Review",
    );

    // Preset skill
    const presetDir = path.join(tmpDir, "presets", "company-skills");
    await createPresetSkill(presetDir, "org-review", "# Org Review");

    const presetSkills = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(2);

    // Project skill has no namespace prefix
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "local-review", "SKILL.md"),
      ),
    ).toBe(true);
    // Preset skill has flat namespace prefix
    expect(
      await pathExists(
        path.join(
          tmpDir,
          ".claude",
          "skills",
          "company--org-review",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
  });

  it("merges commands from 3 presets with namespace isolation", async () => {
    const companyDir = path.join(tmpDir, "presets", "company-cmds");
    await createPresetCommand(companyDir, "deploy", "# Deploy Command");

    const teamDir = path.join(tmpDir, "presets", "team-cmds");
    await createPresetCommand(teamDir, "test", "# Test Command");

    const orgDir = path.join(tmpDir, "presets", "org-cmds");
    await createPresetCommand(orgDir, "lint", "# Lint Command");

    const presetCommands = new Map([
      ["company", [companyDir]],
      ["team", [teamDir]],
      ["org", [orgDir]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir, presetCommands);

    expect(results[0].commandCount).toBe(3);
    expect(results[0].commands).toContain(path.join("company", "deploy.md"));
    expect(results[0].commands).toContain(path.join("team", "test.md"));
    expect(results[0].commands).toContain(path.join("org", "lint.md"));
  });

  it("project commands and preset commands coexist", async () => {
    // Project command
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      "---\ndescription: Local commit\n---\n\n# Commit",
    );

    // Preset command
    const presetDir = path.join(tmpDir, "presets", "company-cmds");
    await createPresetCommand(presetDir, "commit", "# Company Commit");

    const presetCommands = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir, presetCommands);

    expect(results[0].commandCount).toBe(2);

    // Both files exist at different paths
    expect(
      await pathExists(path.join(tmpDir, ".claude", "commands", "commit.md")),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "commands", "company", "commit.md"),
      ),
    ).toBe(true);
  });

  it("all preset content goes to correct holdout tool directories", async () => {
    const presetDir = path.join(tmpDir, "presets", "org-skills");
    await createPresetSkill(presetDir, "testing", "# Testing Skill");

    const presetSkills = new Map([["org", [presetDir]]]);
    const providers = [
      getToolProvider("claude"),
      getToolProvider("cursor"),
      getToolProvider("roocode"),
    ];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results).toHaveLength(3);

    // Holdout tools (claude, cursor) get namespaced skill with flat separator
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "org--testing", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "org--testing", "SKILL.md"),
      ),
    ).toBe(true);

    // RooCode (readsAgentsDir=true) skips skill copy
    const roocodeResult = results.find((r) => r.tool === "roocode");
    expect(roocodeResult?.skillCount).toBe(0);
  });

  it("handles empty preset directories gracefully", async () => {
    const emptyDir = path.join(tmpDir, "presets", "empty");
    await ensureDir(emptyDir);

    const presetSkills = new Map([["empty", [emptyDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(0);
  });
});
