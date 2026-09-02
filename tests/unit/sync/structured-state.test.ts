import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import { hashSemanticValue } from "../../../src/sync/manifest.js";
import { hashOrderedSemanticValue } from "../../../src/sync/semantic-ownership.js";
import {
  applyStructuredStatePlan,
  planStructuredRecord,
  planStructuredState,
  type StructuredConfigDeclaration,
  type StructuredConfigReceipt,
  StructuredConfigReceiptSchema,
  type StructuredStateClaim,
  StructuredStateReceiptsSchema,
} from "../../../src/sync/structured-state.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  pathExists,
  readFile,
  readJsonValidated,
} from "../../../src/utils/fs.js";

const settingsDeclaration: StructuredConfigDeclaration = {
  path: ".tool/settings.json",
  format: "json",
  context: "Example settings",
  keys: [{ key: "hooks", dependencies: ["hook-files"] }, { key: "permission" }],
  arraySlices: [
    {
      key: "instructions",
      prefix: ".agents/rules/",
      dependencies: ["rule-files"],
    },
  ],
};

function keyClaim(key: string, value: unknown): StructuredStateClaim {
  return {
    kind: "key",
    path: settingsDeclaration.path,
    key,
    value,
  };
}

function sliceClaim(...values: string[]): StructuredStateClaim {
  return {
    kind: "array-slice",
    path: settingsDeclaration.path,
    key: "instructions",
    values,
  };
}

function receipt(
  keyHashes: Record<string, string> = {},
  sliceHashes: Record<string, string> = {},
  format: StructuredConfigReceipt["format"] = "json",
): StructuredConfigReceipt {
  return {
    format,
    key_hashes: keyHashes,
    array_slice_hashes: sliceHashes,
  };
}

function keyReceipt(key: string, value: unknown): StructuredConfigReceipt {
  return receipt({ [key]: hashSemanticValue(value) });
}

