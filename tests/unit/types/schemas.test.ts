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
  validateUserConfig,
  validateUserPresetEntry,
} from "../../../src/types/schemas.js";

describe("ExtendsEntry type", () => {
  describe("normalizeExtends function", () => {
    it("normalizes string extends entries", () => {
      const extends_ = ["github:company/standards", "github:team/backend"];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
      });
      expect(result[1]).toEqual({
        source: "github:team/backend",
        namespace: "team",
      });
    });

    it("normalizes object extends entries with all fields", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          namespace: "custom-namespace",
          include: ["**/*.ts", "**/*.js"],
          exclude: ["**/*.test.ts"],
          select: {
            rules: {
              include: ["src/**", "lib/**"],
            },
          },
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "custom-namespace",
        include: ["**/*.ts", "**/*.js"],
        exclude: ["**/*.test.ts"],
        select: {
          rules: {
            include: ["src/**", "lib/**"],
          },
        },
      });
    });

    it("normalizes object extends entries with select field only", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          select: {
            rules: {
              include: ["src/**/*.ts", "docs/**/*.md"],
            },
          },
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        select: {
          rules: {
            include: ["src/**/*.ts", "docs/**/*.md"],
          },
        },
      });
    });

    it("normalizes object extends entries with mixed fields", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          include: ["**/*.ts"],
          select: {
            rules: {
              include: ["src/**"],
            },
          },
        },
        {
          source: "github:team/backend",
          exclude: ["**/*.test.*"],
          select: {
            commands: {
              include: ["api/**", "services/**"],
            },
          },
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        select: {
          rules: {
            include: ["src/**"],
          },
        },
      });
      expect(result[1]).toEqual({
        source: "github:team/backend",
        namespace: "team",
        exclude: ["**/*.test.*"],
        select: {
          commands: {
            include: ["api/**", "services/**"],
          },
        },
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

    it("extracts namespace from source when not provided", () => {
      const extends_ = [
        {
          source: "github:acme-corp/backend-rules",
          select: {
            rules: {
              include: ["**/*.ts"],
            },
          },
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result[0].namespace).toBe("acme-corp");
    });

    it("throws error for invalid GitHub source format", () => {
      const extends_ = ["invalid-source-format"];

      expect(() => normalizeExtends(extends_)).toThrow(
        "Invalid GitHub source: invalid-source-format. Expected format: github:org/repo",
      );
    });
  });

  describe("AgentSyncConfig schema validation", () => {
    it("validates config with select field in extends", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
            include: ["**/*.ts"],
            exclude: ["**/*.test.ts"],
            select: {
              rules: {
                include: ["src/**", "lib/**"],
              },
            },
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
        select: {
          rules: {
            include: ["src/**", "lib/**"],
          },
        },
      });
    });

    it("validates config with mixed extends entries", () => {
      const config = {
        version: "1.0",
        extends: [
          "github:company/base-standards",
          {
            source: "github:team/backend",
            select: {
              commands: {
                include: ["api/**", "services/**"],
              },
            },
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toBe("github:company/base-standards");
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        select: {
          commands: {
            include: ["api/**", "services/**"],
          },
        },
      });
    });

    it("validates config without select field", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            include: ["**/*.ts"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        include: ["**/*.ts"],
      });
    });

    it("validates config with empty select object", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {},
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        select: {},
      });
    });

    it("validates config with PresetSelectionSchema in select field", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: {
                include: ["**/*.ts", "**/*.js"],
                exclude: ["**/*.test.ts"],
              },
              commands: {
                include: ["build.*", "test.*"],
              },
              mcps: ["github", "filesystem"],
            },
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        select: {
          rules: {
            include: ["**/*.ts", "**/*.js"],
            exclude: ["**/*.test.ts"],
          },
          commands: {
            include: ["build.*", "test.*"],
          },
          mcps: ["github", "filesystem"],
        },
      });
    });

    it("validates config with partial PresetSelectionSchema", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: {
                include: ["**/*.ts"],
              },
            },
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        select: {
          rules: {
            include: ["**/*.ts"],
          },
        },
      });
    });
  });

  describe("ExtendsEntry type compatibility", () => {
    it("maintains backward compatibility with existing fields", () => {
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
      expect(entry.select).toBeUndefined();
    });

    it("supports new select field", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
        select: {
          rules: {
            include: ["src/**", "lib/**"],
          },
        },
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.select).toEqual({
        rules: {
          include: ["src/**", "lib/**"],
        },
      });
      expect(entry.include).toBeUndefined();
      expect(entry.exclude).toBeUndefined();
    });

    it("supports all fields together", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        exclude: ["**/*.test.ts"],
        select: {
          rules: {
            include: ["src/**", "lib/**"],
          },
        },
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.include).toEqual(["**/*.ts"]);
      expect(entry.exclude).toEqual(["**/*.test.ts"]);
      expect(entry.select).toEqual({
        rules: {
          include: ["src/**", "lib/**"],
        },
      });
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
          "github:company/standards",
          {
            source: "github:team/backend",
            namespace: "backend-team",
            select: {
              rules: {
                include: ["**/*.ts"],
              },
            },
          },
        ],
      };

      const result = validateLocalConfig(config);

      expect(result.version).toBe("1.0");
      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toBe("github:company/standards");
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        namespace: "backend-team",
        select: {
          rules: {
            include: ["**/*.ts"],
          },
        },
      });
    });

    it("validates local config with minimal data", () => {
      const config = {};

      const result = validateLocalConfig(config);

      expect(result.version).toBe("1.0"); // default value
      expect(result.extends).toBeUndefined();
    });

    it("validates local config with string extends only", () => {
      const config = {
        extends: ["github:company/standards", "github:team/backend"],
      };

      const result = validateLocalConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toBe("github:company/standards");
      expect(result.extends?.[1]).toBe("github:team/backend");
    });

    it("validates local config with object extends only", () => {
      const config = {
        extends: [
          {
            source: "github:company/standards",
            select: {
              commands: {
                include: ["build.*"],
              },
            },
          },
          {
            source: "github:team/backend",
            namespace: "backend",
          },
        ],
      };

      const result = validateLocalConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        select: {
          commands: {
            include: ["build.*"],
          },
        },
      });
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        namespace: "backend",
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
        extends: ["github:company/standards"],
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extends).toEqual(["github:company/standards"]);
      }
    });

    it("safe parse local config with invalid data", () => {
      const config = {
        extends: [
          {
            source: "github:company/standards",
            select: "invalid-select-type",
          },
        ],
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });
});
