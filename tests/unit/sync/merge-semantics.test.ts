/**
 * Merge Semantics Acceptance Tests (TC-01 through TC-12)
 *
 * Validates the preset merge semantics specification:
 * - MCP: last-wins by server name
 * - Skills/Commands/Agents: namespace-isolated accumulation
 * - Profile filtering: allowlist (intersection) model
 * - Project custom content: always loads regardless of profile
 *
 * These tests cover the sync-layer merge behavior, not the full CLI pipeline.
 * They use real filesystem I/O with temp directories.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../src/sync/agents.js";
import { syncCommands } from "../../../src/sync/commands.js";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import {
  deriveNamespace,
  normalizeExtends,
} from "../../../src/types/schemas.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Merge Semantics Acceptance Tests", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-merge-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** Helper: create a skill SKILL.md in a preset directory */
  async function createSkill(
    baseDir: string,
    name: string,
    content: string,
  ): Promise<void> {
    const dir = path.join(baseDir, name);
    await ensureDir(dir);
    await outputFile(
      path.join(dir, "SKILL.md"),
      `---\ndescription: ${name}\n---\n\n${content}`,
    );
  }

  /** Helper: create a command .md file in a preset directory */
  async function createCommand(
    baseDir: string,
    name: string,
    content: string,
  ): Promise<void> {
    await ensureDir(baseDir);
    await outputFile(
      path.join(baseDir, `${name}.md`),
      `---\ndescription: ${name}\n---\n\n${content}`,
    );
  }

  /** Helper: create an agent .md file in a preset directory */
  async function createAgent(
    baseDir: string,
    name: string,
    content: string,
  ): Promise<void> {
    await ensureDir(baseDir);
    await outputFile(
      path.join(baseDir, `${name}.md`),
      `---\ndescription: ${name}\n---\n\n${content}`,
    );
  }

  // =========================================================================
  // TC-01: Same skill name, different namespaces
  // =========================================================================
  describe("TC-01: Same skill name, different namespaces", () => {
    it("both skills coexist with distinct namespace prefixes", async () => {
      // Two presets both containing a skill called "tdd"
      const presetA = path.join(tmpDir, "preset-a", "skills");
      const presetB = path.join(tmpDir, "preset-b", "skills");
      await createSkill(presetA, "tdd", "# Acme Standards TDD");
      await createSkill(presetB, "tdd", "# Acme Team Tools TDD");

      const presets = new Map([
        ["acme-standards", [path.join(tmpDir, "preset-a", "skills")]],
        ["acme-team-tools", [path.join(tmpDir, "preset-b", "skills")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("acme-standards--tdd");
      expect(results[0].skills).toContain("acme-team-tools--tdd");
      expect(results[0].skillCount).toBe(2);

      // Verify content is distinct
      const contentA = await readFile(
        path.join(
          tmpDir,
          ".claude",
          "skills",
          "acme-standards--tdd",
          "SKILL.md",
        ),
        "utf-8",
      );
      const contentB = await readFile(
        path.join(
          tmpDir,
          ".claude",
          "skills",
          "acme-team-tools--tdd",
          "SKILL.md",
        ),
        "utf-8",
      );
      expect(contentA).toContain("Acme Standards TDD");
      expect(contentB).toContain("Acme Team Tools TDD");
    });
  });

  // =========================================================================
  // TC-02: Same preset extended at two hierarchy levels (deduplication)
  // =========================================================================
  describe("TC-02: Extends deduplication (same source at multiple levels)", () => {
    it("deduplicates same source URI keeping last occurrence", () => {
      // Simulate: global extends [acme/standards], project extends [acme/standards, acme/team-tools]
      const accumulated = [
        "github:acme/standards",
        "github:acme/standards",
        "github:acme/team-tools",
      ];
      const result = normalizeExtends(accumulated);

      // Should be deduplicated to 2 entries
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe("github:acme/standards");
      expect(result[1].source).toBe("github:acme/team-tools");
    });

    it("preserves order with last occurrence winning", () => {
      const accumulated = [
        "github:acme/standards",
        "github:acme/team-tools",
        "github:acme/standards",
      ];
      const result = normalizeExtends(accumulated);

      // team-tools at position 1, standards at position 2 (last occurrence)
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe("github:acme/team-tools");
      expect(result[1].source).toBe("github:acme/standards");
    });
  });

  // =========================================================================
  // TC-03: Project custom skill vs namespaced preset skill
  // =========================================================================
  describe("TC-03: Project custom vs preset skills coexist", () => {
    it("project my-skill.md and preset acme-standards--my-skill coexist", async () => {
      // Project custom skill (no namespace)
      const projectSkillDir = path.join(
        tmpDir,
        ".agents",
        "skills",
        "my-skill",
      );
      await ensureDir(projectSkillDir);
      await outputFile(
        path.join(projectSkillDir, "SKILL.md"),
        "# Project Custom Skill",
      );

      // Preset skill with same base name
      const presetSkills = path.join(tmpDir, "preset", "skills");
      await createSkill(presetSkills, "my-skill", "# Preset Skill");

      const presets = new Map([
        ["acme-standards", [path.join(tmpDir, "preset", "skills")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      // Both should exist: bare "my-skill" and namespaced "acme-standards--my-skill"
      expect(results[0].skills).toContain("my-skill");
      expect(results[0].skills).toContain("acme-standards--my-skill");
      expect(results[0].skillCount).toBe(2);
    });
  });

  // =========================================================================
  // TC-04 & TC-05: MCP last-wins tested at config layer (not sync layer)
  // See: tests/unit/core/config/merge.test.ts — "MCP servers merge per-key, specific wins"
  // See: tests/unit/core/registry/merger.test.ts — "last-wins for MCPs with same name"
  // =========================================================================

  // =========================================================================
  // TC-06: Profile filtering (tested at normalizeExtends level)
  // =========================================================================
  describe("TC-06: Profile filtering reduces preset list", () => {
    it("filtered extends array produces fewer presets", () => {
      // Full list
      const full = normalizeExtends([
        "github:acme/standards",
        "github:acme/team-tools",
        "github:acme/experimental",
      ]);
      expect(full).toHaveLength(3);

      // Profile filters to just standards (done at config layer)
      const filtered = normalizeExtends(["github:acme/standards"]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].namespace).toBe("acme-standards");
    });

    it("explicit empty extends array produces zero presets (distinct from absent extends)", () => {
      // extends: [] is an explicit opt-out — must produce zero entries
      const emptyExplicit = normalizeExtends([]);
      expect(emptyExplicit).toHaveLength(0);

      // extends: undefined (absent) is treated the same way at normalize level
      const absent = normalizeExtends(undefined);
      expect(absent).toHaveLength(0);
    });

    it("project custom skills always load regardless of profile filter", async () => {
      // Project custom skill exists even when no presets are loaded
      const projectSkillDir = path.join(
        tmpDir,
        ".agents",
        "skills",
        "my-local-skill",
      );
      await ensureDir(projectSkillDir);
      await outputFile(path.join(projectSkillDir, "SKILL.md"), "# Local Skill");

      // No presets (empty extends after profile filter)
      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, undefined);

      expect(results[0].skills).toContain("my-local-skill");
      expect(results[0].skillCount).toBe(1);
    });
  });

  // =========================================================================
  // TC-07: Two presets define same MCP server name
  // MCP merge is tested at config layer, not sync layer.
  // See: tests/unit/core/config/merge.test.ts — "MCP servers merge per-key, specific wins"
  // See: tests/unit/core/registry/merger.test.ts — "last-wins for MCPs with same name"
  // See: tests/e2e/global-config.test.ts — "applies local MCP overrides over project config"
  // =========================================================================

  // =========================================================================
  // TC-08: Monorepo 3-level accumulation
  // =========================================================================
  describe("TC-08: Monorepo 3-level accumulation", () => {
    it("skills from 3 different presets all accumulate", async () => {
      // Simulate 3 presets from 3 hierarchy levels
      const rootPreset = path.join(tmpDir, "root-preset", "skills");
      const wsPreset = path.join(tmpDir, "ws-preset", "skills");
      const pkgPreset = path.join(tmpDir, "pkg-preset", "skills");

      await createSkill(rootPreset, "tdd", "# Root TDD");
      await createSkill(wsPreset, "code-review", "# Workspace Code Review");
      await createSkill(pkgPreset, "testing", "# Package Testing");

      const presets = new Map([
        ["acme-standards", [rootPreset]],
        ["acme-team-tools", [wsPreset]],
        ["acme-experimental", [pkgPreset]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("acme-standards--tdd");
      expect(results[0].skills).toContain("acme-team-tools--code-review");
      expect(results[0].skills).toContain("acme-experimental--testing");
      expect(results[0].skillCount).toBe(3);
    });

    it("commands from 3 presets all accumulate with namespace dirs", async () => {
      const rootCmds = path.join(tmpDir, "root-cmds");
      const wsCmds = path.join(tmpDir, "ws-cmds");
      const pkgCmds = path.join(tmpDir, "pkg-cmds");

      await createCommand(rootCmds, "lint", "# Lint");
      await createCommand(wsCmds, "deploy", "# Deploy");
      await createCommand(pkgCmds, "bench", "# Bench");

      const presets = new Map([
        ["acme-standards", [rootCmds]],
        ["acme-team-tools", [wsCmds]],
        ["acme-experimental", [pkgCmds]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncCommands(providers, tmpDir, presets);

      expect(results[0].commandCount).toBe(3);
      expect(results[0].commands).toContain(
        path.join("acme-standards", "lint.md"),
      );
      expect(results[0].commands).toContain(
        path.join("acme-team-tools", "deploy.md"),
      );
      expect(results[0].commands).toContain(
        path.join("acme-experimental", "bench.md"),
      );
    });
  });

  // =========================================================================
  // TC-09: Project custom file mimicking namespace format (shadowing)
  // =========================================================================
  describe("TC-09: Project custom file mimicking namespace format", () => {
    it("project custom file with namespace-format name shadows preset", async () => {
      // Preset produces "acme-standards--tdd"
      const presetSkills = path.join(tmpDir, "preset", "skills");
      await createSkill(presetSkills, "tdd", "# Preset TDD");

      // User creates a project skill with the namespace format
      // In our system, project skills are directory-based (skillname/SKILL.md)
      // so "acme-standards--tdd" would be a directory name
      const customDir = path.join(
        tmpDir,
        ".agents",
        "skills",
        "acme-standards--tdd",
      );
      await ensureDir(customDir);
      await outputFile(
        path.join(customDir, "SKILL.md"),
        "# Custom Override TDD",
      );

      const presets = new Map([
        ["acme-standards", [path.join(tmpDir, "preset", "skills")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      // The skill name appears in results (either from project or preset)
      expect(results[0].skills).toContain("acme-standards--tdd");

      // The file should exist at the expected output path
      const content = await readFile(
        path.join(
          tmpDir,
          ".claude",
          "skills",
          "acme-standards--tdd",
          "SKILL.md",
        ),
        "utf-8",
      );

      // Per the merge semantics spec (Section 3, Scenario C):
      // Project custom content has higher specificity than preset content,
      // so project custom wins at the filesystem level when paths collide.
      // Verify project custom wins: the file should contain "Custom Override TDD", not "Preset TDD"
      expect(content).toContain("Custom Override TDD");
      expect(content).not.toContain("Preset TDD");
    });

    it("project custom file with non-colliding name always survives", async () => {
      // Preset produces "acme-standards--tdd"
      const presetSkills = path.join(tmpDir, "preset", "skills");
      await createSkill(presetSkills, "tdd", "# Preset TDD");

      // Project custom with a unique name (no collision)
      const customDir = path.join(tmpDir, ".agents", "skills", "my-custom-tdd");
      await ensureDir(customDir);
      await outputFile(path.join(customDir, "SKILL.md"), "# My Custom TDD");

      const presets = new Map([
        ["acme-standards", [path.join(tmpDir, "preset", "skills")]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      // Both coexist — different names, no collision
      expect(results[0].skills).toContain("acme-standards--tdd");
      expect(results[0].skills).toContain("my-custom-tdd");
      expect(results[0].skillCount).toBe(2);

      // Verify project custom content is correct
      const customContent = await readFile(
        path.join(tmpDir, ".claude", "skills", "my-custom-tdd", "SKILL.md"),
        "utf-8",
      );
      expect(customContent).toContain("My Custom TDD");
    });
  });

  // =========================================================================
  // TC-10: Empty profile extends
  // =========================================================================
  describe("TC-10: Empty profile extends disables all presets", () => {
    it("only project custom skills load when no presets configured", async () => {
      // Project custom skill
      const customDir = path.join(
        tmpDir,
        ".agents",
        "skills",
        "my-local-skill",
      );
      await ensureDir(customDir);
      await outputFile(path.join(customDir, "SKILL.md"), "# Local Skill");

      // No presets (simulating extends: [] after profile filter)
      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, undefined);

      expect(results[0].skills).toContain("my-local-skill");
      expect(results[0].skillCount).toBe(1);
    });
  });

  // =========================================================================
  // TC-11: All four layers contributing simultaneously
  // =========================================================================
  describe("TC-11: Multiple layers contributing skills", () => {
    it("skills from 3 presets plus project custom all accumulate", async () => {
      // Three presets
      const preset1 = path.join(tmpDir, "p1", "skills");
      const preset2 = path.join(tmpDir, "p2", "skills");
      const preset3 = path.join(tmpDir, "p3", "skills");
      await createSkill(preset1, "tdd", "# P1 TDD");
      await createSkill(preset2, "code-review", "# P2 Review");
      await createSkill(preset3, "testing", "# P3 Testing");

      // Project custom
      const customDir = path.join(tmpDir, ".agents", "skills", "my-skill");
      await ensureDir(customDir);
      await outputFile(path.join(customDir, "SKILL.md"), "# My Skill");

      const presets = new Map([
        ["acme-standards", [preset1]],
        ["acme-team-tools", [preset2]],
        ["acme-experimental", [preset3]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("acme-standards--tdd");
      expect(results[0].skills).toContain("acme-team-tools--code-review");
      expect(results[0].skills).toContain("acme-experimental--testing");
      expect(results[0].skills).toContain("my-skill");
      expect(results[0].skillCount).toBe(4);
    });
  });

  // =========================================================================
  // TC-12: fs: tool directory reference (namespace derivation)
  // =========================================================================
  describe("TC-12: fs: tool directory namespace derivation", () => {
    it("fs:~/.cursor derives namespace 'cursor'", () => {
      expect(deriveNamespace("fs:~/.cursor")).toBe("cursor");
    });

    it("fs: Windows tool directory derives namespace 'cursor'", () => {
      expect(deriveNamespace("fs:C:\\Users\\me\\.cursor")).toBe("cursor");
    });

    it("github:acme/standards derives namespace 'acme-standards'", () => {
      expect(deriveNamespace("github:acme/standards")).toBe("acme-standards");
    });

    it("fs: tool directory skills get correct namespace prefix", async () => {
      // Simulate a cursor tool directory with skills
      const cursorSkills = path.join(tmpDir, "cursor-dir", "skills");
      await createSkill(cursorSkills, "code-review", "# Cursor Review");
      await createSkill(cursorSkills, "testing", "# Cursor Testing");

      const presets = new Map([["cursor", [cursorSkills]]]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("cursor--code-review");
      expect(results[0].skills).toContain("cursor--testing");
      expect(results[0].skillCount).toBe(2);
    });

    it("fs: and github presets accumulate with different namespaces", async () => {
      // GitHub preset
      const ghSkills = path.join(tmpDir, "gh-preset", "skills");
      await createSkill(ghSkills, "tdd", "# GitHub TDD");

      // FS preset (simulating tool directory)
      const fsSkills = path.join(tmpDir, "cursor-dir", "skills");
      await createSkill(fsSkills, "code-review", "# Cursor Review");

      const presets = new Map([
        ["acme-standards", [ghSkills]],
        ["cursor", [fsSkills]],
      ]);

      const providers = [getToolProvider("claude")];
      const results = await syncSkills(providers, tmpDir, presets);

      expect(results[0].skills).toContain("acme-standards--tdd");
      expect(results[0].skills).toContain("cursor--code-review");
      expect(results[0].skillCount).toBe(2);
    });
  });

  // =========================================================================
  // Additional: Namespace collision detection
  // =========================================================================
  describe("Namespace collision detection", () => {
    it("two github sources with same namespace derive different namespaces", () => {
      // Different orgs with different repo names
      const result = normalizeExtends([
        "github:acme/standards",
        "github:other/tools",
      ]);
      expect(result[0].namespace).not.toBe(result[1].namespace);
    });

    it("versioned references to same source produce same namespace (caught by sync collision detector)", () => {
      // Same repo, different refs — both derive namespace "acme-standards".
      // normalizeExtends keeps both (different source URIs).
      // The namespace collision detector in sync.ts:220-232 will throw
      // a ConfigError with a versioned-ref-specific hint at runtime.
      const result = normalizeExtends([
        "github:acme/standards@v1",
        "github:acme/standards@v2",
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].namespace).toBe("acme-standards");
      expect(result[1].namespace).toBe("acme-standards");
    });
  });

  // =========================================================================
  // Additional: Agents sync with namespace isolation
  // =========================================================================
  describe("Agents namespace isolation", () => {
    it("preset agents get namespace prefix", async () => {
      const presetAgents = path.join(tmpDir, "preset", "agents");
      await createAgent(presetAgents, "reviewer", "# Reviewer Agent");

      const presets = new Map([["company", [presetAgents]]]);

      const providers = [getToolProvider("claude")];
      const results = await syncAgents(providers, tmpDir, presets);

      expect(results[0].agents).toContain(path.join("company", "reviewer.md"));
      expect(results[0].agentCount).toBe(1);
    });

    it("project agents and preset agents coexist", async () => {
      // Project agent
      await ensureDir(path.join(tmpDir, ".agents", "agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agents", "helper.md"),
        "---\ndescription: helper\n---\n\n# Helper",
      );

      // Preset agent
      const presetAgents = path.join(tmpDir, "preset", "agents");
      await createAgent(presetAgents, "reviewer", "# Reviewer");

      const presets = new Map([["company", [presetAgents]]]);

      const providers = [getToolProvider("claude")];
      const results = await syncAgents(providers, tmpDir, presets);

      expect(results[0].agentCount).toBe(2);
      expect(results[0].agents).toContain("helper.md");
      expect(results[0].agents).toContain(path.join("company", "reviewer.md"));
    });
  });
});
