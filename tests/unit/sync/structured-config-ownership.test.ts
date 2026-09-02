import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanCommand } from "../../../src/commands/clean.js";
import type { ToolName } from "../../../src/constants.js";
import { executeSyncPlan } from "../../../src/sync/execute.js";
import {
  getManifestPath,
  readManifest,
  SyncManifestSchema,
} from "../../../src/sync/manifest.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { loadCanonicalRules } from "../../../src/sync/rules.js";
import { applyStructuredLifecyclePlan } from "../../../src/sync/structured-lifecycle.js";
import { planToolStructuredLifecycle } from "../../../src/sync/structured-providers.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  outputFile,
  pathExists,
  readJsonValidated,
} from "../../../src/utils/fs.js";

vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

type StructuredTool = "claude" | "cursor" | "opencode";

interface PermissionCase {
  tool: StructuredTool;
  configPath: string;
  key: string;
  projected: unknown;
}

const PERMISSION_CASES: PermissionCase[] = [
  {
    tool: "claude",
    configPath: ".claude/settings.json",
    key: "permissions",
    projected: { allow: [], ask: [], deny: [], defaultMode: "default" },
  },
  {
    tool: "cursor",
    configPath: ".cursor/cli.json",
    key: "permissions",
    projected: { allow: [], deny: [] },
  },
  {
    tool: "opencode",
    configPath: "opencode.json",
    key: "permission",
    projected: { "*": "ask" },
  },
];

function configToml(
  tools: readonly StructuredTool[],
  options: { permissions?: boolean; hook?: boolean; statusline?: boolean } = {},
): string {
  const lines = [`tools = [${tools.map((tool) => `"${tool}"`).join(", ")}]`];
  if (options.permissions) lines.push("", "[permissions]", 'default = "ask"');
  if (options.hook) {
    lines.push(
      "",
      "[[hooks.PreToolUse]]",
      'id = "audit"',
      'matcher = "Bash"',
      'command = ".agents/hooks/scripts/audit.sh"',
    );
  }
  if (options.statusline) {
    lines.push("", "[statusline]", 'items = ["model"]');
  }
  return `${lines.join("\n")}\n`;
}