describe("structured-state record kernel", () => {
  it("groups whole keys and one owned array slice while preserving unrelated state", () => {
    const manualInstructions = ["README.md", "docs/**/*.md"];
    const permission = { bash: "ask" };
    const desiredRules = [".agents/rules/style.md", ".agents/rules/testing.md"];

    const plan = planStructuredRecord({
      declaration: settingsDeclaration,
      existing: {
        model: "example",
        instructions: manualInstructions,
      },
      claims: [keyClaim("permission", permission), sliceClaim(...desiredRules)],
    });

    expect(plan.nextConfig).toEqual({
      model: "example",
      instructions: [...manualInstructions, ...desiredRules],
      permission,
    });
    expect(plan.nextReceipt).toEqual(
      receipt(
        { permission: hashSemanticValue(permission) },
        { instructions: hashSemanticValue(desiredRules) },
      ),
    );
    expect(plan.configChanged).toBe(true);
    expect(plan.receiptChanged).toBe(true);
    expect(plan.relinquishments).toEqual([]);
  });

  it.each([
    ["identical", { bash: "ask" }],
    ["different", { bash: "allow" }],
  ])("rejects an unowned occupied key when %s", (_case, existing) => {
    expect(() =>
      planStructuredRecord({
        declaration: settingsDeclaration,
        existing: { permission: existing },
        claims: [keyClaim("permission", { bash: "ask" })],
      }),
    ).toThrow(/no prior AgentSync ownership receipt/);
  });

  it.each([
    {
      name: "top-level permission rules",
      old: { "github_*": "allow", github_search: "deny" },
      reordered: { github_search: "deny", "github_*": "allow" },
    },
    {
      name: "nested permission patterns",
      old: { bash: { "git *": "allow", "git status": "deny" } },
      reordered: { bash: { "git status": "deny", "git *": "allow" } },
    },
  ])("retains semantic object order for $name", ({ old, reordered }) => {
    const declaration: StructuredConfigDeclaration = {
      path: settingsDeclaration.path,
      format: "json",
      context: "Ordered permissions",
      keys: [{ key: "permission", semanticHash: "property-order" }],
    };
    const previousReceipt = receipt({
      permission: hashOrderedSemanticValue(old),
    });

    const resync = planStructuredRecord({
      declaration,
      existing: { permission: old },
      claims: [keyClaim("permission", structuredClone(old))],
      previousReceipt,
    });
    expect(resync.configChanged).toBe(false);

    const replacement = planStructuredRecord({
      declaration,
      existing: { permission: old },
      claims: [keyClaim("permission", reordered)],
      previousReceipt,
    });
    expect(replacement.configChanged).toBe(true);
    expect(JSON.stringify(replacement.nextConfig.permission)).toBe(
      JSON.stringify(reordered),
    );

    expect(() =>
      planStructuredRecord({
        declaration,
        existing: { permission: reordered },
        claims: [keyClaim("permission", old)],
        previousReceipt,
      }),
    ).toThrow(/modified after the last successful sync/);
  });

  it("rejects a modified receipt-owned desired slice", () => {
    expect(() =>
      planStructuredRecord({
        declaration: settingsDeclaration,
        existing: {
          instructions: ["README.md", ".agents/rules/manual.md"],
        },
        claims: [sliceClaim(".agents/rules/current.md")],
        previousReceipt: receipt(
          {},
          {
            instructions: hashSemanticValue([".agents/rules/old.md"]),
          },
        ),
      }),
    ).toThrow(/modified after the last successful sync/);
  });

  it.each([
    {
      name: "unchanged",
      existing: { hooks: ["generated"] },
      reason: "removed",
      next: {},
      configChanged: true,
      protectedDependencies: [],
    },
    {
      name: "missing",
      existing: { model: "example" },
      reason: "missing",
      next: { model: "example" },
      configChanged: false,
      protectedDependencies: [],
    },
    {
      name: "modified",
      existing: { hooks: ["manual"] },
      reason: "modified",
      next: { hooks: ["manual"] },
      configChanged: false,
      protectedDependencies: ["hook-files"],
    },
  ])(
    "withdraws $name whole-key ownership with dependency metadata",
    ({ existing, reason, next, configChanged, protectedDependencies }) => {
      const plan = planStructuredRecord({
        declaration: settingsDeclaration,
        existing,
        claims: [],
        previousReceipt: keyReceipt("hooks", ["generated"]),
      });

      expect(plan.nextConfig).toEqual(next);
      expect(plan.nextReceipt).toBeUndefined();
      expect(plan.configChanged).toBe(configChanged);
      expect(plan.receiptChanged).toBe(true);
      expect(plan.relinquishments).toEqual([
        {
          path: settingsDeclaration.path,
          kind: "key",
          key: "hooks",
          reason,
          dependencies: ["hook-files"],
        },
      ]);
      expect(plan.protectedDependencies).toEqual(protectedDependencies);
    },
  );

  it("preserves a modified withdrawn slice and protects its dependencies", () => {
    const current = ["README.md", ".agents/rules/manual.md"];
    const plan = planStructuredRecord({
      declaration: settingsDeclaration,
      existing: { instructions: current },
      claims: [],
      previousReceipt: receipt(
        {},
        { instructions: hashSemanticValue([".agents/rules/generated.md"]) },
      ),
    });

    expect(plan.nextConfig.instructions).toBe(current);
    expect(plan.nextReceipt).toBeUndefined();
    expect(plan.relinquishments).toEqual([
      {
        path: settingsDeclaration.path,
        kind: "array-slice",
        key: "instructions",
        reason: "modified",
        dependencies: ["rule-files"],
      },
    ]);
    expect(plan.protectedDependencies).toEqual(["rule-files"]);
    expect(plan.warnings).toEqual([
      expect.stringContaining("preserved modified managed entries"),
    ]);
  });

  it.each([
    ["unowned", undefined],
    [
      "receipt-owned",
      receipt(
        {},
        {
          instructions: hashSemanticValue([".agents/rules/generated.md"]),
        },
      ),
    ],
  ])("rejects a non-array occupied %s slice", (_case, previousReceipt) => {
    expect(() =>
      planStructuredRecord({
        declaration: settingsDeclaration,
        existing: { instructions: "README.md" },
        claims: [sliceClaim(".agents/rules/current.md")],
        previousReceipt,
      }),
    ).toThrow(/existing value is not an array/);
  });

  it("treats an incompatible receipt as no authority for a desired write", () => {
    expect(() =>
      planStructuredRecord({
        declaration: settingsDeclaration,
        existing: { permission: { bash: "ask" } },
        claims: [keyClaim("permission", { bash: "ask" })],
        previousReceipt: keyReceipt("unknown", true),
      }),
    ).toThrow(/no prior AgentSync ownership receipt/);
  });

  it("preserves state and protects declared dependencies for incompatible withdrawal", () => {
    const existing = { hooks: ["manual"], model: "example" };
    const plan = planStructuredRecord({
      declaration: settingsDeclaration,
      existing,
      claims: [],
      previousReceipt: receipt(
        { hooks: hashSemanticValue(["generated"]) },
        {},
        "toml",
      ),
    });

    expect(plan.nextConfig).toEqual(existing);
    expect(plan.nextReceipt).toBeUndefined();
    expect(plan.warnings).toEqual([
      expect.stringContaining("ignored incompatible ownership receipt"),
    ]);
    expect(plan.relinquishments).toEqual([
      {
        path: settingsDeclaration.path,
        kind: "key",
        key: "hooks",
        reason: "incompatible",
        dependencies: ["hook-files"],
      },
    ]);
    expect(plan.protectedDependencies).toEqual(["hook-files"]);
  });

  it.each([
    [
      "noncanonical declaration",
      { ...settingsDeclaration, path: "../settings.json" },
      [],
    ],
    [
      "undeclared key",
      settingsDeclaration,
      [keyClaim("outputStyle", "Concise")],
    ],
    [
      "outside-prefix slice entry",
      settingsDeclaration,
      [sliceClaim("README.md")],
    ],
    [
      "duplicate claim",
      settingsDeclaration,
      [keyClaim("permission", "ask"), keyClaim("permission", "deny")],
    ],
  ])("rejects a %s", (_case, declaration, claims) => {
    expect(() =>
      planStructuredRecord({
        declaration,
        existing: {},
        claims,
      }),
    ).toThrowError(ConfigError);
  });

  it("exports a Zod receipt schema that rejects malformed hashes", () => {
    expect(
      StructuredConfigReceiptSchema.safeParse(
        receipt({ permission: "not-a-hash" }),
      ).success,
    ).toBe(false);
  });

  it("rejects noncanonical receipt paths at the schema boundary", () => {
    expect(
      StructuredStateReceiptsSchema.safeParse({
        "../settings.json": keyReceipt("permission", { bash: "ask" }),
      }).success,
    ).toBe(false);
  });
});

