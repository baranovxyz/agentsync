import { describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import { reconcileManagedKeys } from "../../../src/sync/managed-keys.js";
import { hashSemanticValue } from "../../../src/sync/manifest.js";

const declaredKeys = ["hooks", "outputStyle", "permission", "statusLine"];

function reconcile(
  existing: Readonly<Record<string, unknown>>,
  desired: Readonly<Record<string, unknown>>,
  previousReceipt: Readonly<Record<string, string>> = {},
) {
  return reconcileManagedKeys({
    context: "Example settings",
    declaredKeys,
    existing,
    desired,
    previousReceipt,
  });
}

describe("managed top-level config keys", () => {
  it("writes an absent desired key and records its semantic hash", () => {
    const desired = { permission: { Bash: "ask" } };

    expect(reconcile({ model: "example" }, desired)).toEqual({
      nextConfig: { model: "example", ...desired },
      nextReceipt: {
        permission: hashSemanticValue(desired.permission),
      },
      warnings: [],
      changed: true,
    });
  });

  it.each([
    ["identical", { permission: { Bash: "ask" } }],
    ["different", { permission: { Bash: "allow" } }],
  ])("rejects an unowned occupied desired key even when %s", (_case, existing) => {
    expect(() =>
      reconcile(existing, { permission: { Bash: "ask" } }),
    ).toThrowError(ConfigError);
    expect(() => reconcile(existing, { permission: { Bash: "ask" } })).toThrow(
      /no prior AgentSync ownership receipt/,
    );
  });

  it("retains an unchanged owned value without reporting a change", () => {
    const permission = { Bash: "ask", Read: "allow" };
    const result = reconcile(
      { permission, model: "example" },
      { permission: { Read: "allow", Bash: "ask" } },
      { permission: hashSemanticValue(permission) },
    );

    expect(result).toEqual({
      nextConfig: { permission, model: "example" },
      nextReceipt: { permission: hashSemanticValue(permission) },
      warnings: [],
      changed: false,
    });
    expect(result.nextConfig.permission).toBe(permission);
  });

  it("recreates a missing owned key", () => {
    const desired = { permission: { Bash: "ask" } };

    expect(
      reconcile({}, desired, {
        permission: hashSemanticValue({ Bash: "allow" }),
      }),
    ).toEqual({
      nextConfig: desired,
      nextReceipt: { permission: hashSemanticValue(desired.permission) },
      warnings: [],
      changed: true,
    });
  });

  it("rejects an owned desired key modified after the receipt", () => {
    expect(() =>
      reconcile(
        { permission: { Bash: "manual" } },
        { permission: { Bash: "ask" } },
        { permission: hashSemanticValue({ Bash: "allow" }) },
      ),
    ).toThrow(/modified after the last successful sync/);
  });

  it("removes an unchanged withdrawn key and relinquishes its receipt", () => {
    const permission = { Bash: "ask" };

    expect(
      reconcile(
        { model: "example", permission },
        {},
        { permission: hashSemanticValue(permission) },
      ),
    ).toEqual({
      nextConfig: { model: "example" },
      nextReceipt: {},
      warnings: [],
      changed: true,
      relinquishedKeys: ["permission"],
    });
  });

  it("relinquishes a missing withdrawn key without reporting a change", () => {
    expect(
      reconcile({}, {}, { permission: hashSemanticValue({ Bash: "ask" }) }),
    ).toEqual({
      nextConfig: {},
      nextReceipt: {},
      warnings: [],
      changed: false,
      relinquishedKeys: ["permission"],
    });
  });

  it("preserves a modified withdrawn key with an actionable warning", () => {
    const manual = { Bash: "manual" };

    expect(
      reconcile(
        { model: "example", permission: manual },
        {},
        { permission: hashSemanticValue({ Bash: "ask" }) },
      ),
    ).toEqual({
      nextConfig: { model: "example", permission: manual },
      nextReceipt: {},
      warnings: [
        '[Example settings] preserved modified key "permission" and relinquished AgentSync ownership; review or remove it manually',
      ],
      changed: false,
      relinquishedKeys: ["permission"],
      modifiedWithdrawalKeys: ["permission"],
    });
  });

  it("preserves unrelated keys and never mutates its inputs", () => {
    const existing = {
      model: "example",
      nested: { keep: true },
      permission: { Bash: "ask" },
    };
    const desired = { permission: { Bash: "allow" } };
    const previous = {
      permission: hashSemanticValue(existing.permission),
    };

    const result = reconcile(existing, desired, previous);

    expect(result.nextConfig).toEqual({
      model: "example",
      nested: { keep: true },
      permission: { Bash: "allow" },
    });
    expect(result.nextReceipt).toEqual({
      permission: hashSemanticValue(desired.permission),
    });
    expect(result.changed).toBe(true);
    expect(existing.permission).toEqual({ Bash: "ask" });
    expect(previous).toEqual({
      permission: hashSemanticValue({ Bash: "ask" }),
    });
  });

  it.each([
    ["desired", { unknown: true }, {}],
    ["receipt", {}, { unknown: hashSemanticValue(true) }],
  ])("rejects an undeclared %s key before reconciliation", (_case, desired, receipt) => {
    expect(() =>
      reconcileManagedKeys({
        context: "Example settings",
        declaredKeys,
        existing: {},
        desired,
        previousReceipt: receipt,
      }),
    ).toThrow(/key "unknown": the .* key is not declared/);
  });

  it("rejects a malformed receipt hash", () => {
    expect(() => reconcile({}, {}, { permission: "not-a-hash" })).toThrow(
      /receipt hash is invalid/,
    );
  });

  it("orders new keys, receipts, and withdrawal warnings deterministically", () => {
    const existing = { z: true, statusLine: "manual", hooks: ["manual"] };
    const previous = {
      statusLine: hashSemanticValue("generated"),
      hooks: hashSemanticValue(["generated"]),
    };
    const desired = {
      permission: { Bash: "ask" },
      outputStyle: "concise",
    };

    const result = reconcile(existing, desired, previous);

    expect(Object.keys(result.nextConfig)).toEqual([
      "z",
      "statusLine",
      "hooks",
      "outputStyle",
      "permission",
    ]);
    expect(Object.keys(result.nextReceipt)).toEqual([
      "outputStyle",
      "permission",
    ]);
    expect(result.warnings).toEqual([
      '[Example settings] preserved modified key "hooks" and relinquished AgentSync ownership; review or remove it manually',
      '[Example settings] preserved modified key "statusLine" and relinquished AgentSync ownership; review or remove it manually',
    ]);
    expect(result.relinquishedKeys).toEqual(["hooks", "statusLine"]);
    expect(result.modifiedWithdrawalKeys).toEqual(["hooks", "statusLine"]);
  });
});