describe("provider structured config ownership", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-structured-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function configure(content: string): Promise<void> {
    await outputFile(path.join(project, ".agents", "agentsync.toml"), content);
  }

  async function run(tool?: ToolName) {
    const plan = await buildSyncPlan({ cwd: project, tool });
    return executeSyncPlan(plan, {
      cwd: project,
      filtered: tool !== undefined,
    });
  }

  async function readConfig(relativePath: string) {
    return readJsonValidated(
      path.join(project, relativePath),
      ToolSettingsSchema,
    );
  }

  async function writeConfig(
    relativePath: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    await outputFile(
      path.join(project, relativePath),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }

  it.each(PERMISSION_CASES)(
    "$tool rejects an occupied desired key even when its value is identical",
    async ({ tool, configPath, key, projected }) => {
      await configure(configToml([tool], { permissions: true }));
      await writeConfig(configPath, { manual: true, [key]: projected });

      await expect(run()).rejects.toThrow(/occupied key has no prior/);

      expect((await readConfig(configPath))[key]).toEqual(projected);
      expect(await readManifest(project)).toBeUndefined();
    },
  );

  it.each(PERMISSION_CASES)(
    "$tool permits unchanged resync and rejects a modified desired key",
    async ({ tool, configPath, key }) => {
      await configure(configToml([tool], { permissions: true }));
      await writeConfig(configPath, { manual: true });

      await run();
      await expect(run()).resolves.toBeDefined();
      const modified = await readConfig(configPath);
      modified[key] = { user: "edit" };
      await writeConfig(configPath, modified);

      await expect(run()).rejects.toThrow(/modified after the last successful/);
      expect((await readConfig(configPath))[key]).toEqual({ user: "edit" });
    },
  );

  it.each([
    {
      name: "top-level OpenCode MCP rules",
      rules: [
        { id: "wild", tool: "MCP", pattern: "github:*", decision: "allow" },
        {
          id: "exact",
          tool: "MCP",
          pattern: "github:search",
          decision: "deny",
        },
      ],
      keys: (permission: Record<string, unknown>) => Object.keys(permission),
    },
    {
      name: "nested OpenCode bash patterns",
      rules: [
        { id: "wild", tool: "Bash", pattern: "git *", decision: "allow" },
        {
          id: "exact",
          tool: "Bash",
          pattern: "git status",
          decision: "deny",
        },
      ],
      keys: (permission: Record<string, unknown>) =>
        Object.keys(z.record(z.string(), z.unknown()).parse(permission.bash)),
    },
  ])("preserves order semantics for $name", async ({ rules, keys }) => {
    const toml = (ordered: typeof rules) =>
      `${[
        'tools = ["opencode"]',
        "",
        "[permissions]",
        ...ordered.flatMap((rule) => [
          "",
          "[[permissions.rules]]",
          `id = "${rule.id}"`,
          `tool = "${rule.tool}"`,
          `pattern = "${rule.pattern}"`,
          `decision = "${rule.decision}"`,
        ]),
      ].join("\n")}\n`;
    const permissionSchema = z.record(z.string(), z.unknown());
    await configure(toml(rules));
    await run();
    await expect(run()).resolves.toBeDefined();
    const first = permissionSchema.parse(
      (await readConfig("opencode.json")).permission,
    );
    const firstOrder = keys(first);

    await configure(toml([...rules].reverse()));
    await run();
    const reversed = permissionSchema.parse(
      (await readConfig("opencode.json")).permission,
    );
    expect(keys(reversed)).toEqual([...firstOrder].reverse());

    const manuallyReordered = await readConfig("opencode.json");
    manuallyReordered.permission = first;
    await writeConfig("opencode.json", manuallyReordered);
    await expect(run()).rejects.toThrow(/modified after the last successful/);
  });

  it.each(
    PERMISSION_CASES.flatMap((testCase) =>
      (["unchanged", "missing", "modified"] as const).map((state) => ({
        ...testCase,
        state,
      })),
    ),
  )(
    "$tool withdraws $state prior ownership safely",
    async ({ tool, configPath, key, state }) => {
      await configure(configToml([tool], { permissions: true }));
      await writeConfig(configPath, { manual: true });
      await run();

      if (state !== "unchanged") {
        const current = await readConfig(configPath);
        if (state === "missing") delete current[key];
        else current[key] = { user: "edit" };
        await writeConfig(configPath, current);
      }
      await configure(configToml([tool]));

      const result = await run();
      const config = await readConfig(configPath);
      if (state === "modified") {
        expect(config[key]).toEqual({ user: "edit" });
        expect(result.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining(`preserved modified key "${key}"`),
          ]),
        );
      } else {
        expect(config).not.toHaveProperty(key);
        expect(result.warnings).toEqual([]);
      }
      expect(config.manual).toBe(true);
      expect(
        (await readManifest(project))?.structured_owners?.[tool],
      ).toBeUndefined();
    },
  );

  it("preserves unselected receipts, then full and zero-tool sync withdraw prior owners", async () => {
    const tools: StructuredTool[] = ["claude", "cursor", "opencode"];
    await configure(configToml(tools, { permissions: true }));
    await run();
    await configure(configToml(tools));

    await run("claude");

    expect(await pathExists(path.join(project, ".claude/settings.json"))).toBe(
      false,
    );
    expect(await pathExists(path.join(project, ".cursor/cli.json"))).toBe(true);
    expect(await pathExists(path.join(project, "opencode.json"))).toBe(true);
    expect(
      Object.keys((await readManifest(project))?.structured_owners ?? {}),
    ).toEqual(["cursor", "opencode"]);

    await run();
    expect(await pathExists(path.join(project, ".cursor/cli.json"))).toBe(
      false,
    );
    expect(await pathExists(path.join(project, "opencode.json"))).toBe(false);

    await configure(configToml(tools, { permissions: true }));
    await run();
    await configure(configToml([]));
    await run();
    expect((await readManifest(project))?.structured_owners).toBeUndefined();
    for (const { configPath } of PERMISSION_CASES) {
      expect(await pathExists(path.join(project, configPath))).toBe(false);
    }
  });

  it("uses the same provider projection for dry-run without changing config or receipts", async () => {
    await configure(configToml(["claude"], { permissions: true }));
    await run();
    await configure(configToml(["claude"]));
    const plan = await buildSyncPlan({ cwd: project });
    const manifestPath = getManifestPath(project);
    const configPath = path.join(project, ".claude/settings.json");
    const before = {
      config: await readFile(configPath, "utf-8"),
      manifest: await readFile(manifestPath, "utf-8"),
    };
    const { rules } = await loadCanonicalRules(project);
    const lifecycle = await planToolStructuredLifecycle({
      cwd: project,
      providers: plan.providers,
      previousReceipts: (await readManifest(project))?.structured_owners,
      desired: { extensions: plan.extensions, rules },
      preserveUnselected: false,
    });

    const applied = await applyStructuredLifecyclePlan(lifecycle, {
      dryRun: true,
    });

    expect(applied.plan.statePlan.configs[0]?.action).toBe("delete");
    expect(await readFile(configPath, "utf-8")).toBe(before.config);
    expect(await readFile(manifestPath, "utf-8")).toBe(before.manifest);
  });

  it("clean previews and then removes unchanged structured keys and receipts", async () => {
    await configure(
      configToml(["claude", "cursor", "opencode"], {
        permissions: true,
      }),
    );
    await run();
    const manifestBefore = await readFile(getManifestPath(project), "utf-8");

    const dryRun = await cleanCommand({ cwd: project, dryRun: true });
    expect(await readFile(getManifestPath(project), "utf-8")).toBe(
      manifestBefore,
    );
    for (const { tool, configPath } of PERMISSION_CASES) {
      expect(
        dryRun.find((result) => result.tool === tool)?.removedFiles,
      ).toContain(path.join(project, configPath));
    }
    const cleaned = await cleanCommand({ cwd: project });

    expect((await readManifest(project))?.structured_owners).toBeUndefined();
    for (const { tool, configPath } of PERMISSION_CASES) {
      expect(await pathExists(path.join(project, configPath))).toBe(false);
      expect(
        cleaned.find((result) => result.tool === tool)?.removedFiles,
      ).toContain(path.join(project, configPath));
    }
  });

  it("clean reports a shared config edited to remove its owned key", async () => {
    await configure(configToml(["claude"], { permissions: true }));
    const configPath = path.join(project, ".claude/settings.json");
    await writeConfig(".claude/settings.json", { manual: true });
    await run();

    const [result] = await cleanCommand({ cwd: project });

    expect(result.modifiedFiles).toContain(configPath);
    expect(result.removedFiles).not.toContain(configPath);
    expect(await readConfig(".claude/settings.json")).toEqual({ manual: true });
  });

  it("preflights every provider config before any projection write", async () => {
    await configure(configToml(["claude", "cursor"], { permissions: true }));
    await outputFile(
      path.join(project, ".agents", "commands", "review.md"),
      "---\ndescription: Review\n---\n# Review\n",
    );
    await outputFile(path.join(project, ".cursor", "cli.json"), "{broken");

    await expect(run()).rejects.toThrow(/Cannot safely inspect cursor/);

    expect(await pathExists(path.join(project, ".claude/settings.json"))).toBe(
      false,
    );
    expect(
      await pathExists(path.join(project, ".claude/commands/review.md")),
    ).toBe(false);
    expect(await pathExists(getManifestPath(project))).toBe(false);
  });

  it.each([
    {
      tool: "claude" as const,
      configPath: ".claude/settings.json",
      artifact: ".claude/hooks/scripts/audit.sh",
    },
    {
      tool: "cursor" as const,
      configPath: ".cursor/hooks.json",
      artifact: ".cursor/hooks/audit.sh",
    },
  ])(
    "$tool preserves dependent hook artifacts when a withdrawn key was modified",
    async ({ tool, configPath, artifact }) => {
      await configure(configToml([tool], { hook: true }));
      await outputFile(
        path.join(project, ".agents/hooks/scripts/audit.sh"),
        "#!/bin/sh\nexit 0\n",
      );
      await run();
      const current = await readConfig(configPath);
      current.hooks = { user: "edit" };
      await writeConfig(configPath, current);
      await configure(configToml([tool]));

      const result = await run();

      const preservedConfig = await readConfig(configPath);
      expect(preservedConfig.hooks).toEqual({ user: "edit" });
      if (tool === "cursor") expect(preservedConfig.version).toBe(1);
      expect(await pathExists(path.join(project, artifact))).toBe(true);
      expect((await readManifest(project))?.owners?.[tool]).toBeUndefined();
      expect(
        (await readManifest(project))?.structured_owners?.[tool],
      ).toBeUndefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('preserved modified key "hooks"'),
          expect.stringContaining(`preserved dependent output ${artifact}`),
        ]),
      );
    },
  );

  it("preserves the whole Cursor hooks config when only version was modified", async () => {
    await configure(configToml(["cursor"], { hook: true }));
    const artifact = path.join(project, ".cursor/hooks/audit.sh");
    await outputFile(
      path.join(project, ".agents/hooks/scripts/audit.sh"),
      "#!/bin/sh\nexit 0\n",
    );
    await run();
    const hooksPath = ".cursor/hooks.json";
    const current = await readConfig(hooksPath);
    current.version = 2;
    await writeConfig(hooksPath, current);
    await configure(configToml(["cursor"]));

    const result = await run();
    const preserved = await readConfig(hooksPath);

    expect(preserved.version).toBe(2);
    expect(preserved.hooks).toBeDefined();
    expect(await pathExists(artifact)).toBe(true);
    expect((await readManifest(project))?.owners?.cursor).toBeUndefined();
    expect(
      (await readManifest(project))?.structured_owners?.cursor,
    ).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('preserved modified key "version"'),
        expect.stringContaining(
          "preserved dependent output .cursor/hooks/audit.sh",
        ),
      ]),
    );
  });

  it("protects every Claude artifact group for an undeclared prior receipt", async () => {
    await configure(configToml(["claude"], { hook: true, statusline: true }));
    await outputFile(
      path.join(project, ".agents/hooks/scripts/audit.sh"),
      "#!/bin/sh\nexit 0\n",
    );
    await run();
    const manifest = await readManifest(project);
    const receipt =
      manifest?.structured_owners?.claude?.[".claude/settings.json"];
    expect(receipt).toBeDefined();
    const incompatible = SyncManifestSchema.parse({
      ...manifest,
      structured_owners: {
        ...manifest?.structured_owners,
        claude: { ".claude/other-settings.json": receipt },
      },
    });
    await outputFile(
      getManifestPath(project),
      `${JSON.stringify(incompatible, null, 2)}\n`,
    );
    await configure(configToml(["claude"]));

    const result = await run();

    for (const artifact of [
      ".claude/hooks/scripts/audit.sh",
      ".claude/statusline/render.sh",
    ]) {
      expect(await pathExists(path.join(project, artifact))).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`preserved dependent output ${artifact}`),
        ]),
      );
    }
    expect((await readManifest(project))?.owners?.claude).toBeUndefined();
    expect(
      (await readManifest(project))?.structured_owners?.claude,
    ).toBeUndefined();
  });

  it("does not rewrite or reacquire current artifacts for a modified withdrawal", async () => {
    const pragmaticSource = path.join(
      project,
      ".agents/output-styles/pragmatic.md",
    );
    const friendlySource = path.join(
      project,
      ".agents/output-styles/friendly-custom.md",
    );
    const pragmaticArtifact = path.join(
      project,
      ".claude/output-styles/pragmatic.md",
    );
    const friendlyArtifact = path.join(
      project,
      ".claude/output-styles/friendly-custom.md",
    );
    const outputStyleConfig = (withTone: boolean) =>
      `${[
        'tools = ["claude"]',
        "",
        "[output_style]",
        ...(withTone ? ['tone = "pragmatic"'] : []),
        "",
        "[[output_style.custom]]",
        'name = "pragmatic"',
        'file = ".agents/output-styles/pragmatic.md"',
        "",
        "[[output_style.custom]]",
        'name = "friendly-custom"',
        'file = ".agents/output-styles/friendly-custom.md"',
      ].join("\n")}\n`;
    await outputFile(pragmaticSource, "# Pragmatic v1\n");
    await outputFile(friendlySource, "# Friendly v1\n");
    await configure(outputStyleConfig(true));
    await run();
    const before = {
      pragmatic: await readFile(pragmaticArtifact, "utf-8"),
      friendly: await readFile(friendlyArtifact, "utf-8"),
    };
    const settings = await readConfig(".claude/settings.json");
    settings.outputStyle = "friendly-custom";
    await writeConfig(".claude/settings.json", settings);
    await outputFile(pragmaticSource, "# Pragmatic v2\n");
    await outputFile(friendlySource, "# Friendly v2\n");
    await configure(outputStyleConfig(false));

    const result = await run();

    expect(await readFile(pragmaticArtifact, "utf-8")).toBe(before.pragmatic);
    expect(await readFile(friendlyArtifact, "utf-8")).toBe(before.friendly);
    expect((await readConfig(".claude/settings.json")).outputStyle).toBe(
      "friendly-custom",
    );
    expect((await readManifest(project))?.owners?.claude).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('preserved modified key "outputStyle"'),
        expect.stringContaining("preserved output style artifacts"),
      ]),
    );

    await cleanCommand({ cwd: project });
    expect(await readFile(pragmaticArtifact, "utf-8")).toBe(before.pragmatic);
    expect(await readFile(friendlyArtifact, "utf-8")).toBe(before.friendly);
    expect((await readConfig(".claude/settings.json")).outputStyle).toBe(
      "friendly-custom",
    );
  });

  it("owns only OpenCode's rules prefix and reconciles the slice by receipt", async () => {
    await configure(configToml(["opencode"]));
    await outputFile(path.join(project, ".agents/rules/style.md"), "# Style\n");
    await writeConfig("opencode.json", {
      instructions: ".agents/rules/style.md",
    });

    await expect(run()).rejects.toThrow(/existing value is not an array/);

    await writeConfig("opencode.json", {
      instructions: ["CONTRIBUTING.md", ".agents/rules/style.md"],
    });
    await expect(run()).rejects.toThrow(/no prior AgentSync ownership receipt/);

    await writeConfig("opencode.json", {
      instructions: ["CONTRIBUTING.md"],
    });
    await run();
    await expect(run()).resolves.toBeDefined();
    expect((await readConfig("opencode.json")).instructions).toEqual([
      "CONTRIBUTING.md",
      ".agents/rules/style.md",
    ]);

    await rm(path.join(project, ".agents/rules/style.md"));
    await run();
    expect((await readConfig("opencode.json")).instructions).toEqual([
      "CONTRIBUTING.md",
    ]);

    await outputFile(path.join(project, ".agents/rules/style.md"), "# Style\n");
    await run();
    await writeConfig("opencode.json", {
      instructions: ["CONTRIBUTING.md", ".agents/rules/user-edit.md"],
    });
    await rm(path.join(project, ".agents/rules/style.md"));
    const withdrawal = await run();

    expect((await readConfig("opencode.json")).instructions).toEqual([
      "CONTRIBUTING.md",
      ".agents/rules/user-edit.md",
    ]);
    expect(withdrawal.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("preserved modified managed entries"),
      ]),
    );
    expect(
      (await readManifest(project))?.structured_owners?.opencode,
    ).toBeUndefined();
  });

  it("preserves a non-array OpenCode rules value during sync withdrawal and clean", async () => {
    const rulePath = path.join(project, ".agents/rules/style.md");
    await configure(configToml(["opencode"]));
    await outputFile(rulePath, "# Style\n");
    await run();
    await writeConfig("opencode.json", {
      instructions: ".agents/rules/user-managed.md",
    });
    await rm(rulePath);

    const withdrawal = await run();

    expect((await readConfig("opencode.json")).instructions).toBe(
      ".agents/rules/user-managed.md",
    );
    expect(withdrawal.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("preserved modified managed entries"),
      ]),
    );
    expect(
      (await readManifest(project))?.structured_owners?.opencode,
    ).toBeUndefined();

    await writeConfig("opencode.json", { instructions: ["README.md"] });
    await outputFile(rulePath, "# Style\n");
    await run();
    await writeConfig("opencode.json", {
      instructions: ".agents/rules/user-managed.md",
    });
    const [cleaned] = await cleanCommand({ cwd: project });

    expect((await readConfig("opencode.json")).instructions).toBe(
      ".agents/rules/user-managed.md",
    );
    expect(cleaned.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("preserved modified managed entries"),
      ]),
    );
  });
});
