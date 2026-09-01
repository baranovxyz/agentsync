import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../../src/constants.js";
import { hashSemanticValue } from "../../../src/sync/manifest.js";
import {
  applyStructuredLifecyclePlan,
  planStructuredLifecycle,
  type StructuredLifecyclePlan,
  type StructuredProviderLifecyclePlan,
  type StructuredProviderProjection,
} from "../../../src/sync/structured-lifecycle.js";
import type {
  StructuredConfigDeclaration,
  StructuredConfigReceipt,
} from "../../../src/sync/structured-state.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  pathExists,
  readFile,
  readJsonValidated,
} from "../../../src/utils/fs.js";

function keyReceipt(
  key: string,
  value: unknown,
  format: StructuredConfigReceipt["format"] = "json",
): StructuredConfigReceipt {
  return {
    format,
    key_hashes: { [key]: hashSemanticValue(value) },
    array_slice_hashes: {},
  };
}

function declaration(
  relativePath: string,
  key: string,
  dependencies: readonly string[] = [],
): StructuredConfigDeclaration {
  return {
    path: relativePath,
    format: "json",
    context: `${relativePath} settings`,
    keys: [{ key, dependencies }],
  };
}

function projection(
  tool: ToolName,
  config: StructuredConfigDeclaration,
  desired?: { key: string; value: unknown },
  artifactDependencies: readonly string[] = [],
): StructuredProviderProjection {
  return {
    tool,
    declarations: [config],
    claims: desired
      ? [
          {
            kind: "key",
            path: config.path,
            key: desired.key,
            value: desired.value,
          },
        ]
      : [],
    artifactDependencies,
  };
}

function providerPlan(
  plan: StructuredLifecyclePlan,
  tool: ToolName,
): StructuredProviderLifecyclePlan {
  const provider = plan.providers.find((candidate) => candidate.tool === tool);
  if (!provider) throw new Error(`Missing ${tool} lifecycle partition`);
  return provider;
}

