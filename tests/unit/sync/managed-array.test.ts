import { describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import {
  type ManagedArrayKeyState,
  reconcileManagedArraySlice,
} from "../../../src/sync/managed-array.js";
import { hashSemanticValue } from "../../../src/sync/manifest.js";

const owned = (value: unknown): boolean =>
  typeof value === "string" && value.startsWith(".agents/");

function reconcile(
  existing: ManagedArrayKeyState,
  desiredOwned: readonly unknown[],
  previousReceipt?: string,
) {
  return reconcileManagedArraySlice({
    context: "OpenCode config",
    key: "instructions",
    existing,
    desiredOwned,
    previousReceipt,
    isOwned: owned,
  });
}

const missing: ManagedArrayKeyState = { present: false };

describe("managed array slices", () => {
  it("creates a missing key and records the desired slice", () => {
    const desired = [".agents/rules/generated.md", ".agents/rules/*.md"];

    expect(reconcile(missing, desired)).toEqual({
      next: { present: true, value: desired },
      nextReceipt: hashSemanticValue(desired),
      warnings: [],
      changed: true,
    });
  });

  it("appends a new owned slice while preserving unrelated entries", () => {
    const manual = ["README.md", "README.md", "docs/**/*.md"];
    const desired = [
      ".agents/rules/generated.md",
      ".agents/rules/generated.md",
    ];

    expect(reconcile({ present: true, value: manual }, desired)).toEqual({
      next: { present: true, value: [...manual, ...desired] },
      nextReceipt: hashSemanticValue(desired),
      warnings: [],
      changed: true,
    });
  });

  it.each([
    ["identical", [".agents/rules/generated.md"]],
    ["different", [".agents/manual.md"]],
  ])(
    "rejects an unowned occupied slice even when %s",
    (_case, currentOwned) => {
      expect(() =>
        reconcile({ present: true, value: ["README.md", ...currentOwned] }, [
          ".agents/rules/generated.md",
        ]),
      ).toThrowError(ConfigError);
      expect(() =>
        reconcile({ present: true, value: ["README.md", ...currentOwned] }, [
          ".agents/rules/generated.md",
        ]),
      ).toThrow(/no prior AgentSync ownership receipt/);
    },
  );

  it("retains an unchanged owned slice and its interspersed array layout", () => {
    const existing = [
      "README.md",
      ".agents/rules/generated.md",
      "docs/**/*.md",
      ".agents/rules/*.md",
    ];
    const desired = [".agents/rules/generated.md", ".agents/rules/*.md"];
    const result = reconcile(
      { present: true, value: existing },
      desired,
      hashSemanticValue(desired),
    );

    expect(result).toEqual({
      next: { present: true, value: existing },
      nextReceipt: hashSemanticValue(desired),
      warnings: [],
      changed: false,
    });
    expect(result.next.present && result.next.value).toBe(existing);
  });

  it("replaces an unchanged receipt-owned slice at its first position", () => {
    const currentOwned = [
      ".agents/old.md",
      ".agents/old.md",
      ".agents/rules/*.md",
    ];
    const desired = [".agents/rules/generated.md", ".agents/rules/**/*.md"];
    const existing = [
      "before.md",
      currentOwned[0],
      "middle.md",
      currentOwned[1],
      currentOwned[2],
      "after.md",
      "middle.md",
    ];

    expect(
      reconcile(
        { present: true, value: existing },
        desired,
        hashSemanticValue(currentOwned),
      ),
    ).toEqual({
      next: {
        present: true,
        value: ["before.md", ...desired, "middle.md", "after.md", "middle.md"],
      },
      nextReceipt: hashSemanticValue(desired),
      warnings: [],
      changed: true,
    });
  });

  it.each([
    ["missing key", missing, [".agents/rules/generated.md"]],
    [
      "missing slice",
      { present: true, value: ["README.md"] },
      ["README.md", ".agents/rules/generated.md"],
    ],
  ])(
    "recreates a %s covered by a valid receipt",
    (_case, existing, expected) => {
      const desired = [".agents/rules/generated.md"];
      const result = reconcile(
        existing,
        desired,
        hashSemanticValue([".agents/old.md"]),
      );

      expect(result.next).toEqual({ present: true, value: expected });
      expect(result.nextReceipt).toBe(hashSemanticValue(desired));
      expect(result.warnings).toEqual([]);
      expect(result.changed).toBe(true);
    },
  );

  it("rejects a modified receipt-owned slice when a write is desired", () => {
    expect(() =>
      reconcile(
        {
          present: true,
          value: ["README.md", ".agents/manually-edited.md"],
        },
        [".agents/rules/generated.md"],
        hashSemanticValue([".agents/old.md"]),
      ),
    ).toThrow(/modified after the last successful sync/);
  });

  it("removes an unchanged withdrawn slice and preserves manual order", () => {
    const currentOwned = [".agents/one.md", ".agents/two.md"];
    const existing = [
      "manual-a.md",
      currentOwned[0],
      "manual-b.md",
      currentOwned[1],
      "manual-a.md",
    ];

    expect(
      reconcile(
        { present: true, value: existing },
        [],
        hashSemanticValue(currentOwned),
      ),
    ).toEqual({
      next: {
        present: true,
        value: ["manual-a.md", "manual-b.md", "manual-a.md"],
      },
      warnings: [],
      changed: true,
      relinquished: true,
    });
  });

  it("removes the key when its unchanged withdrawn slice was the whole value", () => {
    const currentOwned = [".agents/one.md", ".agents/two.md"];

    expect(
      reconcile(
        { present: true, value: currentOwned },
        [],
        hashSemanticValue(currentOwned),
      ),
    ).toEqual({
      next: { present: false },
      warnings: [],
      changed: true,
      relinquished: true,
    });
  });

  it.each([
    ["a missing key", missing],
    ["an absent slice", { present: true, value: ["README.md"] }],
    ["an empty array", { present: true, value: [] }],
  ])(
    "relinquishes %s covered by a receipt without changing content",
    (_case, existing) => {
      expect(
        reconcile(existing, [], hashSemanticValue([".agents/old.md"])),
      ).toEqual({
        next: existing,
        warnings: [],
        changed: false,
        relinquished: true,
      });
    },
  );

  it("preserves a modified withdrawal with an actionable warning", () => {
    const existing = ["README.md", ".agents/manually-edited.md"];

    expect(
      reconcile(
        { present: true, value: existing },
        [],
        hashSemanticValue([".agents/generated.md"]),
      ),
    ).toEqual({
      next: { present: true, value: existing },
      warnings: [
        '[OpenCode config] preserved modified managed entries in "instructions" and relinquished AgentSync ownership; review or remove them manually',
      ],
      changed: false,
      relinquished: true,
      modifiedWithdrawal: true,
    });
  });

  it("preserves a non-array value as a modified withdrawal", () => {
    const existing: ManagedArrayKeyState = {
      present: true,
      value: ".agents/rules/manual.md",
    };

    expect(
      reconcile(
        existing,
        [],
        hashSemanticValue([".agents/rules/generated.md"]),
      ),
    ).toEqual({
      next: existing,
      warnings: [expect.stringContaining("preserved modified managed entries")],
      changed: false,
      relinquished: true,
      modifiedWithdrawal: true,
    });
  });

  it("leaves matching entries alone when AgentSync has no receipt or desire", () => {
    const existing = ["README.md", ".agents/manual.md"];

    expect(reconcile({ present: true, value: existing }, [])).toEqual({
      next: { present: true, value: existing },
      warnings: [],
      changed: false,
    });
  });

  it.each([
    ["not-a-hash"],
    [`sha256:${"a".repeat(63)}`],
    [`sha256:${"A".repeat(64)}`],
  ])("rejects the malformed receipt %s", (receipt) => {
    expect(() => reconcile(missing, [], receipt)).toThrowError(ConfigError);
    expect(() => reconcile(missing, [], receipt)).toThrow(
      /ownership receipt hash is invalid/,
    );
  });

  it("rejects a non-array existing value during a desired write", () => {
    const desired = [".agents/rules/generated.md"];
    expect(() =>
      reconcile({ present: true, value: { manual: true } }, desired),
    ).toThrowError(ConfigError);
    expect(() =>
      reconcile({ present: true, value: { manual: true } }, desired),
    ).toThrow(/existing value is not an array/);
  });

  it("preserves an unmanaged non-array value", () => {
    const existing: ManagedArrayKeyState = { present: true, value: "manual" };

    expect(reconcile(existing, [])).toEqual({
      next: existing,
      warnings: [],
      changed: false,
    });
  });

  it("rejects desired entries outside the ownership predicate", () => {
    expect(() => reconcile(missing, ["README.md"])).toThrowError(ConfigError);
    expect(() => reconcile(missing, ["README.md"])).toThrow(
      /desired entry at index 0 is outside the declared ownership predicate/,
    );
  });
});
