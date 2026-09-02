import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { previewSkills, syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { splitFrontmatter } from "../../../src/utils/frontmatter.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Skills Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-skills-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies for holdouts and leaves native readers in place", async () => {
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

    expect(results[1]).toMatchObject({
      tool: "cursor",
      skillCount: 0,
      skills: [],
    });
    expect(await pathExists(path.join(tmpDir, ".cursor", "skills"))).toBe(
      false,
    );
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

  it("refuses to write a generated skill through an escaping root symlink", async () => {
    const externalDir = await mkdtemp(
      path.join(tmpdir(), "agentsync-skills-external-"),
    );
    try {
      await outputFile(
        path.join(tmpDir, ".agents", "skills", "review", "SKILL.md"),
        "# Review",
      );
      await ensureDir(path.join(tmpDir, ".claude"));
      await symlink(externalDir, path.join(tmpDir, ".claude", "skills"));

      await expect(
        syncSkills([getToolProvider("claude")], tmpDir),
      ).rejects.toThrow(/outside the project/);

      expect(await pathExists(path.join(externalDir, "review"))).toBe(false);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it("synthesizes valid CRLF frontmatter for bare preset skills", async () => {
    const presetRoot = path.join(tmpDir, "preset-skills");
    await outputFile(
      path.join(presetRoot, "review", "SKILL.md"),
      "# Review\r\nUse the checklist.\r\n",
    );
    const presets = new Map([["company", [presetRoot]]]);
    const providers = [getToolProvider("codex"), getToolProvider("cursor")];

    const preview = await previewSkills(providers, tmpDir, presets);
    const results = await syncSkills(providers, tmpDir, presets);

    expect(results).toEqual(preview);
    for (const root of [".codex", ".cursor"]) {
      const content = await readFile(
        path.join(tmpDir, root, "skills", "company--review", "SKILL.md"),
        "utf-8",
      );
      const parsed = splitFrontmatter(content);
      expect(parsed.eol).toBe("\r\n");
      expect(parsed.fm).toMatchObject({
        name: "company--review",
        description: "Imported preset skill company--review",
      });
      expect(content).toContain("# Review\r\nUse the checklist.");
    }
  });

  it("parses quoted names and multiline descriptions without regex rewrites", async () => {
    const presetRoot = path.join(tmpDir, "preset-skills");
    await outputFile(
      path.join(presetRoot, "review", "SKILL.md"),
      [
        "---",
        'name: "review: quoted"',
        "description: |-",
        "  Review quoted YAML safely.",
        "  Keep this second line.",
        'note: "name: is data here"',
        "---",
        "# Review",
      ].join("\r\n"),
    );
    const presets = new Map([["company", [presetRoot]]]);

    const [result] = await syncSkills(
      [getToolProvider("codex")],
      tmpDir,
      presets,
    );
    const content = await readFile(
      path.join(tmpDir, ".codex", "skills", "company--review", "SKILL.md"),
      "utf-8",
    );
    const parsed = splitFrontmatter(content);

    expect(result.skills).toEqual(["company--review"]);
    expect(parsed.eol).toBe("\r\n");
    expect(parsed.fm).toMatchObject({
      name: "company--review",
      description: "Review quoted YAML safely.\nKeep this second line.",
      note: "name: is data here",
    });
  });

  it("warns and skips malformed preset frontmatter in sync and preview", async () => {
    const presetRoot = path.join(tmpDir, "preset-skills");
    await outputFile(
      path.join(presetRoot, "broken", "SKILL.md"),
      "---\nname: [unterminated\n---\n# Broken",
    );
    const provider = getToolProvider("cursor");
    const presets = new Map([["company", [presetRoot]]]);

    const [preview] = await previewSkills([provider], tmpDir, presets);
    const [result] = await syncSkills([provider], tmpDir, presets);

    expect(result).toEqual(preview);
    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining("malformed YAML frontmatter"),
    ]);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "company--broken", "SKILL.md"),
      ),
    ).toBe(false);
  });

  it("materializes Cursor presets without copying native project skills", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "local", "SKILL.md"),
      "---\nname: local\n---\n# Local",
    );
    await outputFile(
      path.join(tmpDir, "preset-skills", "tdd", "SKILL.md"),
      "---\nname: tdd\n---\n# TDD",
    );
    const presets = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const [result] = await syncSkills(
      [getToolProvider("cursor")],
      tmpDir,
      presets,
    );

    expect(result).toMatchObject({
      tool: "cursor",
      skillCount: 1,
      skills: ["company--tdd"],
      warnings: [],
    });
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "company--tdd", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "local", "SKILL.md"),
      ),
    ).toBe(false);
  });

  it("materializes Codex presets without copying native project skills", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "local", "SKILL.md"),
      "---\nname: local\n---\n# Local",
    );
    await outputFile(
      path.join(tmpDir, "preset-skills", "tdd", "SKILL.md"),
      "---\nname: tdd\n---\n# TDD",
    );
    const presets = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const [result] = await syncSkills(
      [getToolProvider("codex")],
      tmpDir,
      presets,
    );

    expect(result).toMatchObject({
      tool: "codex",
      skillCount: 1,
      skills: ["company--tdd"],
      warnings: [],
    });
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", "skills", "company--tdd", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(tmpDir, ".codex", "skills", "local", "SKILL.md"),
      ),
    ).toBe(false);
  });

  it("skips names that the Cursor or Codex skill loaders reject", async () => {
    const cursorPreset = path.join(tmpDir, "cursor-preset");
    const codexPreset = path.join(tmpDir, "codex-preset");
    await outputFile(
      path.join(cursorPreset, "review", "SKILL.md"),
      "---\nname: review\n---\n# Review",
    );
    await outputFile(
      path.join(codexPreset, "x".repeat(60), "SKILL.md"),
      "---\nname: long\n---\n# Long",
    );

    const [cursorResult] = await syncSkills(
      [getToolProvider("cursor")],
      tmpDir,
      new Map([["ACME_team", [cursorPreset]]]),
    );
    const [codexResult] = await syncSkills(
      [getToolProvider("codex")],
      tmpDir,
      new Map([["team", [codexPreset]]]),
    );

    expect(cursorResult.skills).toEqual([]);
    expect(cursorResult.warnings).toEqual([
      expect.stringContaining("lowercase letters"),
    ]);
    expect(codexResult.skills).toEqual([]);
    expect(codexResult.warnings).toEqual([
      expect.stringContaining("64 characters"),
    ]);
    expect(await pathExists(path.join(tmpDir, ".cursor", "skills"))).toBe(
      false,
    );
    expect(await pathExists(path.join(tmpDir, ".codex", "skills"))).toBe(false);
  });

  it("allows a Codex preset skill name at exactly 64 characters", async () => {
    const namespace = "team";
    const skillName = "x".repeat(64 - namespace.length - 2);
    const presetDir = path.join(tmpDir, "preset-skills");
    await outputFile(
      path.join(presetDir, skillName, "SKILL.md"),
      `---\nname: ${skillName}\n---\n# Exact`,
    );

    const [result] = await syncSkills(
      [getToolProvider("codex")],
      tmpDir,
      new Map([[namespace, [presetDir]]]),
    );

    expect(result.skills).toEqual([`${namespace}--${skillName}`]);
  });

  it("does not materialize a preset over a same-name native skill", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "company--tdd", "SKILL.md"),
      "---\nname: company--tdd\n---\n# Local",
    );
    const presetRoot = path.join(tmpDir, "preset-skills");
    await outputFile(
      path.join(presetRoot, "tdd", "SKILL.md"),
      "---\nname: tdd\n---\n# Preset",
    );
    const provider = getToolProvider("cursor");
    const presets = new Map([["company", [presetRoot]]]);

    const [preview] = await previewSkills([provider], tmpDir, presets);
    const [result] = await syncSkills([provider], tmpDir, presets);

    expect(result).toEqual(preview);
    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining("native skill with the same name"),
    ]);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "company--tdd", "SKILL.md"),
      ),
    ).toBe(false);
  });

  it("warns when native discovery roots contain the same skill name", async () => {
    const globalRoot = path.join(tmpDir, "global-skills");
    for (const root of [globalRoot, path.join(tmpDir, ".agents", "skills")]) {
      await outputFile(
        path.join(root, "review", "SKILL.md"),
        "---\nname: review\n---\n# Review",
      );
    }

    const [result] = await syncSkills(
      [getToolProvider("codex")],
      tmpDir,
      undefined,
      { globalDirs: [globalRoot] },
    );

    expect(result.warnings).toEqual([
      expect.stringContaining("multiple discovery roots"),
    ]);
  });

  it("warns when OpenCode cannot safely materialize namespaced presets", async () => {
    await outputFile(
      path.join(tmpDir, "preset-skills", "tdd", "SKILL.md"),
      "---\nname: tdd\n---\n# TDD",
    );
    const presets = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const [result] = await syncSkills(
      [getToolProvider("opencode")],
      tmpDir,
      presets,
    );

    expect(result.skillCount).toBe(0);
    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining("company--tdd")]);
    expect(await pathExists(path.join(tmpDir, ".opencode", "skills"))).toBe(
      false,
    );
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

  it("warns when flat .md files exist at the top level of .agents/skills/", async () => {
    // Users sometimes drop flat .md files in .agents/skills/ thinking
    // they're project-custom skills. Sync globs `*/SKILL.md` and
    // silently ignores them — the warning surfaces that no-op so the
    // user can move the file into a <name>/SKILL.md layout.
    const skillsDir = path.join(tmpDir, ".agents", "skills");
    await ensureDir(skillsDir);
    await outputFile(path.join(skillsDir, "stray-flat.md"), "# wrong layout");
    await outputFile(
      path.join(skillsDir, "valid", "SKILL.md"),
      "---\ndescription: valid skill\n---\n# valid",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].skills).toEqual(["valid"]);
    const flatWarning = results[0].warnings.find((w) =>
      w.includes("stray-flat.md"),
    );
    expect(flatWarning).toBeDefined();
    expect(flatWarning).toMatch(/<name>\/SKILL\.md|directory layout/i);
  });

  it("does not warn when no flat .md files exist", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "valid", "SKILL.md"),
      "---\ndescription: valid\n---\n# valid",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results[0].warnings.find((w) => w.includes("flat"))).toBeUndefined();
  });

  it("warns about a flat file only once across a multi-tool run", async () => {
    // Each generated-output tool independently scans .agents/skills, so
    // without dedup this warning would repeat once per tool.
    const skillsDir = path.join(tmpDir, ".agents", "skills");
    await ensureDir(skillsDir);
    await outputFile(path.join(skillsDir, "stray-flat.md"), "# wrong layout");
    await outputFile(
      path.join(skillsDir, "valid", "SKILL.md"),
      "---\ndescription: valid skill\n---\n# valid",
    );

    const providers = ["claude", "copilot", "cline"].map(getToolProvider);
    const results = await syncSkills(providers, tmpDir);

    const flatWarnings = results.flatMap((result) =>
      result.warnings.filter((w) => w.includes("stray-flat.md")),
    );
    expect(flatWarnings).toHaveLength(1);
  });

  it("warns when a project skill's frontmatter has no description", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "no-desc", "SKILL.md"),
      "---\nname: no-desc\n---\n# No Description",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results[0].skills).toEqual(["no-desc"]);
    const warning = results[0].warnings.find((w) => w.includes("no-desc"));
    expect(warning).toBeDefined();
    expect(warning).toContain("description");
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "no-desc", "SKILL.md"),
      ),
    ).toBe(true);
  });

  it("does not warn when a project skill's description is present", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "skills", "has-desc", "SKILL.md"),
      "---\ndescription: has a description\n---\n# Has Description",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir);

    expect(results[0].warnings).toEqual([]);
  });

  describe("Global skills", () => {
    it("dedupes a skill shared between global and project sources, keeping the project copy", async () => {
      const globalSkillsDir = path.join(tmpDir, "global-skills");
      await outputFile(
        path.join(globalSkillsDir, "shared", "SKILL.md"),
        "---\ndescription: global version\n---\n# Global",
      );
      await outputFile(
        path.join(tmpDir, ".agents", "skills", "shared", "SKILL.md"),
        "---\ndescription: project version\n---\n# Project",
      );

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, undefined, {
        globalDirs: [globalSkillsDir],
      });

      expect(results[0].skillCount).toBe(1);
      expect(results[0].skills).toEqual(["shared"]);
      const shadowWarning = results[0].warnings.find((w) =>
        w.includes("shared"),
      );
      expect(shadowWarning).toBeDefined();
      expect(shadowWarning).toContain("global-skills");

      const content = await readFile(
        path.join(tmpDir, ".claude", "skills", "shared", "SKILL.md"),
        "utf-8",
      );
      expect(content).toContain("# Project");
    });

    it("writes nothing for native readers that cover ~/.agents/skills", async () => {
      const globalSkillsDir = path.join(tmpDir, "global-skills");
      await ensureDir(path.join(globalSkillsDir, "onboarding"));
      await outputFile(
        path.join(globalSkillsDir, "onboarding", "SKILL.md"),
        "---\ndescription: onboarding\n---\n# Onboarding",
      );

      const providers = ["codex", "opencode", "cursor"].map(getToolProvider);
      const results = await syncSkills(providers, tmpDir, undefined, {
        globalDirs: [globalSkillsDir],
      });

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.skillCount).toBe(0);
        expect(result.skills).toEqual([]);
        expect(result.warnings).toEqual([]);
      }
      expect(await pathExists(path.join(tmpDir, ".codex"))).toBe(false);
      expect(await pathExists(path.join(tmpDir, ".opencode"))).toBe(false);
      expect(await pathExists(path.join(tmpDir, ".cursor"))).toBe(false);
    });

    it("warns instead of assuming unverified global native discovery", async () => {
      const globalSkillsDir = path.join(tmpDir, "global-skills");
      await outputFile(
        path.join(globalSkillsDir, "onboarding", "SKILL.md"),
        "---\ndescription: onboarding\n---\n# Onboarding",
      );

      const provider = getToolProvider("gemini");
      const options = { globalDirs: [globalSkillsDir] };
      const [preview] = await previewSkills(
        [provider],
        tmpDir,
        undefined,
        options,
      );
      const [result] = await syncSkills([provider], tmpDir, undefined, options);

      expect(result).toEqual(preview);
      expect(result.skills).toEqual([]);
      expect(result.warnings).toEqual([
        expect.stringContaining(
          "native discovery of global ~/.agents/skills is unverified",
        ),
      ]);
    });

    it("leaves holdout tool copy behavior unchanged when global skills exist", async () => {
      // A holdout tool (nativeSkillsDiscovery: false, e.g. claude) is unaffected by
      // the gap check — it still receives a real copy of the global skill.
      const globalSkillsDir = path.join(tmpDir, "global-skills");
      await ensureDir(path.join(globalSkillsDir, "onboarding"));
      await outputFile(
        path.join(globalSkillsDir, "onboarding", "SKILL.md"),
        "---\ndescription: onboarding\n---\n# Onboarding",
      );

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, undefined, {
        globalDirs: [globalSkillsDir],
      });

      expect(results[0].skillCount).toBe(1);
      expect(results[0].skills).toContain("onboarding");
      expect(results[0].warnings).toEqual([]);

      const claudeSkill = path.join(
        tmpDir,
        ".claude",
        "skills",
        "onboarding",
        "SKILL.md",
      );
      expect(await pathExists(claudeSkill)).toBe(true);
    });
  });
});
