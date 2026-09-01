import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanCommand } from "../../../src/commands/clean.js";
import {
  executeSyncPlan,
  previewSharedOutputLifecycle,
} from "../../../src/sync/execute.js";
import {
  previewExtensions,
  syncExtensions,
} from "../../../src/sync/extensions.js";
import { getManifestPath, readManifest } from "../../../src/sync/manifest.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";

vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

type HookTool = "claude" | "cursor";

interface HookCase {
  destination: string;
  manualSibling: string;
  settings: string;
  tool: HookTool;
}

const HOOK_CASES: HookCase[] = [
  {
    tool: "claude",
    destination: ".claude/hooks/scripts/audit.sh",
    manualSibling: ".claude/hooks/scripts/manual.sh",
    settings: ".claude/settings.json",
  },
  {
    tool: "cursor",
    destination: ".cursor/hooks/audit.sh",
    manualSibling: ".cursor/hooks/manual.sh",
    settings: ".cursor/hooks.json",
  },
];

const HOOK_SOURCE = ".agents/hooks/scripts/audit.sh";
const HOOK_BODY = "#!/bin/sh\necho audit\n";

function hookConfig(tools: HookTool[], withHook: boolean): string {
  const toolList = tools.map((tool) => `"${tool}"`).join(", ");
  const hook = withHook
    ? [
        "",
        "[[hooks.PreToolUse]]",
        'id = "audit"',
        'matcher = "Bash"',
        `command = "${HOOK_SOURCE}"`,
      ].join("\n")
    : "";
  return `tools = [${toolList}]${hook}\n`;
}

