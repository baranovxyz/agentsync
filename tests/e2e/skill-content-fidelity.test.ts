/**
 * Skill Content Fidelity E2E Test
 * Tests that SKILL.md files with complex frontmatter are preserved
 * byte-for-byte through sync to all tools.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../src/constants.js";
import { generateHeader } from "../../src/sync/header.js";
import { syncSkills } from "../../src/sync/skills.js";
import { getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

describe("Skill Content Fidelity E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-fidelity-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const COMPLEX_SKILL = `---
name: advanced-review
description: Advanced code review with security analysis
disable-model-invocation: false
allowed-tools:
  - Read
  - Grep
  - Bash
argument-hint: <file-path> [--strict]
model: claude-sonnet-4-20250514
context:
  - AGENTS.md
  - src/**/*.ts
---

# Advanced Code Review

Review code for security vulnerabilities, performance issues, and best practices.

## Steps

1. Analyze the code structure
2. Check for common vulnerabilities (OWASP Top 10)
3. Verify error handling patterns
4. Review performance implications

## Output Format

\`\`\`json
{
  "severity": "high|medium|low",
  "findings": []
}
\`\`\`
`;

  const MINIMAL_SKILL = "# Minimal Skill\n\nJust content, no frontmatter.";

  const UNICODE_SKILL = `---
name: i18n-check
description: Check internationalization compliance
---

# i18n Compliance

Verify strings use proper Unicode handling.
Supported: English, Japanese (日本語), Korean (한국어), Chinese (中文).
`;

  it("preserves complex frontmatter through sync to claude", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "advanced-review");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), COMPLEX_SKILL);

    const providers = getToolProviders(["claude"] as ToolName[]);
    await syncSkills(providers, tmpDir);

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "advanced-review",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
    const content = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/skills/advanced-review/SKILL.md");
    expect(content).toBe(header + COMPLEX_SKILL);
  });

  it("preserves complex frontmatter through sync to cursor", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "advanced-review");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), COMPLEX_SKILL);

    const providers = getToolProviders(["cursor"] as ToolName[]);
    await syncSkills(providers, tmpDir);

    const outputPath = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "advanced-review",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
    const content = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/skills/advanced-review/SKILL.md");
    expect(content).toBe(header + COMPLEX_SKILL);
  });

  it("preserves content across holdout tools simultaneously", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "advanced-review");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), COMPLEX_SKILL);

    const allTools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    const providers = getToolProviders(allTools);
    await syncSkills(providers, tmpDir);

    // Only holdout tools (readsAgentsDir=false) get copies
    const holdoutPaths = [
      ".claude/skills/advanced-review/SKILL.md",
      ".cursor/skills/advanced-review/SKILL.md",
      ".github/skills/advanced-review/SKILL.md", // copilot
    ];

    const header = generateHeader(".agents/skills/advanced-review/SKILL.md");
    for (const expectedPath of holdoutPaths) {
      const fullPath = path.join(tmpDir, expectedPath);
      expect(await pathExists(fullPath), `${expectedPath} should exist`).toBe(
        true,
      );
      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe(header + COMPLEX_SKILL);
    }

    // Source file preserved without header
    const sourceContent = await readFile(
      path.join(tmpDir, ".agents", "skills", "advanced-review", "SKILL.md"),
      "utf-8",
    );
    expect(sourceContent).toBe(COMPLEX_SKILL);
  });

  it("preserves minimal skill without frontmatter", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "minimal");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), MINIMAL_SKILL);

    const providers = getToolProviders(["claude", "cursor"] as ToolName[]);
    await syncSkills(providers, tmpDir);

    const claudePath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "minimal",
      "SKILL.md",
    );
    const cursorPath = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "minimal",
      "SKILL.md",
    );

    const header = generateHeader(".agents/skills/minimal/SKILL.md");
    expect(await readFile(claudePath, "utf-8")).toBe(header + MINIMAL_SKILL);
    expect(await readFile(cursorPath, "utf-8")).toBe(header + MINIMAL_SKILL);
  });

  it("preserves unicode content through sync", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "i18n-check");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), UNICODE_SKILL);

    const providers = getToolProviders(["claude", "gemini"] as ToolName[]);
    await syncSkills(providers, tmpDir);

    const claudePath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "i18n-check",
      "SKILL.md",
    );
    const header = generateHeader(".agents/skills/i18n-check/SKILL.md");
    expect(await readFile(claudePath, "utf-8")).toBe(header + UNICODE_SKILL);
  });

  it("preserves extra files alongside SKILL.md", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "with-extra");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Skill with extras");
    await outputFile(path.join(skillDir, "config.json"), '{"key": "value"}');

    const providers = getToolProviders(["claude"] as ToolName[]);
    await syncSkills(providers, tmpDir);

    const outputDir = path.join(tmpDir, ".claude", "skills", "with-extra");
    expect(await pathExists(path.join(outputDir, "SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(outputDir, "config.json"))).toBe(true);

    const extraContent = await readFile(
      path.join(outputDir, "config.json"),
      "utf-8",
    );
    expect(extraContent).toBe('{"key": "value"}');
  });

  it("preserves content through preset namespace sync", async () => {
    const presetDir = path.join(tmpDir, "preset-skills", "review");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "SKILL.md"), COMPLEX_SKILL);

    const presetSkills = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const providers = getToolProviders(["claude"] as ToolName[]);
    await syncSkills(providers, tmpDir, presetSkills);

    // Flat namespace separator: company--review
    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "company--review",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
    const content = await readFile(outputPath, "utf-8");
    // Content has name rewritten for namespaced skills
    expect(content).toContain("Advanced Code Review");
  });
});
