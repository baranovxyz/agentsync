/**
 * Namespace Isolation Tests
 * Verifies preset skills are properly namespaced and don't collide
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands } from "../../../src/sync/commands.js";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Namespace Isolation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-ns-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Skills namespacing", () => {
    it("project skills have no namespace prefix", async () => {
      const skillDir = path.join(tmpDir, ".agents", "skills", "tdd");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Project TDD");

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir);

      expect(results[0].skills).toContain("tdd");
      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);
    });

    it("preset skills get namespace prefix", async () => {
      const presetDir = path.join(tmpDir, "presets", "company", "tdd");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "SKILL.md"), "# Company TDD");

      const presets = new Map([
        ["company", [path.join(tmpDir, "presets", "company")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("company--tdd");
      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "skills", "company--tdd", "SKILL.md"),
        ),
      ).toBe(true);
    });

    it("two presets with same skill name don't collide", async () => {
      // Company preset
      const companyDir = path.join(tmpDir, "presets-co", "deploy");
      await ensureDir(companyDir);
      await outputFile(path.join(companyDir, "SKILL.md"), "# Company Deploy");

      // Team preset
      const teamDir = path.join(tmpDir, "presets-team", "deploy");
      await ensureDir(teamDir);
      await outputFile(path.join(teamDir, "SKILL.md"), "# Team Deploy");

      const presets = new Map([
        ["company", [path.join(tmpDir, "presets-co")]],
        ["team", [path.join(tmpDir, "presets-team")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("company--deploy");
      expect(results[0].skills).toContain("team--deploy");

      // Both exist with different content
      const companyContent = await readFile(
        path.join(tmpDir, ".claude", "skills", "company--deploy", "SKILL.md"),
        "utf-8",
      );
      const teamContent = await readFile(
        path.join(tmpDir, ".claude", "skills", "team--deploy", "SKILL.md"),
        "utf-8",
      );

      expect(companyContent).toContain("# Company Deploy");
      expect(teamContent).toContain("# Team Deploy");
    });

    it("project and preset skills with same name coexist", async () => {
      // Project skill
      const projDir = path.join(tmpDir, ".agents", "skills", "deploy");
      await ensureDir(projDir);
      await outputFile(path.join(projDir, "SKILL.md"), "# Project Deploy");

      // Preset skill
      const presetDir = path.join(tmpDir, "preset", "deploy");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "SKILL.md"), "# Preset Deploy");

      const presets = new Map([["company", [path.join(tmpDir, "preset")]]]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      // Both should exist
      expect(results[0].skills).toContain("deploy");
      expect(results[0].skills).toContain("company--deploy");
      expect(results[0].skillCount).toBe(2);
    });
  });

  describe("Commands namespacing", () => {
    it("preset commands get namespace prefix", async () => {
      const presetDir = path.join(tmpDir, "preset-cmds");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "commit.md"), "# Commit Command");

      const presets = new Map([["team", [presetDir]]]);

      const providers = [getToolProvider("claude")];
      const results = await syncCommands(providers, tmpDir, presets);

      expect(results[0].commands).toContain(path.join("team", "commit.md"));
      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "commands", "team", "commit.md"),
        ),
      ).toBe(true);
    });

    it("project commands have no namespace", async () => {
      const cmdsDir = path.join(tmpDir, ".agents", "commands");
      await ensureDir(cmdsDir);
      await outputFile(path.join(cmdsDir, "review.md"), "# Review");

      const providers = [getToolProvider("claude")];
      const results = await syncCommands(providers, tmpDir);

      expect(results[0].commands).toContain("review.md");
    });
  });

  describe("Multi-tool namespace consistency", () => {
    it("same namespace structure across holdout tools (readsAgentsDir=false)", async () => {
      const presetDir = path.join(tmpDir, "preset", "tdd");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "SKILL.md"), "# TDD");

      const presets = new Map([["company", [path.join(tmpDir, "preset")]]]);

      // Only holdout tools (readsAgentsDir=false) get skills copied
      const providers = [
        getToolProvider("claude"),
        getToolProvider("cursor"),
        getToolProvider("roocode"),
        getToolProvider("gemini"),
      ];
      await syncSkills(providers, tmpDir, presets);

      // Holdout tools (claude, cursor) get namespace--skill flat dir
      const holdoutPaths = [
        ".claude/skills/company--tdd/SKILL.md",
        ".cursor/skills/company--tdd/SKILL.md",
      ];

      for (const p of holdoutPaths) {
        expect(await pathExists(path.join(tmpDir, p))).toBe(true);
      }

      // Native tools (roocode, gemini) with readsAgentsDir=true skip skill copy
      const nativePaths = [
        ".roo/skills/company--tdd/SKILL.md",
        ".gemini/skills/company--tdd/SKILL.md",
      ];

      for (const p of nativePaths) {
        expect(await pathExists(path.join(tmpDir, p))).toBe(false);
      }
    });
  });
});
