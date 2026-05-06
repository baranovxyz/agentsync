import { describe, expect, it } from "vitest";
import { deriveNamespace, normalizeExtends } from "../../src/types/schemas.js";

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

  it("handles legacy object format with explicit namespace", () => {
    const result = normalizeExtends([
      { source: "github:company/standards", namespace: "my-ns" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("github:company/standards");
    expect(result[0].namespace).toBe("my-ns");
  });

  it("handles legacy object format deriving namespace when not provided", () => {
    const result = normalizeExtends([{ source: "github:company/standards" }]);
    expect(result).toHaveLength(1);
    expect(result[0].namespace).toBe("company-standards");
  });

  it("handles legacy object format with include/exclude", () => {
    const result = normalizeExtends([
      {
        source: "github:company/standards",
        namespace: "stds",
        include: ["*.ts"],
        exclude: ["test/**"],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].include).toEqual(["*.ts"]);
    expect(result[0].exclude).toEqual(["test/**"]);
  });

  it("throws on reserved namespace", () => {
    // "default" is a reserved namespace
    expect(() =>
      normalizeExtends([{ source: "github:org/repo", namespace: "default" }]),
    ).toThrow(/reserved/i);
  });

  it("throws on invalid namespace characters", () => {
    expect(() =>
      normalizeExtends([
        { source: "github:org/repo", namespace: "bad namespace!" },
      ]),
    ).toThrow(/invalid characters/i);
  });

  it("throws on object entry missing source", () => {
    expect(() =>
      normalizeExtends([{ namespace: "foo" } as Record<string, unknown>]),
    ).toThrow();
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

  it("uses owner-repo-leaf for github subpath", () => {
    expect(deriveNamespace("github:acme/mono/packages/presets")).toBe(
      "acme-mono-presets",
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
