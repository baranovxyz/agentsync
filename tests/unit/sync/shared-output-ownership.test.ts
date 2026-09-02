import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanCommand } from "../../../src/commands/clean.js";
import type { ToolName } from "../../../src/constants.js";
import {
  executeSyncPlan,
  previewSharedOutputLifecycle,
} from "../../../src/sync/execute.js";
import {
  getManifestPath,
  hashFile,
  readManifest,
} from "../../../src/sync/manifest.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

interface ProviderFileLifecycle {
  tool: ToolName;
  generatedFiles: readonly string[];
  userFiles: readonly string[];
}

const NON_RELEASE_FILE_LIFECYCLES: readonly ProviderFileLifecycle[] = [
  {
    tool: "augment",
    generatedFiles: [".augment/commands/review.md"],
    userFiles: [".augment/commands/manual.md"],
  },
  {
    tool: "amazonq",
    generatedFiles: [".amazonq/agents/reviewer.md"],
    userFiles: [".amazonq/agents/manual.md"],
  },
  {
    tool: "cline",
    generatedFiles: [".clinerules/review/SKILL.md"],
    userFiles: [".clinerules/manual/SKILL.md"],
  },
  {
    tool: "copilot",
    generatedFiles: [
      ".github/agents/reviewer.agent.md",
      ".github/skills/review/SKILL.md",
    ],
    userFiles: [
      ".github/agents/manual.agent.md",
      ".github/skills/manual/SKILL.md",
    ],
  },
  {
    tool: "droid",
    generatedFiles: [
      ".factory/commands/review.md",
      ".factory/droids/reviewer.md",
    ],
    userFiles: [".factory/commands/manual.md", ".factory/droids/manual.md"],
  },
  {
    tool: "gemini",
    generatedFiles: ["GEMINI.md"],
    userFiles: ["NOTES.md"],
  },
  {
    tool: "pi",
    generatedFiles: [".pi/prompts/review.md"],
    userFiles: [".pi/prompts/manual.md"],
  },
  {
    tool: "roocode",
    generatedFiles: [".roo/commands/review.md"],
    userFiles: [".roo/commands/manual.md"],
  },
];

const CANONICAL_FILES = [
  "AGENTS.md",
  ".agents/skills/review/SKILL.md",
  ".agents/commands/review.md",
  ".agents/agents/reviewer.md",
] as const;

