/**
 * Schemas Type Tests
 * Tests for type definitions and utility functions in schemas.ts
 */

import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS, type ToolName } from "../../../src/types/index.js";
import {
  AgentSyncConfigSchema,
  type ExtendsEntry,
  normalizeExtends,
  safeParseLocalConfig,
  validateConfig,
  validateLocalConfig,
  validateNamespace,
} from "../../../src/types/schemas.js";

describe("ExtendsEntry type", () => {
  describe("normalizeExtends function", () => {
    it("accepts string format and derives namespace", () => {
      const extends_ = ["github:company/standards"];
      const result = normalizeExtends(extends_);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "github:company/standards",
        namespace: "company-standards",
      });
    });

    it("accepts legacy object format with explicit namespace", () => {
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

    it("derives namespace from object format when namespace is missing", () => {
      const extends_ = [
        {
          source: "github:acme-corp/backend-rules",
        },
      ];

      const result = normalizeExtends(extends_);
      expect(result).toHaveLength(1);
      expect(result[0].namespace).toBe("acme-corp-backend-rules");
    });

    it("derives namespace from various string formats", () => {
      const testCases = [
        { input: "github:company/standards", expected: "company-standards" },
        { input: "github:company/standards@v2", expected: "company-standards" },
        { input: "fs:./local-presets", expected: "local-presets" },
        { input: "fs:C:\\Users\\me\\.cursor", expected: "cursor" },
        { input: "/absolute/path", expected: "path" },
        { input: "./relative/path", expected: "path" },
      ];

      for (const { input, expected } of testCases) {
        const result = normalizeExtends([input]);
        expect(result[0].namespace).toBe(expected);
      }
    });

    it("throws error when source is missing", () => {
      const extends_ = [
        {
          namespace: "company",
        },
      ];

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime error for invalid input
      expect(() => normalizeExtends(extends_ as any)).toThrow();
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
    it("validates config with flat string extends", () => {
      const config = {
        extends: ["github:company/standards"],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(1);
      expect(result.extends?.[0]).toBe("github:company/standards");
    });

    it("validates config with multiple flat string extends", () => {
      const config = {
        extends: ["github:company/base-standards", "fs:./local-rules"],
        tools: ["cursor"],
      };

      const result = validateConfig(config);

      expect(result.extends).toHaveLength(2);
      expect(result.extends?.[0]).toBe("github:company/base-standards");
      expect(result.extends?.[1]).toBe("fs:./local-rules");
    });

    it("validates config with empty extends", () => {
      const config = {
        extends: [],
        tools: ["cursor"],
      };

      const result = validateConfig(config);
      expect(result.extends).toEqual([]);
    });

    it("validates config without extends", () => {
      const config = {
        tools: ["cursor"],
      };

      const result = validateConfig(config);
      expect(result.extends).toBeUndefined();
    });
  });

  describe("ExtendsEntry type compatibility", () => {
    it("ExtendsEntry is a string type (flat format)", () => {
      const entry: ExtendsEntry = "github:company/standards";
      expect(typeof entry).toBe("string");
    });
  });

  describe("LocalConfig schema validation", () => {
    it("validates local config with mcp and mcp_disabled", () => {
      const config = {
        mcp: {
          github: { command: "npx", args: ["-y", "mcp-github"] },
        },
        mcp_disabled: ["postgres"],
      };

      const result = validateLocalConfig(config);

      expect(result.mcp).toBeDefined();
      expect(result.mcp?.github).toBeDefined();
      expect(result.mcp_disabled).toEqual(["postgres"]);
    });

    it("validates local config with minimal data", () => {
      const config = {};

      const result = validateLocalConfig(config);

      expect(result.mcp).toBeUndefined();
      expect(result.mcp_disabled).toBeUndefined();
    });

    it("validates local config with mcp only", () => {
      const config = {
        mcp: {
          "my-local": { command: "node", args: ["./my-mcp.js"] },
        },
      };

      const result = validateLocalConfig(config);

      expect(result.mcp).toBeDefined();
      expect(result.mcp_disabled).toBeUndefined();
    });

    it("validates local config with empty mcp_disabled", () => {
      const config = {
        mcp_disabled: [],
      };

      const result = validateLocalConfig(config);

      expect(result.mcp_disabled).toEqual([]);
    });

    it("safe parse local config with valid data", () => {
      const config = {
        mcp: {
          github: { command: "npx", args: ["-y", "mcp-github"] },
        },
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcp?.github).toBeDefined();
      }
    });

    it("safe parse local config with mcp_disabled", () => {
      const config = {
        mcp_disabled: ["postgres"],
      };

      const result = safeParseLocalConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcp_disabled).toEqual(["postgres"]);
      }
    });
  });

  describe("Supported tools single source of truth", () => {
    it("has exactly 19 supported tools", () => {
      expect(SUPPORTED_TOOLS).toHaveLength(19);
    });

    it("includes all supported tools", () => {
      expect(SUPPORTED_TOOLS).toEqual([
        "claude",
        "opencode",
        "cursor",
        "roocode",
        "codex",
        "copilot",
        "cline",
        "gemini",
        "amp",
        "goose",
        "aider",
        "amazonq",
        "augment",
        "kiro",
        "openhands",
        "junie",
        "crush",
        "kilocode",
        "qwen",
      ]);
    });

    it("TypeScript type matches the constant", () => {
      // TypeScript compile-time check that ToolName matches SUPPORTED_TOOLS
      const tools: ToolName[] = [...SUPPORTED_TOOLS];
      expect(tools).toEqual(SUPPORTED_TOOLS);
    });

    it("AgentSyncConfigSchema accepts all supported tools", () => {
      for (const tool of SUPPORTED_TOOLS) {
        const config = {
          tools: [tool],
        };
        const result = AgentSyncConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it("schemas reject unsupported tools", () => {
      const invalidTools = ["windsurf", "invalid"];

      for (const invalidTool of invalidTools) {
        const config = {
          tools: [invalidTool],
        };
        const result = AgentSyncConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      }
    });
  });
});
