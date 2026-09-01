/**
 * Rules Sync Tests
 *
 * The load condition (`paths:` present or absent) is the property under test
 * throughout: a rule may be reformatted for a tool, but never re-scoped.
 */
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readManifest,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import {
  loadCanonicalRules,
  previewRules as previewRuleArtifacts,
  syncRules as syncRuleArtifacts,
} from "../../../src/sync/rules.js";
import { applyStructuredLifecyclePlan } from "../../../src/sync/structured-lifecycle.js";
import { planToolStructuredLifecycle } from "../../../src/sync/structured-providers.js";
import { claudeProvider } from "../../../src/tools/claude.js";
import { codexProvider } from "../../../src/tools/codex.js";
import { cursorProvider, toCursorMdc } from "../../../src/tools/cursor.js";
import { opencodeProvider } from "../../../src/tools/opencode.js";
import type { ToolProvider } from "../../../src/tools/types.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  ensureDir,
  outputFile,
  pathExists,
  readJsonValidated,
} from "../../../src/utils/fs.js";

async function writeRule(
  tmpDir: string,
  relPath: string,
  content: string,
): Promise<void> {
  await outputFile(path.join(tmpDir, ".agents", "rules", relPath), content);
}

async function previewRules(providers: ToolProvider[], cwd: string) {
  const { rules } = await loadCanonicalRules(cwd);
  await planToolStructuredLifecycle({
    cwd,
    providers,
    previousReceipts: (await readManifest(cwd))?.structured_owners,
    desired: { extensions: {}, rules },
    preserveUnselected: true,
  });
  return previewRuleArtifacts(providers, cwd);
}

async function syncRules(providers: ToolProvider[], cwd: string) {
  const { rules } = await loadCanonicalRules(cwd);
  const lifecycle = await planToolStructuredLifecycle({
    cwd,
    providers,
    previousReceipts: (await readManifest(cwd))?.structured_owners,
    desired: { extensions: {}, rules },
    preserveUnselected: true,
  });
  const results = await syncRuleArtifacts(providers, cwd);
  const applied = await applyStructuredLifecyclePlan(lifecycle);
  await writeOwnedManifest(cwd, new Map(), {
    preserveUnselected: true,
    replaceTools: providers.map((provider) => provider.name),
    structuredOwners: applied.plan.nextReceipts,
  });
  return results;
}

const SCOPED = `---
description: API conventions
paths:
  - "src/api/**/*.ts"
---

Validate every input.
`;

const UNSCOPED = `---
description: House style
---

Two-space indentation.
`;

