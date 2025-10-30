/**
 * Architecture Consistency Tests
 * Validates that all layers (types, schemas, converters) stay in sync
 */

import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import { getConverterByName } from "../../../src/targets/tools/index.js";
import type { ToolName } from "../../../src/types/index.js";
import {
  AgentSyncConfigSchema,
  UserConfigSchema,
} from "../../../src/types/schemas.js";

describe("Architecture Consistency", () => {
  describe("Supported tools constant matches schema validation", () => {
    it("AgentSyncConfigSchema accepts all supported tools", () => {
      for (const tool of SUPPORTED_TOOLS) {
        const result = AgentSyncConfigSchema.safeParse({
          version: "1.0",
          tools: [tool],
        });

        if (!result.success) {
          throw new Error(
            `Tool "${tool}" failed validation: ${JSON.stringify(result.error.issues)}`,
          );
        }

        expect(result.success).toBe(true);
      }
    });

    it("UserConfigSchema accepts all supported tools", () => {
      for (const tool of SUPPORTED_TOOLS) {
        const result = UserConfigSchema.safeParse({
          version: "1.0",
          presets: {},
          tools: [tool],
        });

        if (!result.success) {
          throw new Error(
            `Tool "${tool}" failed UserConfig validation: ${JSON.stringify(result.error.issues)}`,
          );
        }

        expect(result.success).toBe(true);
      }
    });

    it("schemas accept multiple supported tools", () => {
      const result = AgentSyncConfigSchema.safeParse({
        version: "1.0",
        tools: [...SUPPORTED_TOOLS],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Every supported tool has a converter implementation", () => {
    it("getConverterByName works for all supported tools", () => {
      for (const tool of SUPPORTED_TOOLS) {
        expect(() => getConverterByName(tool)).not.toThrow();
        const converter = getConverterByName(tool);
        expect(converter).toBeDefined();
        expect(converter.name).toBe(tool);
      }
    });

    it("all converters implement required interface", () => {
      for (const tool of SUPPORTED_TOOLS) {
        const converter = getConverterByName(tool);

        // Check all required methods exist
        expect(typeof converter.syncAgents).toBe("function");
        expect(typeof converter.syncRules).toBe("function");
        expect(typeof converter.syncCommands).toBe("function");
        expect(typeof converter.syncMCP).toBe("function");

        // Check name property
        expect(converter.name).toBe(tool);
      }
    });
  });

  describe("Schema rejects tools without converters", () => {
    it("AgentSyncConfigSchema rejects unsupported tools", () => {
      const unsupportedTools = [
        "windsurf",
        "copilot",
        "nonexistent",
        "invalid",
      ];

      for (const tool of unsupportedTools) {
        const result = AgentSyncConfigSchema.safeParse({
          version: "1.0",
          tools: [tool],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          // Zod returns "invalid_value" for enum validation failures
          expect(result.error.issues[0].code).toBe("invalid_value");
        }
      }
    });

    it("UserConfigSchema rejects unsupported tools", () => {
      const unsupportedTools = ["windsurf", "copilot", "nonexistent"];

      for (const tool of unsupportedTools) {
        const result = UserConfigSchema.safeParse({
          version: "1.0",
          presets: {},
          tools: [tool],
        });

        expect(result.success).toBe(false);
      }
    });

    it("schemas reject mixed valid and invalid tools", () => {
      const result = AgentSyncConfigSchema.safeParse({
        version: "1.0",
        tools: ["cursor", "invalid-tool", "claude"],
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Single source of truth consistency", () => {
    it("SUPPORTED_TOOLS constant has no duplicates", () => {
      const unique = new Set(SUPPORTED_TOOLS);
      expect(unique.size).toBe(SUPPORTED_TOOLS.length);
    });

    it("SUPPORTED_TOOLS contains only lowercase alphanumeric names starting with letter", () => {
      for (const tool of SUPPORTED_TOOLS) {
        // Tool names must start with a letter, then can contain letters/numbers
        expect(tool).toMatch(/^[a-z][a-z0-9]*$/);
      }
    });

    it("all supported tools are non-empty strings", () => {
      for (const tool of SUPPORTED_TOOLS) {
        expect(typeof tool).toBe("string");
        expect(tool.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Cross-layer integration", () => {
    it("schema validation and converter lookup work together", () => {
      // Simulate the real workflow: validate config, then get converters
      const config = {
        version: "1.0",
        tools: ["cursor", "claude"],
      };

      const validationResult = AgentSyncConfigSchema.safeParse(config);
      expect(validationResult.success).toBe(true);

      if (validationResult.success) {
        const tools = validationResult.data.tools || [];

        // Should be able to get converters for all validated tools
        for (const tool of tools) {
          expect(() => getConverterByName(tool as ToolName)).not.toThrow();
        }
      }
    });

    it("rejects config with tools that have no converters", () => {
      const config = {
        version: "1.0",
        tools: ["nonexistent-tool"],
      };

      const validationResult = AgentSyncConfigSchema.safeParse(config);

      // Should fail at validation step, before trying to get converter
      expect(validationResult.success).toBe(false);
    });
  });
});