describe("structured-state filesystem adapter", () => {
  let project: string;
  let outside: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-structured-"));
    outside = await mkdtemp(path.join(tmpdir(), "agentsync-structured-out-"));
  });

  afterEach(async () => {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  function request(
    claims: readonly StructuredStateClaim[],
    previousReceipts: Readonly<Record<string, StructuredConfigReceipt>> = {},
  ) {
    return {
      cwd: project,
      declarations: [settingsDeclaration],
      claims,
      previousReceipts,
    };
  }

  async function writeConfig(
    configPath: string,
    value: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(value)}\n`, "utf-8");
  }

  it("writes all claims for one config in one semantic projection", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    await writeConfig(configPath, {
      model: "example",
      instructions: ["README.md"],
    });
    const planned = await planStructuredState(
      request([
        keyClaim("permission", { bash: "ask" }),
        sliceClaim(".agents/rules/style.md"),
      ]),
    );
    const applied = await applyStructuredStatePlan(planned);
    const config = await readJsonValidated(configPath, ToolSettingsSchema);

    expect(config).toEqual({
      model: "example",
      instructions: ["README.md", ".agents/rules/style.md"],
      permission: { bash: "ask" },
    });
    expect(applied.writtenFiles).toEqual([configPath]);
    expect(applied.removedFiles).toEqual([]);
    expect(Object.keys(applied.plan.nextReceipts)).toEqual([
      settingsDeclaration.path,
    ]);
  });

  it("orders config plans and receipt keys independently of declaration and claim order", async () => {
    const alphaDeclaration: StructuredConfigDeclaration = {
      path: ".alpha/settings.yaml",
      format: "yaml",
      context: "Alpha settings",
      keys: [{ key: "zeta" }, { key: "alpha" }],
    };
    const plan = await planStructuredState({
      cwd: project,
      declarations: [settingsDeclaration, alphaDeclaration],
      claims: [
        keyClaim("permission", { bash: "ask" }),
        { kind: "key", path: alphaDeclaration.path, key: "zeta", value: 2 },
        { kind: "key", path: alphaDeclaration.path, key: "alpha", value: 1 },
      ],
    });

    expect(plan.configs.map((config) => config.declaration.path)).toEqual([
      alphaDeclaration.path,
      settingsDeclaration.path,
    ]);
    expect(Object.keys(plan.nextReceipts)).toEqual([
      alphaDeclaration.path,
      settingsDeclaration.path,
    ]);
    expect(
      Object.keys(plan.nextReceipts[alphaDeclaration.path]?.key_hashes ?? {}),
    ).toEqual(["alpha", "zeta"]);
  });

  it("deletes a config only after removing its last unchanged owned key", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    const hooks = ["generated"];
    await writeConfig(configPath, { hooks });

    const planned = await planStructuredState(
      request([], {
        [settingsDeclaration.path]: keyReceipt("hooks", hooks),
      }),
    );
    expect(planned.configs[0]?.action).toBe("delete");

    const applied = await applyStructuredStatePlan(planned);
    expect(applied.removedFiles).toEqual([configPath]);
    expect(await pathExists(configPath)).toBe(false);
  });

  it("preserves an empty or unrelated config when no serialized change is needed", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    await writeConfig(configPath, { model: "example" });

    const planned = await planStructuredState(
      request([], {
        [settingsDeclaration.path]: keyReceipt("hooks", ["missing"]),
      }),
    );
    expect(planned.configs[0]?.action).toBe("none");
    await applyStructuredStatePlan(planned);

    expect(await readJsonValidated(configPath, ToolSettingsSchema)).toEqual({
      model: "example",
    });
  });

  it("re-reads before apply and preserves unrelated post-projection changes", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    await writeConfig(configPath, { model: "example" });
    const planned = await planStructuredState(
      request([keyClaim("permission", { bash: "ask" })]),
    );
    await writeFile(
      configPath,
      '{"model":"example","theme":"dark"}\n',
      "utf-8",
    );

    await applyStructuredStatePlan(planned);

    expect(await readJsonValidated(configPath, ToolSettingsSchema)).toEqual({
      model: "example",
      theme: "dark",
      permission: { bash: "ask" },
    });
  });

  it("re-reads before apply and rejects a newly modified managed value", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    const previousPermission = { bash: "ask" };
    await writeConfig(configPath, { permission: previousPermission });
    const previousReceipts = {
      [settingsDeclaration.path]: keyReceipt("permission", previousPermission),
    };
    const planned = await planStructuredState(
      request([keyClaim("permission", { bash: "allow" })], previousReceipts),
    );
    await writeFile(
      configPath,
      `${JSON.stringify({ permission: { bash: "manual" } })}\n`,
      "utf-8",
    );

    await expect(applyStructuredStatePlan(planned)).rejects.toThrow(
      /modified after the last successful sync/,
    );
    expect(await readJsonValidated(configPath, ToolSettingsSchema)).toEqual({
      permission: { bash: "manual" },
    });
  });

  it("keeps dry-run read-only", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    const planned = await planStructuredState(
      request([keyClaim("permission", { bash: "ask" })]),
    );
    const applied = await applyStructuredStatePlan(planned, { dryRun: true });

    expect(applied.writtenFiles).toEqual([]);
    expect(applied.removedFiles).toEqual([]);
    expect(await pathExists(configPath)).toBe(false);
  });

  it("rejects a config leaf symlink without changing its target", async () => {
    const externalConfig = path.join(outside, "settings.json");
    await writeFile(externalConfig, '{"manual":true}\n', "utf-8");
    const leaf = path.join(project, ".tool", "settings.json");
    await mkdir(path.dirname(leaf), { recursive: true });
    await symlink(externalConfig, leaf);

    await expect(
      planStructuredState(request([keyClaim("permission", { bash: "ask" })])),
    ).rejects.toThrow(/outside the project|destination is not a regular file/);
    expect(await readFile(externalConfig, "utf-8")).toBe('{"manual":true}\n');
  });

  it("relinquishes an incompatible receipt without inspecting an unsafe target", async () => {
    const externalConfig = path.join(outside, "settings.json");
    await writeFile(externalConfig, '{"manual":true}\n', "utf-8");
    const leaf = path.join(project, ".tool", "settings.json");
    await mkdir(path.dirname(leaf), { recursive: true });
    await symlink(externalConfig, leaf);

    const plan = await planStructuredState(
      request([], {
        [settingsDeclaration.path]: receipt(
          { hooks: hashSemanticValue(["generated"]) },
          {},
          "toml",
        ),
      }),
    );

    expect(plan.configs[0]?.action).toBe("none");
    expect(plan.nextReceipts).toEqual({});
    expect(plan.protectedDependencies).toEqual(["hook-files"]);
    expect(await readFile(externalConfig, "utf-8")).toBe('{"manual":true}\n');
  });

  it("preserves an unsafe target while relinquishing a compatible withdrawal receipt", async () => {
    const externalConfig = path.join(outside, "settings.json");
    const original = '{"hooks":["generated"],"manual":true}\n';
    await writeFile(externalConfig, original, "utf-8");
    const leaf = path.join(project, ".tool", "settings.json");
    await mkdir(path.dirname(leaf), { recursive: true });
    await symlink(externalConfig, leaf);

    const plan = await planStructuredState(
      request([], {
        [settingsDeclaration.path]: keyReceipt("hooks", ["generated"]),
      }),
    );
    const applied = await applyStructuredStatePlan(plan);

    expect(applied.plan.nextReceipts).toEqual({});
    expect(applied.plan.warnings).toEqual([
      expect.stringContaining("preserved"),
    ]);
    expect(applied.plan.relinquishments).toEqual([
      expect.objectContaining({ key: "hooks", reason: "modified" }),
    ]);
    expect(applied.plan.protectedDependencies).toEqual(["hook-files"]);
    expect(await readFile(externalConfig, "utf-8")).toBe(original);
  });

  it("preserves malformed config while relinquishing a compatible withdrawal receipt", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    const malformed = "{ malformed";
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, malformed, "utf-8");

    const plan = await planStructuredState(
      request([], {
        [settingsDeclaration.path]: keyReceipt("hooks", ["generated"]),
      }),
    );
    const applied = await applyStructuredStatePlan(plan);

    expect(applied.plan.nextReceipts).toEqual({});
    expect(applied.plan.warnings).toEqual([
      expect.stringContaining("could not inspect it safely"),
    ]);
    expect(applied.plan.protectedDependencies).toEqual(["hook-files"]);
    expect(await readFile(configPath, "utf-8")).toBe(malformed);
  });

  it("rejects malformed shared JSON before producing a write plan", async () => {
    const configPath = path.join(project, ".tool", "settings.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "{ malformed", "utf-8");

    await expect(
      planStructuredState(request([keyClaim("permission", { bash: "ask" })])),
    ).rejects.toThrow(/Cannot safely inspect Example settings/);
    expect(await readFile(configPath, "utf-8")).toBe("{ malformed");
  });

  it("drops an undeclared receipt without reading or writing its path", async () => {
    const undeclaredPath = ".other/settings.json";
    const plan = await planStructuredState({
      ...request([]),
      previousReceipts: {
        [undeclaredPath]: keyReceipt("manual", true),
      },
    });

    expect(plan.configs).toEqual([]);
    expect(plan.nextReceipts).toEqual({});
    expect(plan.receiptChanged).toBe(true);
    expect(plan.warnings).toEqual([
      expect.stringContaining("receipt for undeclared path"),
    ]);
    expect(await pathExists(path.join(project, undeclaredPath))).toBe(false);
  });
});
