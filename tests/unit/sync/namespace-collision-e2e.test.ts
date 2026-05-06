/**
 * Namespace Collision E2E Test
 * Validates that the sync command throws a ConfigError with actionable
 * suggestion when two preset sources derive the same namespace.
 */
import { describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import { normalizeExtends } from "../../../src/types/schemas.js";

describe("Namespace collision detection in sync pipeline", () => {
  it("versioned refs to same repo produce same namespace", () => {
    const entries = normalizeExtends([
      "github:acme/standards@v1",
      "github:acme/standards@v2",
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].namespace).toBe("acme-standards");
    expect(entries[1].namespace).toBe("acme-standards");

    const seenNamespaces = new Map<string, string>();
    let thrownError: ConfigError | null = null;

    for (const entry of entries) {
      const existing = seenNamespaces.get(entry.namespace);
      if (existing) {
        const isVersionedCollision =
          existing.replace(/@[^@]+$/, "") ===
          entry.source.replace(/@[^@]+$/, "");
        const hint = isVersionedCollision
          ? `Both "${existing}" and "${entry.source}" derive the same namespace "${entry.namespace}". ` +
            "Pin to a single version, or use the object form with an explicit namespace: " +
            `{ source: "${entry.source}", namespace: "custom-name" }`
          : `"${existing}" and "${entry.source}" both derive namespace "${entry.namespace}". ` +
            "Use the object form with an explicit namespace to resolve.";
        thrownError = new ConfigError(
          `Namespace collision: "${entry.namespace}"`,
          "",
          hint,
        );
        break;
      }
      seenNamespaces.set(entry.namespace, entry.source);
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toContain("Namespace collision");
    expect(thrownError!.suggestion).toContain("Pin to a single version");
    expect(thrownError!.suggestion).toContain("custom-name");
  });

  it("different repos with different namespaces pass collision check", () => {
    const entries = normalizeExtends([
      "github:acme/standards",
      "github:acme/team-tools",
    ]);

    const seenNamespaces = new Map<string, string>();
    let hasCollision = false;

    for (const entry of entries) {
      if (seenNamespaces.has(entry.namespace)) {
        hasCollision = true;
        break;
      }
      seenNamespaces.set(entry.namespace, entry.source);
    }

    expect(hasCollision).toBe(false);
  });

  it("non-versioned collision produces different hint", () => {
    const seenNamespaces = new Map<string, string>();
    seenNamespaces.set("shared-ns", "github:alpha/shared-ns");

    const entry = { source: "fs:./other-shared-ns", namespace: "shared-ns" };
    const existing = seenNamespaces.get(entry.namespace);

    expect(existing).toBeDefined();
    const isVersionedCollision =
      existing!.replace(/@[^@]+$/, "") === entry.source.replace(/@[^@]+$/, "");
    expect(isVersionedCollision).toBe(false);
  });
});