describe("structured lifecycle", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-lifecycle-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function writeConfig(
    relativePath: string,
    value: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const absolutePath = path.join(project, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(value)}\n`, "utf-8");
    return absolutePath;
  }

  it("full mode replaces selected receipts and drops absent providers", async () => {
    const claudePath = ".claude/settings.json";
    const cursorPath = ".cursor/hooks.json";
    const hooks = ["generated"];
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection("claude", declaration(claudePath, "hooks"), {
          key: "hooks",
          value: hooks,
        }),
      ],
      previousReceipts: {
        cursor: { [cursorPath]: keyReceipt("hooks", ["old"]) },
      },
      preserveUnselected: false,
    });

    expect(plan.nextReceipts).toEqual({
      claude: { [claudePath]: keyReceipt("hooks", hooks) },
    });
    expect(providerPlan(plan, "cursor").relinquishments).toEqual([
      expect.objectContaining({
        tool: "cursor",
        path: cursorPath,
        kind: "config",
        reason: "incompatible",
      }),
    ]);
    expect(providerPlan(plan, "cursor").receiptChanged).toBe(true);
  });

  it("filtered mode preserves receipts for providers outside the projection", async () => {
    const claudePath = ".claude/settings.json";
    const cursorPath = ".cursor/hooks.json";
    const cursorReceipt = keyReceipt("hooks", ["old"]);
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection("claude", declaration(claudePath, "hooks"), {
          key: "hooks",
          value: ["current"],
        }),
      ],
      previousReceipts: {
        cursor: { [cursorPath]: cursorReceipt },
      },
      preserveUnselected: true,
    });

    expect(plan.nextReceipts.cursor).toEqual({
      [cursorPath]: cursorReceipt,
    });
    expect(providerPlan(plan, "cursor")).toMatchObject({
      warnings: [],
      relinquishments: [],
      receiptChanged: false,
      changed: false,
    });
    expect(plan.statePlan.request.previousReceipts).not.toHaveProperty(
      cursorPath,
    );
  });

  it("filtered mode safely preserves a schema-valid empty unselected receipt", async () => {
    const claudePath = ".claude/settings.json";
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection("claude", declaration(claudePath, "hooks"), {
          key: "hooks",
          value: ["current"],
        }),
      ],
      previousReceipts: { cursor: {} },
      preserveUnselected: true,
    });

    expect(providerPlan(plan, "cursor")).toMatchObject({
      nextReceipts: {},
      warnings: [],
      relinquishments: [],
      changed: false,
    });
    expect(plan.nextReceipts).not.toHaveProperty("cursor");
  });

  it("full mode relinquishes omitted providers as incompatible without reading configs", async () => {
    const claudePath = ".claude/settings.json";
    const cursorPath = ".cursor/hooks.json";
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [],
      previousReceipts: {
        claude: { [claudePath]: keyReceipt("hooks", ["claude"]) },
        cursor: { [cursorPath]: keyReceipt("hooks", ["cursor"]) },
      },
      preserveUnselected: false,
    });

    expect(plan.statePlan.configs).toEqual([]);
    expect(plan.nextReceipts).toEqual({});
    expect(plan.relinquishments).toEqual([
      expect.objectContaining({ tool: "claude", path: claudePath }),
      expect.objectContaining({ tool: "cursor", path: cursorPath }),
    ]);
    expect(plan).toMatchObject({
      configChanged: false,
      receiptChanged: true,
      changed: true,
    });
  });

  it("withdraws unchanged state when a zero-content provider keeps its declarations", async () => {
    const configPath = ".claude/settings.json";
    const generatedHooks = ["generated"];
    const absolutePath = await writeConfig(configPath, {
      hooks: generatedHooks,
    });
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [projection("claude", declaration(configPath, "hooks"))],
      previousReceipts: {
        claude: { [configPath]: keyReceipt("hooks", generatedHooks) },
      },
      preserveUnselected: false,
    });

    expect(providerPlan(plan, "claude").configs[0]?.action).toBe("delete");
    expect(providerPlan(plan, "claude").relinquishments).toEqual([
      expect.objectContaining({
        path: configPath,
        key: "hooks",
        reason: "removed",
      }),
    ]);

    const applied = await applyStructuredLifecyclePlan(plan);
    expect(applied.removedFiles).toEqual([absolutePath]);
    expect(applied.plan.nextReceipts).toEqual({});
    expect(await pathExists(absolutePath)).toBe(false);
  });

  it("rejects a runtime-invalid provider before reading configs", async () => {
    const invalid = projection(
      "claude",
      declaration(".claude/settings.json", "hooks"),
    );
    Reflect.set(invalid, "tool", "unknown-provider");

    await expect(
      planStructuredLifecycle({
        cwd: project,
        providers: [invalid],
        preserveUnselected: false,
      }),
    ).rejects.toThrow(/provider is unsupported/);
  });

  it("rejects duplicate provider projections before reading configs", async () => {
    const first = declaration(".claude/first.json", "hooks");
    const second = declaration(".claude/second.json", "permissions");

    await expect(
      planStructuredLifecycle({
        cwd: project,
        providers: [projection("claude", first), projection("claude", second)],
        preserveUnselected: false,
      }),
    ).rejects.toThrow(/Duplicate structured-state projection/);
  });

  it("rejects cross-provider path authority before reading configs", async () => {
    const sharedPath = ".shared/settings.json";
    await writeConfig(sharedPath, { occupied: true });
    const sharedDeclaration = declaration(sharedPath, "hooks");

    await expect(
      planStructuredLifecycle({
        cwd: project,
        providers: [
          projection("claude", sharedDeclaration),
          projection("cursor", sharedDeclaration),
        ],
        preserveUnselected: false,
      }),
    ).rejects.toThrow(/Conflicting structured-state authority/);
  });

  it("preflights every provider before producing any structured write", async () => {
    const claudePath = ".claude/settings.json";
    const cursorPath = ".cursor/hooks.json";
    const malformedCursor = path.join(project, ...cursorPath.split("/"));
    await mkdir(path.dirname(malformedCursor), { recursive: true });
    await writeFile(malformedCursor, "{ malformed", "utf-8");

    await expect(
      planStructuredLifecycle({
        cwd: project,
        providers: [
          projection("claude", declaration(claudePath, "hooks"), {
            key: "hooks",
            value: ["claude"],
          }),
          projection("cursor", declaration(cursorPath, "hooks"), {
            key: "hooks",
            value: ["cursor"],
          }),
        ],
        preserveUnselected: false,
      }),
    ).rejects.toThrow(/Cannot safely inspect/);

    expect(await pathExists(path.join(project, ...claudePath.split("/")))).toBe(
      false,
    );
    expect(await readFile(malformedCursor, "utf-8")).toBe("{ malformed");
  });

  it("re-reads every provider before starting a multi-provider apply", async () => {
    const claudePath = ".claude/settings.json";
    const cursorPath = ".cursor/hooks.json";
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection("claude", declaration(claudePath, "hooks"), {
          key: "hooks",
          value: ["claude"],
        }),
        projection("cursor", declaration(cursorPath, "hooks"), {
          key: "hooks",
          value: ["cursor"],
        }),
      ],
      preserveUnselected: false,
    });
    const cursorConfig = await writeConfig(cursorPath, { hooks: ["manual"] });

    await expect(applyStructuredLifecyclePlan(plan)).rejects.toThrow(
      /no prior AgentSync ownership receipt/,
    );
    expect(await pathExists(path.join(project, ...claudePath.split("/")))).toBe(
      false,
    );
    expect(await readJsonValidated(cursorConfig, ToolSettingsSchema)).toEqual({
      hooks: ["manual"],
    });
  });

  it.each([
    {
      name: "undeclared",
      receiptPath: ".claude/other.json",
      receiptFormat: "json",
    },
    {
      name: "incompatible",
      receiptPath: ".claude/settings.json",
      receiptFormat: "toml",
    },
  ])("conservatively protects every provider artifact for an $name receipt", async ({
    receiptPath,
    receiptFormat,
  }) => {
    const configPath = ".claude/settings.json";
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection(
          "claude",
          declaration(configPath, "hooks", ["hook-files"]),
          undefined,
          ["hook-files", "script-files"],
        ),
      ],
      previousReceipts: {
        claude: {
          [receiptPath]: keyReceipt("hooks", ["generated"], receiptFormat),
        },
      },
      preserveUnselected: false,
    });

    expect(plan.protectedDependencies).toEqual({
      claude: ["hook-files", "script-files"],
    });
    expect(providerPlan(plan, "claude").relinquishments).toEqual([
      expect.objectContaining({ reason: "incompatible" }),
    ]);
  });

  it("publishes refreshed receipt and protection partitions after apply", async () => {
    const configPath = ".claude/settings.json";
    const generatedHooks = ["generated"];
    const absolutePath = await writeConfig(configPath, {
      hooks: generatedHooks,
    });
    const plan = await planStructuredLifecycle({
      cwd: project,
      providers: [
        projection(
          "claude",
          declaration(configPath, "hooks", ["hook-files"]),
          undefined,
          ["hook-files"],
        ),
      ],
      previousReceipts: {
        claude: { [configPath]: keyReceipt("hooks", generatedHooks) },
      },
      preserveUnselected: false,
    });
    expect(plan.protectedDependencies).toEqual({});
    await writeConfig(configPath, { hooks: ["manual"] });

    const applied = await applyStructuredLifecyclePlan(plan);

    expect(applied.plan.nextReceipts).toEqual({});
    expect(applied.plan.protectedDependencies).toEqual({
      claude: ["hook-files"],
    });
    expect(providerPlan(applied.plan, "claude").warnings).toEqual([
      expect.stringContaining("preserved modified key"),
    ]);
    expect(await readJsonValidated(absolutePath, ToolSettingsSchema)).toEqual({
      hooks: ["manual"],
    });
  });
});
