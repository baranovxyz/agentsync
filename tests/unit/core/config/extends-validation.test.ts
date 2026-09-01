/**
 * Extends Schema Validation Tests
 * Tests extends entries: github sources, fs sources, invalid sources,
 * string format with auto-derived namespaces, reserved namespaces
 */
import { describe, expect, it } from "vitest";
import {
  AgentSyncConfigSchema,
  ExtendsEntrySchema,
  normalizeExtends,
  validateNamespace,
} from "../../../../src/types/schemas.js";

describe("Extends Validation", () => {
  describe("ExtendsEntrySchema - GitHub sources", () => {
    it("accepts valid github:org/repo format", () => {
      const result = ExtendsEntrySchema.safeParse("github:company/standards");
      expect(result.success).toBe(true);
    });

    it("accepts github source with ref", () => {
      const result = ExtendsEntrySchema.safeParse(
        "github:company/standards@v1.0",
      );
      expect(result.success).toBe(true);
    });

    it("accepts github source with branch ref", () => {
      const result = ExtendsEntrySchema.safeParse(
        "github:org/repo@feature/source-parser",
      );
      expect(result.success).toBe(true);
    });

    it("rejects an empty github ref", () => {
      const result = ExtendsEntrySchema.safeParse("github:org/repo@");
      expect(result.success).toBe(false);
    });

    it("rejects whitespace in a github ref", () => {
      const result = ExtendsEntrySchema.safeParse(
        "github:org/repo@feature branch",
      );
      expect(result.success).toBe(false);
    });

    it("rejects malformed github source (missing repo)", () => {
      const result = ExtendsEntrySchema.safeParse("github:company");
      expect(result.success).toBe(false);
    });

    it("rejects github source with spaces", () => {
      const result = ExtendsEntrySchema.safeParse("github:company/ standards");
      expect(result.success).toBe(false);
    });
  });

  describe("ExtendsEntrySchema - Filesystem sources", () => {
    it("accepts fs: prefixed path", () => {
      const result = ExtendsEntrySchema.safeParse("fs:./local-presets");
      expect(result.success).toBe(true);
    });

    it("accepts fs: with home directory", () => {
      const result = ExtendsEntrySchema.safeParse("fs:~/.cursor");
      expect(result.success).toBe(true);
    });

    it("accepts absolute path without prefix", () => {
      const result = ExtendsEntrySchema.safeParse("/Users/shared/team-rules");
      expect(result.success).toBe(true);
    });

    it("accepts relative path with dot prefix", () => {
      const result = ExtendsEntrySchema.safeParse("./relative/path");
      expect(result.success).toBe(true);
    });

    it("rejects http:// URLs", () => {
      const result = ExtendsEntrySchema.safeParse("http://example.com/presets");
      expect(result.success).toBe(false);
    });

    it("rejects git@ SSH URLs", () => {
      const result = ExtendsEntrySchema.safeParse(
        "git@github.com:company/repo.git",
      );
      expect(result.success).toBe(false);
    });
  });

  describe("ExtendsEntrySchema - missing/invalid fields", () => {
    it("rejects empty source string", () => {
      const result = ExtendsEntrySchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("validateNamespace - reserved words", () => {
    const reserved = ["custom", "local", "project", "user", "core", "default"];

    for (const word of reserved) {
      it(`rejects reserved namespace "${word}"`, () => {
        expect(() => validateNamespace(word)).toThrow(/reserved/);
      });
    }

    it("rejects reserved namespace case-insensitively", () => {
      expect(() => validateNamespace("Custom")).toThrow(/reserved/);
      expect(() => validateNamespace("LOCAL")).toThrow(/reserved/);
      expect(() => validateNamespace("Project")).toThrow(/reserved/);
    });
  });

  describe("validateNamespace - format constraints", () => {
    it("accepts alphanumeric with hyphens and underscores", () => {
      expect(() => validateNamespace("company")).not.toThrow();
      expect(() => validateNamespace("my-team")).not.toThrow();
      expect(() => validateNamespace("org_rules")).not.toThrow();
      expect(() => validateNamespace("team123")).not.toThrow();
    });

    it("rejects namespace with dots", () => {
      expect(() => validateNamespace("com.example")).toThrow(
        /invalid characters/,
      );
    });

    it("rejects namespace with spaces", () => {
      expect(() => validateNamespace("my team")).toThrow(/invalid characters/);
    });

    it("rejects namespace with special chars", () => {
      expect(() => validateNamespace("team@work")).toThrow(
        /invalid characters/,
      );
      expect(() => validateNamespace("org/sub")).toThrow(/invalid characters/);
    });

    it("rejects namespace exceeding 50 characters", () => {
      expect(() => validateNamespace("a".repeat(51))).toThrow(
        /exceeds maximum length/,
      );
    });

    it("accepts namespace at exactly 50 characters", () => {
      expect(() => validateNamespace("a".repeat(50))).not.toThrow();
    });
  });

  describe("normalizeExtends", () => {
    it("accepts string format and derives namespace", () => {
      const result = normalizeExtends(["github:org/repo"]);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("github:org/repo");
      expect(result[0].namespace).toBe("org-repo");
    });

    it("derives namespace from the repository rather than its ref", () => {
      const result = normalizeExtends([
        "github:org/repo@feature/source-parser",
      ]);

      expect(result).toEqual([
        {
          source: "github:org/repo@feature/source-parser",
          namespace: "org-repo",
        },
      ]);
    });

    it("rejects object-form entries instead of normalizing them", () => {
      const result = AgentSyncConfigSchema.safeParse({
        extends: [
          {
            source: "github:org/repo",
            namespace: "org",
            include: ["*.md"],
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("returns empty array for undefined input", () => {
      expect(normalizeExtends(undefined)).toEqual([]);
    });

    it("returns empty array for empty input", () => {
      expect(normalizeExtends([])).toEqual([]);
    });
  });

  describe("AgentSyncConfigSchema - extends integration", () => {
    it("validates config with multiple extends entries (flat strings)", () => {
      const config = {
        tools: ["claude", "cursor"],
        extends: ["github:company/standards", "fs:./local-rules"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("validates config with no extends", () => {
      const config = {
        tools: ["claude"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("validates config with empty extends array", () => {
      const config = {
        extends: [],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