describe("rules sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-rules-"));
    await ensureDir(path.join(tmpDir, ".agents"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("loadCanonicalRules", () => {
    it("returns nothing when .agents/rules is absent", async () => {
      const { rules } = await loadCanonicalRules(tmpDir);
      expect(rules).toEqual([]);
    });

    it("reads description and paths from frontmatter", async () => {
      await writeRule(tmpDir, "api.md", SCOPED);

      const { rules } = await loadCanonicalRules(tmpDir);

      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe("api");
      expect(rules[0].description).toBe("API conventions");
      expect(rules[0].paths).toEqual(["src/api/**/*.ts"]);
    });

    it("leaves paths undefined when the key is absent", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);

      const { rules } = await loadCanonicalRules(tmpDir);

      expect(rules[0].paths).toBeUndefined();
    });

    it("accepts a bare string as a single glob", async () => {
      await writeRule(tmpDir, "one.md", '---\npaths: "src/**"\n---\n\nBody.\n');

      const { rules } = await loadCanonicalRules(tmpDir);

      expect(rules[0].paths).toEqual(["src/**"]);
    });

    it("keeps an empty paths list conditional rather than always-on", async () => {
      // Collapsing [] to undefined would invert the rule: a rule that matches
      // nothing would become one that applies everywhere.
      await writeRule(tmpDir, "empty.md", "---\npaths: []\n---\n\nBody.\n");

      const { rules, warnings } = await loadCanonicalRules(tmpDir);

      expect(rules[0].paths).toEqual([]);
      expect(warnings.join()).toContain("never load");
    });

    it("discovers rules in subdirectories", async () => {
      await writeRule(tmpDir, "frontend/style.md", UNSCOPED);

      const { rules } = await loadCanonicalRules(tmpDir);

      expect(rules[0].name).toBe(path.join("frontend", "style"));
    });
  });

  describe("claude", () => {
    it("writes the rule through byte-for-byte", async () => {
      await writeRule(tmpDir, "api.md", SCOPED);

      await syncRules([claudeProvider], tmpDir);

      const written = await readFile(
        path.join(tmpDir, ".claude", "rules", "api.md"),
        "utf-8",
      );
      expect(written).toBe(SCOPED);
    });

    it("preserves subdirectory layout", async () => {
      await writeRule(tmpDir, "frontend/style.md", UNSCOPED);

      await syncRules([claudeProvider], tmpDir);

      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "rules", "frontend", "style.md"),
        ),
      ).toBe(true);
    });

    it("does not rewrite the source when .claude/rules symlinks to it", async () => {
      // The converged layout: .claude/rules -> ../.agents/rules. Comparing raw
      // paths would miss that and truncate-and-rewrite every source file
      // through the link. The bytes come out identical, so a content assertion
      // cannot see it happen — mtime can.
      await writeRule(tmpDir, "api.md", SCOPED);
      await ensureDir(path.join(tmpDir, ".claude"));
      await symlink(
        path.join(tmpDir, ".agents", "rules"),
        path.join(tmpDir, ".claude", "rules"),
      );
      const source = path.join(tmpDir, ".agents", "rules", "api.md");
      const before = await stat(source, { bigint: true });

      const results = await syncRules([claudeProvider], tmpDir);

      const after = await stat(source, { bigint: true });
      expect(after.mtimeNs).toBe(before.mtimeNs);
      expect(results[0].rules).toEqual(["api"]);
      expect(await readFile(source, "utf-8")).toBe(SCOPED);
    });
  });

  describe("cursor", () => {
    it("translates paths into globs with alwaysApply false", async () => {
      await writeRule(tmpDir, "api.md", SCOPED);

      await syncRules([cursorProvider], tmpDir);

      const written = await readFile(
        path.join(tmpDir, ".cursor", "rules", "api.mdc"),
        "utf-8",
      );
      expect(written).toContain("globs: src/api/**/*.ts");
      expect(written).toContain("alwaysApply: false");
      expect(written).toContain("Validate every input.");
    });

    it("marks an unscoped rule alwaysApply true", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);

      await syncRules([cursorProvider], tmpDir);

      const written = await readFile(
        path.join(tmpDir, ".cursor", "rules", "style.mdc"),
        "utf-8",
      );
      expect(written).toContain("alwaysApply: true");
      expect(written).not.toContain("globs:");
    });

    it("joins multiple globs into one comma-separated value", () => {
      const mdc = toCursorMdc({
        name: "multi",
        relPath: "multi.md",
        paths: ["src/**/*.ts", "lib/**/*.ts"],
        raw: "",
        body: "Body.",
        sourcePath: "/tmp/multi.md",
      });

      expect(mdc).toContain("globs: src/**/*.ts,lib/**/*.ts");
    });

    it("escapes a description that would otherwise corrupt the block", () => {
      const mdc = toCursorMdc({
        name: "tricky",
        relPath: "tricky.md",
        description: "rules: use #2 spacing",
        raw: "",
        body: "Body.",
        sourcePath: "/tmp/tricky.md",
      });

      // Naive concatenation would emit `description: rules: use #2 spacing`,
      // which is not parseable YAML.
      expect(mdc).toContain("'rules: use #2 spacing'");
    });
  });

  describe("opencode", () => {
    it("enumerates unscoped rules into instructions", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);

      await syncRules([opencodeProvider], tmpDir);

      const config = await readJsonValidated(
        path.join(tmpDir, "opencode.json"),
        ToolSettingsSchema,
      );
      expect(config.instructions).toEqual([".agents/rules/style.md"]);
    });

    it("withholds a path-scoped rule instead of making it always-on", async () => {
      await writeRule(tmpDir, "api.md", SCOPED);

      const results = await syncRules([opencodeProvider], tmpDir);

      expect(await pathExists(path.join(tmpDir, "opencode.json"))).toBe(false);
      expect(results[0].rules).toEqual([]);
      expect(results[0].warnings.join()).toContain("path-scoped");
    });

    it("never writes a directory glob that would re-include scoped rules", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);
      await writeRule(tmpDir, "api.md", SCOPED);

      await syncRules([opencodeProvider], tmpDir);

      const config = await readJsonValidated(
        path.join(tmpDir, "opencode.json"),
        ToolSettingsSchema,
      );
      expect(config.instructions).toEqual([".agents/rules/style.md"]);
      expect(config.instructions).not.toContain(".agents/rules/*.md");
    });

    it("preserves instruction entries the user added by hand", async () => {
      await outputFile(
        path.join(tmpDir, "opencode.json"),
        `${JSON.stringify({ instructions: ["CONTRIBUTING.md"] }, null, 2)}\n`,
      );
      await writeRule(tmpDir, "style.md", UNSCOPED);

      await syncRules([opencodeProvider], tmpDir);

      const config = await readJsonValidated(
        path.join(tmpDir, "opencode.json"),
        ToolSettingsSchema,
      );
      expect(config.instructions).toEqual([
        "CONTRIBUTING.md",
        ".agents/rules/style.md",
      ]);
    });

    it("drops its own stale entries on re-sync without duplicating", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);
      await syncRules([opencodeProvider], tmpDir);
      await rm(path.join(tmpDir, ".agents", "rules", "style.md"));
      await writeRule(tmpDir, "other.md", UNSCOPED);

      await syncRules([opencodeProvider], tmpDir);

      const config = await readJsonValidated(
        path.join(tmpDir, "opencode.json"),
        ToolSettingsSchema,
      );
      expect(config.instructions).toEqual([".agents/rules/other.md"]);
    });

    it("preflights malformed shared config without changing its bytes", async () => {
      const configPath = path.join(tmpDir, "opencode.json");
      const malformed = "{not json";
      await outputFile(configPath, malformed);
      await writeRule(tmpDir, "style.md", UNSCOPED);

      await expect(
        previewRules([opencodeProvider], tmpDir),
      ).rejects.toMatchObject({
        code: "CONFIG_ERROR",
        context: { configPath },
      });

      expect(await readFile(configPath, "utf-8")).toBe(malformed);
    });
  });

  describe("codex", () => {
    it("writes nothing and says so without overclaiming", async () => {
      await writeRule(tmpDir, "style.md", UNSCOPED);

      const results = await syncRules([codexProvider], tmpDir);

      expect(results[0].ruleCount).toBe(0);
      expect(results[0].warnings.join()).toContain("not synced to Codex");
      expect(results[0].warnings.join()).toContain("AGENTS.md");
      expect(await pathExists(path.join(tmpDir, ".codex", "rules"))).toBe(
        false,
      );
    });

    it("stays silent when there are no rules to lose", async () => {
      const results = await syncRules([codexProvider], tmpDir);

      expect(results[0].warnings).toEqual([]);
    });
  });

  describe("cross-tool", () => {
    it("reports malformed-source warnings once, not once per tool", async () => {
      await writeRule(tmpDir, "empty.md", "---\npaths: []\n---\n\nBody.\n");

      const results = await syncRules(
        [claudeProvider, cursorProvider, opencodeProvider],
        tmpDir,
      );

      const hits = results.filter((r) =>
        r.warnings.some((w) => w.includes("never load")),
      );
      expect(hits).toHaveLength(1);
    });

    it("surfaces malformed-source warnings even when no tool supports rules", async () => {
      await writeRule(tmpDir, "empty.md", "---\npaths: []\n---\n\nBody.\n");

      const results = await syncRules([codexProvider], tmpDir);

      expect(results[0].warnings.join()).toContain("never load");
    });
  });
});