describe("extension file ownership", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-extension-files-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function configure(
    tools: HookTool[],
    withHook: boolean,
  ): Promise<void> {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      hookConfig(tools, withHook),
    );
  }

  async function writeHookSource(): Promise<void> {
    await outputFile(path.join(project, HOOK_SOURCE), HOOK_BODY);
  }

  async function run(tool?: HookTool) {
    const plan = await buildSyncPlan({ cwd: project, tool });
    return executeSyncPlan(plan, {
      cwd: project,
      filtered: tool !== undefined,
    });
  }

  it.each(
    HOOK_CASES,
  )("$tool records the exact hook artifact and permits unchanged resync", async ({
    tool,
    destination,
  }) => {
    await configure([tool], true);
    await writeHookSource();

    await run();
    await expect(run()).resolves.toBeDefined();
    await rm(path.join(project, destination));
    await expect(run()).resolves.toBeDefined();

    expect((await readManifest(project))?.owners?.[tool]).toContain(
      destination,
    );
    expect(await pathExists(path.join(project, destination))).toBe(true);
  });

  it.each(
    HOOK_CASES,
  )("$tool refuses an occupied unowned hook artifact even with identical bytes", async ({
    tool,
    destination,
  }) => {
    await configure([tool], true);
    await writeHookSource();
    await outputFile(path.join(project, destination), HOOK_BODY);

    await expect(run()).rejects.toThrow("Refusing to overwrite unowned");

    expect(await readFile(path.join(project, destination), "utf-8")).toBe(
      HOOK_BODY,
    );
  });

  it.each(
    HOOK_CASES,
  )("$tool rejects ambiguous hook destinations before writing", async ({
    tool,
    destination,
    settings,
  }) => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      [
        `tools = ["${tool}"]`,
        "",
        "[[hooks.PreToolUse]]",
        'id = "canonical"',
        'command = ".agents/hooks/scripts/scripts/audit.sh"',
        "",
        "[[hooks.PostToolUse]]",
        'id = "project"',
        'command = "scripts/audit.sh"',
      ].join("\n"),
    );
    await outputFile(
      path.join(project, ".agents/hooks/scripts/scripts/audit.sh"),
      "#!/bin/sh\necho canonical\n",
    );
    await outputFile(
      path.join(project, "scripts/audit.sh"),
      "#!/bin/sh\necho project\n",
    );

    await expect(run()).rejects.toThrow(
      "resolve to the same generated destination",
    );

    expect(
      await pathExists(
        path.join(project, path.dirname(destination), "scripts/audit.sh"),
      ),
    ).toBe(false);
    expect(await pathExists(path.join(project, settings))).toBe(false);
    expect(await readManifest(project)).toBeUndefined();
  });

  it.each(
    HOOK_CASES,
  )("$tool refuses to overwrite a modified receipt-owned hook artifact", async ({
    tool,
    destination,
  }) => {
    await configure([tool], true);
    await writeHookSource();
    await run();
    await outputFile(path.join(project, destination), "# user edit\n");

    await expect(run()).rejects.toThrow("Refusing to overwrite modified");

    expect(await readFile(path.join(project, destination), "utf-8")).toBe(
      "# user edit\n",
    );
  });

  it.each(
    HOOK_CASES,
  )("$tool removes an unchanged stale artifact and keeps manual siblings", async ({
    tool,
    destination,
    manualSibling,
  }) => {
    await configure([tool], true);
    await writeHookSource();
    await run();
    await outputFile(path.join(project, manualSibling), "# manual\n");
    await configure([tool], false);

    await run();

    expect(await pathExists(path.join(project, destination))).toBe(false);
    expect(await readFile(path.join(project, manualSibling), "utf-8")).toBe(
      "# manual\n",
    );
  });

  it.each(
    HOOK_CASES,
  )("$tool preserves and relinquishes a modified stale artifact", async ({
    tool,
    destination,
  }) => {
    await configure([tool], true);
    await writeHookSource();
    await run();
    await outputFile(path.join(project, destination), "# user edit\n");
    await configure([tool], false);

    const result = await run();

    expect(await readFile(path.join(project, destination), "utf-8")).toBe(
      "# user edit\n",
    );
    expect(result.warnings).toEqual([
      expect.stringContaining(`preserved stale modified output ${destination}`),
    ]);
    expect((await readManifest(project))?.owners?.[tool]).toBeUndefined();
  });

  it("reports only existing-source Claude artifacts in preview and real results", async () => {
    const existingHook = path.join(project, HOOK_SOURCE);
    const existingStatus = path.join(project, ".agents/status/branch.sh");
    const existingStyle = path.join(project, ".agents/styles/terse.md");
    await outputFile(existingHook, HOOK_BODY);
    await outputFile(existingStatus, "#!/bin/sh\necho main\n");
    await outputFile(existingStyle, "# Terse\n");
    const input = {
      hooks: {
        PreToolUse: [{ id: "audit", matcher: "Bash", command: HOOK_SOURCE }],
      },
      statusline: {
        items: ["model"],
        custom_items: [
          { id: "branch", command: ".agents/status/branch.sh" },
          { id: "missing", command: ".agents/status/missing.sh" },
        ],
      },
      outputStyle: {
        custom: [
          { name: "Terse", file: ".agents/styles/terse.md" },
          { name: "Missing", file: ".agents/styles/missing.md" },
        ],
      },
    };
    const provider = getToolProvider("claude");

    const [preview] = await previewExtensions([provider], input, project);
    const [actual] = await syncExtensions([provider], input, project);

    expect(actual.generatedFiles.sort()).toEqual(preview.generatedFiles.sort());
    expect(
      actual.generatedFiles.map((file) => path.relative(project, file)),
    ).toEqual([
      ".claude/hooks/scripts/audit.sh",
      ".claude/output-styles/Terse.md",
      ".claude/statusline/custom/branch.sh",
      ".claude/statusline/render.sh",
    ]);
    expect(actual.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("statusline custom_item missing"),
        expect.stringContaining("output_style custom Missing"),
      ]),
    );
  });

  it("refuses an unowned exact Claude statusline renderer", async () => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["claude"]\n\n[statusline]\nitems = ["model"]\n',
    );
    const renderer = path.join(project, ".claude", "statusline", "render.sh");
    await outputFile(renderer, "# manual renderer\n");

    await expect(run()).rejects.toThrow("Refusing to overwrite unowned");

    expect(await readFile(renderer, "utf-8")).toBe("# manual renderer\n");
  });

  it("withdraws source-missing artifacts while retaining the statusline renderer", async () => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      [
        'tools = ["claude"]',
        "",
        "[[hooks.PreToolUse]]",
        'id = "audit"',
        `command = "${HOOK_SOURCE}"`,
        "",
        "[statusline]",
        'items = ["model"]',
        "",
        "[[statusline.custom_items]]",
        'id = "branch"',
        'command = ".agents/status/branch.sh"',
        "",
        "[output_style]",
        "",
        "[[output_style.custom]]",
        'name = "Terse"',
        'file = ".agents/styles/terse.md"',
        "",
      ].join("\n"),
    );
    const sources = [
      path.join(project, HOOK_SOURCE),
      path.join(project, ".agents/status/branch.sh"),
      path.join(project, ".agents/styles/terse.md"),
    ];
    await outputFile(sources[0], HOOK_BODY);
    await outputFile(sources[1], "#!/bin/sh\necho main\n");
    await outputFile(sources[2], "# Terse\n");
    await run();
    await Promise.all(sources.map((source) => rm(source)));

    const result = await run();

    for (const stale of [
      ".claude/hooks/scripts/audit.sh",
      ".claude/statusline/custom/branch.sh",
      ".claude/output-styles/Terse.md",
    ]) {
      expect(await pathExists(path.join(project, stale))).toBe(false);
    }
    expect(
      await pathExists(path.join(project, ".claude/statusline/render.sh")),
    ).toBe(true);
    expect((await readManifest(project))?.owners?.claude).toEqual([
      ".claude/statusline/render.sh",
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("statusline custom_item branch"),
        expect.stringContaining("output_style custom Terse"),
      ]),
    );
  });

  it("preserves unselected artifacts, then withdraws them on zero-tool sync", async () => {
    await configure(["claude", "cursor"], true);
    await writeHookSource();
    await run();
    await rm(path.join(project, HOOK_SOURCE));

    await run("claude");

    expect(
      await pathExists(path.join(project, ".claude/hooks/scripts/audit.sh")),
    ).toBe(false);
    expect(await pathExists(path.join(project, ".cursor/hooks/audit.sh"))).toBe(
      true,
    );
    expect((await readManifest(project))?.owners?.cursor).toContain(
      ".cursor/hooks/audit.sh",
    );

    await configure([], false);
    await run();

    expect(await pathExists(path.join(project, ".cursor/hooks/audit.sh"))).toBe(
      false,
    );
  });

  it.each(
    HOOK_CASES,
  )("$tool dry-run reports modified stale artifacts without mutation", async ({
    tool,
    destination,
  }) => {
    await configure([tool], true);
    await writeHookSource();
    await run();
    await outputFile(path.join(project, destination), "# user edit\n");
    await configure([tool], false);
    const manifestPath = getManifestPath(project);
    const manifestBefore = await readFile(manifestPath, "utf-8");
    const plan = await buildSyncPlan({ cwd: project });

    const warnings = await previewSharedOutputLifecycle(
      plan,
      project,
      await readManifest(project),
      false,
    );

    expect(warnings).toEqual([
      expect.stringContaining(
        `would preserve stale modified output ${destination}`,
      ),
    ]);
    expect(await readFile(path.join(project, destination), "utf-8")).toBe(
      "# user edit\n",
    );
    expect(await readFile(manifestPath, "utf-8")).toBe(manifestBefore);
  });

  it("clean removes unchanged extension artifacts without touching siblings", async () => {
    await configure(["claude", "cursor"], true);
    await writeHookSource();
    await run();
    const siblings = [
      path.join(project, ".claude/hooks/scripts/manual.sh"),
      path.join(project, ".cursor/hooks/manual.sh"),
    ];
    await outputFile(siblings[0], "# manual\n");
    await outputFile(siblings[1], "# manual\n");

    await cleanCommand({ cwd: project });

    expect(
      await pathExists(path.join(project, ".claude/hooks/scripts/audit.sh")),
    ).toBe(false);
    expect(await pathExists(path.join(project, ".cursor/hooks/audit.sh"))).toBe(
      false,
    );
    for (const sibling of siblings) {
      expect(await readFile(sibling, "utf-8")).toBe("# manual\n");
    }
  });
});