describe("shared output ownership", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-ownership-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function configure(
    tools: string[],
    includePreset = true,
  ): Promise<void> {
    if (includePreset) await ensureDir(path.join(tmpDir, "preset"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `tools = [${tools.map((tool) => `"${tool}"`).join(", ")}]
${includePreset ? 'extends = ["fs:./preset"]' : ""}
`,
    );
  }

  async function createPresetSkill(
    name: string,
    extras: Record<string, string> = {},
  ): Promise<void> {
    const directory = path.join(tmpDir, "preset", "skills", name);
    await outputFile(
      path.join(directory, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name}\n---\n# ${name}`,
    );
    for (const [relativePath, content] of Object.entries(extras)) {
      await outputFile(path.join(directory, relativePath), content);
    }
  }

  async function createCanonicalFiles(): Promise<void> {
    const fixtures = new Map<string, string>([
      ["AGENTS.md", "# Project instructions\n"],
      [
        ".agents/skills/review/SKILL.md",
        "---\nname: review\ndescription: Review changes\n---\n# Review\n",
      ],
      [
        ".agents/commands/review.md",
        "---\ndescription: Review changes\n---\n# Review\n",
      ],
      [
        ".agents/agents/reviewer.md",
        "---\nname: reviewer\ndescription: Review changes\n---\n# Reviewer\n",
      ],
    ]);
    await Promise.all(
      [...fixtures].map(([relativePath, content]) =>
        outputFile(path.join(tmpDir, relativePath), content),
      ),
    );
  }

  async function writeUserFiles(
    relativePaths: readonly string[],
  ): Promise<void> {
    await Promise.all(
      relativePaths.map((relativePath) =>
        outputFile(path.join(tmpDir, relativePath), "# User file\n"),
      ),
    );
  }

  async function expectFiles(
    relativePaths: readonly string[],
    exists: boolean,
  ): Promise<void> {
    for (const relativePath of relativePaths) {
      expect(
        await pathExists(path.join(tmpDir, relativePath)),
        relativePath,
      ).toBe(exists);
    }
  }

  async function run(
    tool?: ToolName,
  ): Promise<Awaited<ReturnType<typeof executeSyncPlan>>> {
    const plan = await buildSyncPlan({ cwd: tmpDir, tool });
    return executeSyncPlan(plan, { cwd: tmpDir, filtered: tool !== undefined });
  }

  async function withExternalLinkFixture(
    assertion: (fixture: {
      plan: Awaited<ReturnType<typeof buildSyncPlan>>;
      source: string;
      destination: string;
      relativeDestination: string;
    }) => Promise<void>,
  ): Promise<void> {
    const externalRoot = await mkdtemp(
      path.join(tmpdir(), "agentsync-preset-external-"),
    );
    try {
      const preset = path.join(externalRoot, "preset");
      const source = path.join(
        preset,
        "skills",
        "review",
        "references",
        "checklist.md",
      );
      await outputFile(
        path.join(preset, "skills", "review", "SKILL.md"),
        "---\nname: review\ndescription: review\n---\n# Review",
      );
      await outputFile(source, "# Checklist\n");
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        `tools = ["cursor"]\nextends = ["fs:${preset}"]\n`,
      );
      await assertion({
        plan: await buildSyncPlan({ cwd: tmpDir }),
        source,
        destination: path.join(
          tmpDir,
          ".cursor",
          "skills",
          "preset--review",
          "references",
          "checklist.md",
        ),
        relativeDestination:
          ".cursor/skills/preset--review/references/checklist.md",
      });
    } finally {
      await rm(externalRoot, { recursive: true, force: true });
    }
  }

  it("records every generated support file for Codex and Cursor", async () => {
    await configure(["codex", "cursor"]);
    await createPresetSkill("review", {
      "references/checklist.md": "# Checklist",
      "scripts/check.sh": "#!/bin/sh",
    });

    await run();

    const manifest = await readManifest(tmpDir);
    for (const tool of ["codex", "cursor"] as const) {
      expect(manifest?.owners?.[tool]).toEqual([
        `.${tool}/skills/preset--review/SKILL.md`,
        `.${tool}/skills/preset--review/references/checklist.md`,
        `.${tool}/skills/preset--review/scripts/check.sh`,
      ]);
    }
  });

  it.runIf(process.platform !== "win32")(
    "reuses a current receipt-owned --link output",
    async () => {
      await withExternalLinkFixture(
        async ({ destination, plan, relativeDestination, source }) => {
          await executeSyncPlan(plan, { cwd: tmpDir, link: true });
          expect(
            (await readManifest(tmpDir))?.symlink_targets[relativeDestination],
          ).toBe(source);

          await executeSyncPlan(plan, { cwd: tmpDir, link: true });

          expect((await lstat(destination)).isSymbolicLink()).toBe(true);
          expect(
            path.resolve(
              path.dirname(destination),
              await readlink(destination),
            ),
          ).toBe(source);
          expect(await readFile(destination, "utf-8")).toBe("# Checklist\n");
        },
      );
    },
  );

  it.runIf(process.platform !== "win32")(
    "materializes an unchanged receipt-owned link in copy mode",
    async () => {
      await withExternalLinkFixture(
        async ({ destination, plan, relativeDestination }) => {
          await executeSyncPlan(plan, { cwd: tmpDir, link: true });

          await executeSyncPlan(plan, { cwd: tmpDir });

          expect((await lstat(destination)).isFile()).toBe(true);
          expect(
            (await readManifest(tmpDir))?.symlink_targets[relativeDestination],
          ).toBeUndefined();
          expect(await readFile(destination, "utf-8")).toBe("# Checklist\n");
        },
      );
    },
  );

  it.runIf(process.platform !== "win32")(
    "cleans an unchanged receipt-owned link without touching its target",
    async () => {
      await withExternalLinkFixture(async ({ destination, plan, source }) => {
        await executeSyncPlan(plan, { cwd: tmpDir, link: true });

        await cleanCommand({ cwd: tmpDir });

        expect(await pathExists(destination)).toBe(false);
        expect(await readFile(source, "utf-8")).toBe("# Checklist\n");
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "refuses a current receipt-owned link retargeted to equal content",
    async () => {
      await withExternalLinkFixture(async ({ destination, plan, source }) => {
        await executeSyncPlan(plan, { cwd: tmpDir, link: true });
        const replacement = path.join(path.dirname(source), "replacement.md");
        await outputFile(replacement, "# Checklist\n");
        await rm(destination);
        await symlink(replacement, destination);

        await expect(
          executeSyncPlan(plan, { cwd: tmpDir, link: true }),
        ).rejects.toThrow("Refusing to overwrite modified shared output");

        expect(await readlink(destination)).toBe(replacement);
        expect(await readFile(source, "utf-8")).toBe("# Checklist\n");
      });
    },
  );

  it("preserves unselected ownership and its old hash on filtered sync", async () => {
    await configure(["codex", "cursor"]);
    await createPresetSkill("review");
    await run();
    const cursorOutput = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "preset--review",
      "SKILL.md",
    );
    const cursorRelative = ".cursor/skills/preset--review/SKILL.md";
    const before = await readManifest(tmpDir);
    await outputFile(cursorOutput, "# edited outside AgentSync");

    await run("codex");

    const after = await readManifest(tmpDir);
    expect(after?.owners?.cursor).toEqual(before?.owners?.cursor);
    expect(after?.files[cursorRelative]).toBe(before?.files[cursorRelative]);
    expect(after?.files[cursorRelative]).not.toBe(await hashFile(cursorOutput));
  });

  it("removes unchanged stale files exactly and keeps manual siblings", async () => {
    await configure(["cursor"]);
    await createPresetSkill("review", {
      "references/checklist.md": "# Checklist",
    });
    await createPresetSkill("keep");
    await run();
    const staleDirectory = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "preset--review",
    );
    const manual = path.join(staleDirectory, "notes.md");
    await outputFile(manual, "manual");
    await rm(path.join(tmpDir, "preset", "skills", "review"), {
      recursive: true,
    });

    await run();

    expect(await pathExists(path.join(staleDirectory, "SKILL.md"))).toBe(false);
    expect(
      await pathExists(path.join(staleDirectory, "references", "checklist.md")),
    ).toBe(false);
    expect(await readFile(manual, "utf-8")).toBe("manual");
    expect((await readManifest(tmpDir))?.owners?.cursor).not.toEqual(
      expect.arrayContaining([".cursor/skills/preset--review/SKILL.md"]),
    );
  });

  it("preserves but relinquishes a modified stale output", async () => {
    await configure(["cursor"]);
    await createPresetSkill("review");
    await run();
    const stale = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "preset--review",
      "SKILL.md",
    );
    await outputFile(stale, "# edited stale output");
    await rm(path.join(tmpDir, "preset", "skills", "review"), {
      recursive: true,
    });

    const result = await run();

    expect(await readFile(stale, "utf-8")).toBe("# edited stale output");
    expect(result.warnings).toEqual([
      expect.stringContaining("preserved stale modified output"),
    ]);
    expect((await readManifest(tmpDir))?.owners?.cursor).toBeUndefined();
  });

  it("reconciles shared ownership for a tool removed before a full sync", async () => {
    await configure(["cursor"]);
    await createPresetSkill("review");
    await run();
    const cursorOutput = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "preset--review",
      "SKILL.md",
    );
    await configure(["codex"]);

    await run();

    expect(await pathExists(cursorOutput)).toBe(false);
    expect((await readManifest(tmpDir))?.owners?.cursor).toBeUndefined();
    expect((await readManifest(tmpDir))?.owners?.codex).toContain(
      ".codex/skills/preset--review/SKILL.md",
    );
  });

  it("refuses to overwrite an unowned shared output", async () => {
    await configure(["cursor"]);
    await createPresetSkill("review");
    const manual = path.join(
      tmpDir,
      ".cursor",
      "skills",
      "preset--review",
      "SKILL.md",
    );
    await outputFile(manual, "# manual");

    await expect(run()).rejects.toThrow("Refusing to overwrite unowned");

    expect(await readFile(manual, "utf-8")).toBe("# manual");
  });

  it.runIf(process.platform !== "win32")(
    "refuses a receipt-owned leaf replaced by an in-project same-content symlink",
    async () => {
      await configure(["cursor"]);
      await createPresetSkill("review");
      await run();
      const destination = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "preset--review",
        "SKILL.md",
      );
      const target = path.join(tmpDir, "manual-target.md");
      const original = await readFile(destination, "utf-8");
      await outputFile(target, original);
      await rm(destination);
      await symlink(target, destination);

      await expect(run()).rejects.toThrow("Refusing to overwrite unsafe");

      expect(await readFile(target, "utf-8")).toBe(original);
    },
  );

  it("refuses a shared root symlink that escapes the project", async () => {
    const external = await mkdtemp(
      path.join(tmpdir(), "agentsync-ownership-external-"),
    );
    try {
      await configure(["cursor"]);
      await createPresetSkill("review");
      await ensureDir(path.join(tmpDir, ".cursor"));
      await symlink(external, path.join(tmpDir, ".cursor", "skills"));

      await expect(run()).rejects.toThrow("Refusing to overwrite unsafe");

      expect(await pathExists(path.join(external, "preset--review"))).toBe(
        false,
      );
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a hand-authored Claude instruction file", async () => {
    await configure(["claude"], false);
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Canonical\n");
    const command = path.join(tmpDir, ".agents", "commands", "probe.md");
    await outputFile(command, "---\ndescription: Probe\n---\n# Probe\n");
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    await outputFile(claudeMd, "# Manual Claude instructions\n");

    await expect(run()).rejects.toThrow("Refusing to overwrite unowned");

    expect(await readFile(claudeMd, "utf-8")).toBe(
      "# Manual Claude instructions\n",
    );
    expect(
      await pathExists(path.join(tmpDir, ".claude", "commands", "probe.md")),
    ).toBe(false);
  });

  it.each([
    ["claude", ".claude/rules/review.md"],
    ["cursor", ".cursor/rules/review.mdc"],
  ] as const)(
    "refuses to overwrite a hand-authored %s rule",
    async (tool, relativeOutput) => {
      await configure([tool], false);
      await outputFile(
        path.join(tmpDir, ".agents", "rules", "review.md"),
        "# Canonical review rule\n",
      );
      const output = path.join(tmpDir, relativeOutput);
      await outputFile(output, "# Manual provider rule\n");

      await expect(run()).rejects.toThrow("Refusing to overwrite unowned");

      expect(await readFile(output, "utf-8")).toBe("# Manual provider rule\n");
    },
  );

  it("records and withdraws unchanged generated docs and file rules exactly", async () => {
    await configure(["claude", "cursor"], false);
    const canonicalDocs = path.join(tmpDir, "AGENTS.md");
    const canonicalRule = path.join(tmpDir, ".agents", "rules", "review.md");
    await outputFile(canonicalDocs, "# Project instructions\n");
    await outputFile(canonicalRule, "# Review carefully\n");

    await run();

    expect((await readManifest(tmpDir))?.owners).toMatchObject({
      claude: [".claude/rules/review.md", "CLAUDE.md"],
      cursor: [".cursor/rules/review.mdc"],
    });
    const manualClaudeRule = path.join(tmpDir, ".claude", "rules", "manual.md");
    const manualCursorRule = path.join(
      tmpDir,
      ".cursor",
      "rules",
      "manual.mdc",
    );
    await outputFile(manualClaudeRule, "# Manual\n");
    await outputFile(manualCursorRule, "# Manual\n");
    await Promise.all([rm(canonicalDocs), rm(canonicalRule)]);

    await run();

    for (const relativePath of [
      "CLAUDE.md",
      ".claude/rules/review.md",
      ".cursor/rules/review.mdc",
    ]) {
      expect(await pathExists(path.join(tmpDir, relativePath))).toBe(false);
    }
    expect(await pathExists(manualClaudeRule)).toBe(true);
    expect(await pathExists(manualCursorRule)).toBe(true);
    expect((await readManifest(tmpDir))?.owners).toEqual({});
  });

  it("preserves modified stale docs and rules while relinquishing ownership", async () => {
    await configure(["claude", "cursor"], false);
    const canonicalDocs = path.join(tmpDir, "AGENTS.md");
    const canonicalRule = path.join(tmpDir, ".agents", "rules", "style.md");
    await outputFile(canonicalDocs, "# Project instructions\n");
    await outputFile(canonicalRule, "# Canonical style\n");
    await run();
    const modifiedDocs = path.join(tmpDir, "CLAUDE.md");
    const modifiedRule = path.join(tmpDir, ".cursor", "rules", "style.mdc");
    await outputFile(modifiedDocs, "# User-maintained Claude instructions\n");
    await outputFile(modifiedRule, "# User-maintained Cursor rule\n");
    await Promise.all([rm(canonicalDocs), rm(canonicalRule)]);

    const result = await run();

    expect(await readFile(modifiedDocs, "utf-8")).toContain("User-maintained");
    expect(await readFile(modifiedRule, "utf-8")).toContain("User-maintained");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "[claude] preserved stale modified output CLAUDE.md",
        ),
        expect.stringContaining(
          "[cursor] preserved stale modified output .cursor/rules/style.mdc",
        ),
      ]),
    );
    expect((await readManifest(tmpDir))?.owners).toEqual({});
  });

  it("withdraws generated docs and rules after the last tool is removed", async () => {
    await configure(["claude"], false);
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Instructions\n");
    await outputFile(
      path.join(tmpDir, ".agents", "rules", "review.md"),
      "# Review\n",
    );
    await run();
    await configure([], false);

    await run();

    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(
      await pathExists(path.join(tmpDir, ".claude", "rules", "review.md")),
    ).toBe(false);
    expect((await readManifest(tmpDir))?.owners).toEqual({});
  });

  it("clean removes only unchanged receipt-owned docs and rules", async () => {
    await configure(["claude", "cursor"], false);
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Instructions\n");
    await outputFile(
      path.join(tmpDir, ".agents", "rules", "review.md"),
      "# Review\n",
    );
    await run();
    const manual = path.join(tmpDir, ".cursor", "rules", "manual.mdc");
    await outputFile(manual, "# Manual\n");

    await cleanCommand({ cwd: tmpDir });

    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(
      await pathExists(path.join(tmpDir, ".claude", "rules", "review.md")),
    ).toBe(false);
    expect(
      await pathExists(path.join(tmpDir, ".cursor", "rules", "review.mdc")),
    ).toBe(false);
    expect(await readFile(manual, "utf-8")).toBe("# Manual\n");
  });

  it("clean preserves modified receipt-owned docs and rules with warnings", async () => {
    await configure(["claude", "cursor"], false);
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Instructions\n");
    await outputFile(
      path.join(tmpDir, ".agents", "rules", "review.md"),
      "# Review\n",
    );
    await run();
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    const cursorRule = path.join(tmpDir, ".cursor", "rules", "review.mdc");
    await outputFile(claudeMd, "# Edited docs\n");
    await outputFile(cursorRule, "# Edited rule\n");

    const results = await cleanCommand({ cwd: tmpDir });

    expect(await readFile(claudeMd, "utf-8")).toBe("# Edited docs\n");
    expect(await readFile(cursorRule, "utf-8")).toBe("# Edited rule\n");
    expect(results.flatMap((result) => result.warnings)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("CLAUDE.md is modified"),
        expect.stringContaining(".cursor/rules/review.mdc is modified"),
      ]),
    );
    expect((await readManifest(tmpDir))?.owners).toEqual({});
  });

  it("dry-run reports modified stale docs without changing files or receipts", async () => {
    await configure(["claude"], false);
    const canonicalDocs = path.join(tmpDir, "AGENTS.md");
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    await outputFile(canonicalDocs, "# Instructions\n");
    await run();
    await outputFile(claudeMd, "# User-maintained\n");
    await rm(canonicalDocs);
    const manifestPath = getManifestPath(tmpDir);
    const manifestBefore = await readFile(manifestPath, "utf-8");
    const plan = await buildSyncPlan({ cwd: tmpDir });

    const warnings = await previewSharedOutputLifecycle(
      plan,
      tmpDir,
      await readManifest(tmpDir),
      false,
    );

    expect(warnings).toEqual([
      expect.stringContaining(
        "[claude] would preserve stale modified output CLAUDE.md",
      ),
    ]);
    expect(await readFile(claudeMd, "utf-8")).toBe("# User-maintained\n");
    expect(await readFile(manifestPath, "utf-8")).toBe(manifestBefore);
  });

  it("owns Gemini's generated instruction file as one exact root file", async () => {
    await configure(["gemini"], false);
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Instructions\n");

    await run();

    expect((await readManifest(tmpDir))?.owners?.gemini).toEqual(["GEMINI.md"]);
  });

  it.each(NON_RELEASE_FILE_LIFECYCLES)(
    "$tool withdraws every unchanged generated file and preserves user neighbors",
    async ({ tool, generatedFiles, userFiles }) => {
      await configure([tool], false);
      await createCanonicalFiles();
      await writeUserFiles(userFiles);

      await run();

      expect((await readManifest(tmpDir))?.owners?.[tool]).toEqual(
        [...generatedFiles].sort(),
      );
      await expectFiles(generatedFiles, true);
      await configure([], false);
      await run();

      await expectFiles(generatedFiles, false);
      await expectFiles(userFiles, true);
      await expectFiles(CANONICAL_FILES, true);
      expect((await readManifest(tmpDir))?.owners?.[tool]).toBeUndefined();
    },
  );

  it.each(NON_RELEASE_FILE_LIFECYCLES)(
    "$tool clean removes exact generated files and preserves user neighbors",
    async ({ tool, generatedFiles, userFiles }) => {
      await configure([tool], false);
      await createCanonicalFiles();
      await writeUserFiles(userFiles);
      await run();

      await cleanCommand({ cwd: tmpDir });

      await expectFiles(generatedFiles, false);
      await expectFiles(userFiles, true);
      await expectFiles(CANONICAL_FILES, true);
      expect((await readManifest(tmpDir))?.owners?.[tool]).toBeUndefined();
    },
  );
});
