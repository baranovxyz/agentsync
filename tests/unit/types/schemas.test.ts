/**
 * Schemas Type Tests
 * Tests for type definitions and utility functions in schemas.ts
 */

import { describe, it, expect } from "vitest";
import {
  normalizeExtends,
  type ExtendsEntry,
  AgentSyncConfigSchema,
  validateConfig,
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
          select: ["src/**", "lib/**"],
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "custom-namespace",
        include: ["**/*.ts", "**/*.js"],
        exclude: ["**/*.test.ts"],
        select: ["src/**", "lib/**"],
      });
    });

    it("normalizes object extends entries with select field only", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          select: ["src/**/*.ts", "docs/**/*.md"],
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        select: ["src/**/*.ts", "docs/**/*.md"],
      });
    });

    it("normalizes object extends entries with mixed fields", () => {
      const extends_ = [
        {
          source: "github:company/standards",
          include: ["**/*.ts"],
          select: ["src/**"],
        },
        {
          source: "github:team/backend",
          exclude: ["**/*.test.*"],
          select: ["api/**", "services/**"],
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        select: ["src/**"],
      });
      expect(result[1]).toEqual({
        source: "github:team/backend",
        namespace: "team",
        exclude: ["**/*.test.*"],
        select: ["api/**", "services/**"],
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
          select: ["**/*.ts"],
        },
      ];
      const result = normalizeExtends(extends_);

      expect(result[0].namespace).toBe("acme-corp");
    });

    it("throws error for invalid GitHub source format", () => {
      const extends_ = ["invalid-source-format"];

      expect(() => normalizeExtends(extends_)).toThrow(
        "Invalid GitHub source: invalid-source-format. Expected format: github:org/repo"
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
            select: ["src/**", "lib/**"],
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
        select: ["src/**", "lib/**"],
      });
    });

    it("validates config with mixed extends entries", () => {
      const config = {
        version: "1.0",
        extends: [
          "github:company/base-standards",
          {
            source: "github:team/backend",
            select: ["api/**", "services/**"],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toBe("github:company/base-standards");
      expect(result.extends?.[1]).toEqual({
        source: "github:team/backend",
        select: ["api/**", "services/**"],
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

    it("validates config with empty select array", () => {
      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: [],
          },
        ],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toEqual({
        source: "github:company/standards",
        select: [],
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
        select: ["src/**", "lib/**"],
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.select).toEqual(["src/**", "lib/**"]);
      expect(entry.include).toBeUndefined();
      expect(entry.exclude).toBeUndefined();
    });

    it("supports all fields together", () => {
      const entry: ExtendsEntry = {
        source: "github:company/standards",
        namespace: "company",
        include: ["**/*.ts"],
        exclude: ["**/*.test.ts"],
        select: ["src/**", "lib/**"],
      };

      expect(entry.source).toBe("github:company/standards");
      expect(entry.namespace).toBe("company");
      expect(entry.include).toEqual(["**/*.ts"]);
      expect(entry.exclude).toEqual(["**/*.test.ts"]);
      expect(entry.select).toEqual(["src/**", "lib/**"]);
    });
  });
});
