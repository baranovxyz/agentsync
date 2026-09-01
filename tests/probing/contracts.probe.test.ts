import { describe, expect, it } from "vitest";
import {
  AgentSyncConfigSchema,
  deriveNamespace,
  normalizeExtends,
} from "../../src/types/schemas.js";

describe("probing: normalizeExtends contracts", () => {
  it("derives namespace from github source string", () => {
    const result = normalizeExtends(["github:company/standards"]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("github:company/standards");
    expect(typeof result[0].namespace).toBe("string");
    expect(result[0].namespace.length).toBeGreaterThan(0);
    // Namespace should be filesystem-safe: no colons, slashes, or dots
    expect(result[0].namespace).not.toMatch(/[:/]/);
  });

  it("derives 'company-standards' as namespace from github:company/standards", () => {
    const result = normalizeExtends(["github:company/standards"]);
    expect(result[0].namespace).toBe("company-standards");
  });

  it("strips @ref suffix when deriving namespace", () => {
    const result = normalizeExtends(["github:company/standards@v2"]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("github:company/standards@v2");
    expect(result[0].namespace).toBe("company-standards");
  });

  it("derives namespace from filesystem source string", () => {
    const result = normalizeExtends(["fs:./local-presets"]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("fs:./local-presets");
    expect(result[0].namespace).toBe("local-presets");
  });

  it("derives namespace from absolute path", () => {
    const result = normalizeExtends(["/absolute/path/to/presets"]);
    expect(result).toHaveLength(1);
    expect(result[0].namespace).toBe("presets");
  });

  it("derives namespace from relative path with dot prefix", () => {
    const result = normalizeExtends(["./relative/path"]);
    expect(result).toHaveLength(1);
    expect(result[0].namespace).toBe("path");
  });

  it("returns empty array for undefined input", () => {
    const result = normalizeExtends(undefined);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty array input", () => {
    const result = normalizeExtends([]);
    expect(result).toEqual([]);
  });

  it("handles multiple source strings", () => {
    const result = normalizeExtends([
      "github:company/standards",
      "github:team/frontend",
      "fs:./local-rules",
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].namespace).toBe("company-standards");
    expect(result[1].namespace).toBe("team-frontend");
    expect(result[2].namespace).toBe("local-rules");
  });

  it("deduplicates same source keeping last occurrence", () => {
    const result = normalizeExtends([
      "github:company/standards",
      "github:company/tools",
      "github:company/standards",
    ]);
    // Deduplication keeps last occurrence: tools at index 1, standards at index 2
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe("github:company/tools");
    expect(result[1].source).toBe("github:company/standards");
  });

  it("namespace is safe for filesystem use (alphanumeric, hyphens, underscores)", () => {
    const result = normalizeExtends(["github:company/standards"]);
    expect(result[0].namespace).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("rejects object-form entries at the current config boundary", () => {
    const result = AgentSyncConfigSchema.safeParse({
      extends: [
        {
          source: "github:company/standards",
          namespace: "my-ns",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid source strings during normalization", () => {
    expect(() => normalizeExtends(["https://example.test/preset"])).toThrow(
      /Source must be/,
    );
  });
});

describe("probing: deriveNamespace contracts", () => {
  it("uses owner-repo for github source", () => {
    expect(deriveNamespace("github:company/standards")).toBe(
      "company-standards",
    );
  });

  it("strips @ref from github source", () => {
    expect(deriveNamespace("github:company/standards@v2")).toBe(
      "company-standards",
    );
  });

  it("ignores a slash-containing github ref", () => {
    expect(deriveNamespace("github:acme/mono@feature/preset-parser")).toBe(
      "acme-mono",
    );
  });

  it("rejects a github repository subpath", () => {
    expect(() => deriveNamespace("github:acme/mono/packages/presets")).toThrow(
      "Cannot derive namespace from invalid source",
    );
  });

  it("normalizes hyphens in github org names", () => {
    expect(deriveNamespace("github:acme-corp/tools")).toBe("acme-corp-tools");
  });

  it("extracts last segment from fs: source", () => {
    expect(deriveNamespace("fs:./local-presets")).toBe("local-presets");
  });

  it("extracts last segment from absolute path", () => {
    expect(deriveNamespace("/usr/share/presets")).toBe("presets");
  });

  it("strips leading dots from segment", () => {
    expect(deriveNamespace("fs:./.hidden")).toBe("hidden");
  });

  it("strips leading dots from fs:~/.cursor", () => {
    expect(deriveNamespace("fs:~/.cursor")).toBe("cursor");
  });

  it("returns 'preset' as fallback for empty derivation", () => {
    expect(deriveNamespace("fs:.")).toBe("preset");
  });
});
