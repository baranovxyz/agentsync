/**
 * Schemas Type Tests
 * Tests for type definitions and utility functions in schemas.ts
 */

import { describe, expect, it } from "vitest";
import {
  type ExtendsEntry,
  normalizeExtends,
  safeParseLocalConfig,
  safeParseUserConfig,
  validateConfig,
  validateLocalConfig,
  validateNamespace,
  validateUserConfig,
  validateUserPresetEntry,
} from "../../../src/types/schemas.js";

describe("ExtendsEntry type", () => {
  describe("normalizeExtends function", () => {
    it("requires explicit namespace in object format", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          namespace: "company",
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
      });
    });

    it("normalizes object extends entries with include/exclude fields", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          namespace: "custom-namespace",
          include: ["**/*.ts", "**/*.js"],
          exclude: ["**/*.test.ts"],
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "custom-namespace",
        include: ["**/*.ts", "**/*.js"],
        exclude: ["**/*.test.ts"],
      });
    });

    it("handles empty extends array", () => {
      const result = normalizeExtends([]);
      expect(result).toHaveLength(0);
    });

    it("handles undefined extends", () => {
      const result = normalizeExtends(undefined);
      expect(result).toHaveLength(0);
    });

    it("throws error when namespace is missing", () => {
      const extends_ = [
        {
          source: "github:acme-corp/backend-rules",
          include: ["**/*.ts"],
        },
      ];

      expect(() => normalizeExtends(extends_)).toThrow(
        /Namespace is required for preset/,
      );
    });

    it("throws error when string format is used", () => {
      const extends_ = ["github:company/standards"];

      expect(() => normalizeExtends(extends_)).toThrow(
        /String format for extends is deprecated/,
      );
    });

    it("throws error when source is missing", () => {
      const extends_ = [
        {
          namespace: "company",
        },
      ];

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime error for invalid input
      expect(() => normalizeExtends(extends_ as any)).toThrow(
        "Source is required in extends entry",
      );
    });
  });

  describe("validateNamespace function", () => {
    it("accepts valid namespace", () => {
      expect(() => validateNamespace("company")).not.toThrow();
      expect(() => validateNamespace("backend-team")).not.toThrow();
      expect(() => validateNamespace("team_rules")).not.toThrow();
      expect(() => validateNamespace("acme123")).not.toThrow();
    });

    it("rejects reserved namespace", () => {
      expect(() => validateNamespace("custom")).toThrow(/reserved/);
      expect(() => validateNamespace("local")).toThrow(/reserved/);
      expect(() => validateNamespace("project")).toThrow(/reserved/);
      expect(() => validateNamespace("user")).toThrow(/reserved/);
    });

    it("rejects namespace with invalid characters", () => {
      expect(() => validateNamespace("company.rules")).toThrow(
        /invalid characters/,
      );
      expect(() => validateNamespace("team@name")).toThrow(
        /invalid characters/,
      );
      expect(() => validateNamespace("org name")).toThrow(/invalid characters/);
    });

    it("rejects namespace exceeding max length", () => {
      const longNamespace = "a".repeat(51);
      expect(() => validateNamespace(longNamespace)).toThrow(
        /exceeds maximum length/,
      );
    });

    it("is case-insensitive for reserved words", () => {
      expect(() => validateNamespace("Custom")).toThrow(/reserved/);
      expect(() => validateNamespace("LOCAL")).toThrow(/reserved/);
    });
  });

  describe("AgentSyncConfig schema validation", () => {
    it("validates config with include/exclude fields", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            include: ["**/*.ts"],
            exclude: ["**/*.test.ts"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        exclude: ["**/*.test.ts"],
      });
    });

    it("requires explicit namespace for all extends entries", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/base-standards",
            namespace: "company",
          },
          {
            source: "github:team/backend",
            namespace: "backend-team",
            include: ["**/*.ts"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/base-standards",
        namespace: "company",
      });
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        namespace: "backend-team",
        include: ["**/*.ts"],
      });
    });

    it("validates config with include only", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            include: ["**/*.ts"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
      });
    });

    it("validates config with exclude only", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            exclude: ["**/*.test.ts"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        exclude: ["**/*.test.ts"],
      });
    });
  });

  describe("ExtendsEntry type compatibility", () => {
    it("supports source, namespace, include, and exclude fields", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        exclude: ["**/*.test.ts"],
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.include).toEqual(["**/*.ts"]);
      expect(entry.exclude).toEqual(["**/*.test.ts"]);
    });

    it("allows optional include and exclude", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.include).toBeUndefined();
      expect(entry.exclude).toBeUndefined();
    });

    it("supports include only", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.include).toEqual(["**/*.ts"]);
      expect(entry.exclude).toBeUndefined();
    });

    describe("UserConfig schema validation", () => {
      it("validates user config with presets", () => {
        const config = {
          version: "1.0",
          presets: {
            "company-standards": {
              source: "github:company/standards",
              type: "github",
              addedAt: "2023-10-22T06:53:00.000Z",
              description: "Company coding standards",
            },
            "local-rules": {
              source: "/path/to/local/rules",
              type: "filesystem",
              addedAt: "2023-10-22T06:53:00.000Z",
            },
          },
          tools: ["cursor", "claude"],
        };

        const result = validateUserConfig(config);

        expect(result.version).toBe("1.0");
        expect(result.presets).toHaveProperty("company-standards");
        expect(result.presets).toHaveProperty("local-rules");
        expect(result.presets["company-standards"]).toEqual({
          source: "github:company/standards",
          type: "github",
          addedAt: "2023-10-22T06:53:00.000Z",
          description: "Company coding standards",
        });
        expect(result.tools).toEqual(["cursor", "claude"]);
      });

      it("validates user config with minimal data", () => {
        const config = {
          presets: {
            "my-preset": {
              source: "github:user/repo",
              type: "github",
              addedAt: "2023-10-22T06:53:00.000Z",
            },
          },
        };

        const result = validateUserConfig(config);

        expect(result.version).toBe("1.0"); // default value
        expect(result.presets).toHaveProperty("my-preset");
        expect(result.tools).toBeUndefined();
      });

      it("validates user preset entry", () => {
        const entry = {
          source: "github:company/standards",
          type: "github" as const,
          addedAt: "2023-10-22T06:53:00.000Z",
          description: "Company standards",
        };

        const result = validateUserPresetEntry(entry);

        expect(result.source).toBe("github:company/standards");
        expect(result.type).toBe("github");
        expect(result.addedAt).toBe("2023-10-22T06:53:00.000Z");
        expect(result.description).toBe("Company standards");
      });

      it("validates filesystem preset entry", () => {
        const entry = {
          source: "/path/to/local/preset",
          type: "filesystem" as const,
          addedAt: "2023-10-22T06:53:00.000Z",
        };

        const result = validateUserPresetEntry(entry);

        expect(result.source).toBe("/path/to/local/preset");
        expect(result.type).toBe("filesystem");
        expect(result.addedAt).toBe("2023-10-22T06:53:00.000Z");
        expect(result.description).toBeUndefined();
      });

      it("rejects invalid preset entry type", () => {
        const entry = {
          source: "github:company/standards",
          type: "invalid",
          addedAt: "2023-10-22T06:53:00.000Z",
        };

        expect(() => validateUserPresetEntry(entry)).toThrow();
      });

      it("rejects empty source", () => {
        const entry = {
          source: "",
          type: "github" as const,
          addedAt: "2023-10-22T06:53:00.000Z",
        };

        expect(() => validateUserPresetEntry(entry)).toThrow(
          "Source cannot be empty",
        );
      });

      it("safe parse user config with valid data", () => {
        const config = {
          presets: {
            "test-preset": {
              source: "github:test/repo",
              type: "github" as const,
              addedAt: "2023-10-22T06:53:00.000Z",
            },
          },
        };

        const result = safeParseUserConfig(config);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.presets).toHaveProperty("test-preset");
        }
      });

      it("safe parse user config with invalid data", () => {
        const config = {
          presets: {
            "test-preset": {
              source: "github:test/repo",
              type: "invalid",
              addedAt: "2023-10-22T06:53:00.000Z",
            },
          },
        };

        const result = safeParseUserConfig(config);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe("LocalConfig schema validation", () => {
    it("validates local config with extends", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
          },
          {
            source: "github:team/backend",
            namespace: "backend-team",
            include: ["**/*.ts"],
          },
        ],
      };

      const result = validateLocalConfig(config);

      expect(result.version).toBe("1.0");
      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
      });
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        namespace: "backend-team",
        include: ["**/*.ts"],
      });
    });

    it("validates local config with minimal data", () => {
      const config = {};

      const result = validateLocalConfig(config);

      expect(result.version).toBe("1.0"); // default value
      expect(result.extends).toBeUndefined();
    });

    it("validates local config with object extends only", () => {
      const config = {
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            include: ["**/*.ts"],
          },
          {
            source: "github:team/backend",
            namespace: "backend",
            exclude: ["**/*.test.ts"],
          },
        ],
      };

      const result = validateLocalConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
      });
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        namespace: "backend",
        exclude: ["**/*.test.ts"],
      });
    });

    it("validates local config with empty extends array", () => {
      const config = {
        extends: [],
      };

      const result = validateLocalConfig(config);

      expect(result.extends).toEqual([]);
    });

    it("safe parse local config with valid data", () => {
      const config = {
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
          },
        ],
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extends).toEqual([
          {
            source: "github:company/standards",
            namespace: "company",
          },
        ]);
      }
    });

    it("safe parse local config with include/exclude", () => {
      const config = {
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            include: ["rules/**/*.md"],
            exclude: ["rules/deprecated/*"],
          },
        ],
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extends?.[0]).toEqual({
          source: "github:company/standards",
          namespace: "company",
          include: ["rules/**/*.md"],
          exclude: ["rules/deprecated/*"],
        });
      }
    });
  });
});
