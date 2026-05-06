/**
 * Architecture Consistency Tests
 * Validates that all layers (types, schemas) stay in sync
 */

import { describe, expect, it } from "vitest";
import {
  OPTIONAL_ADAPTER_TOOLS,
  SUPPORTED_TOOLS,
  VALIDATED_CLI_TOOLS,
} from "../../../src/constants.js";
import { AgentSyncConfigSchema } from "../../../src/types/schemas.js";

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

    it("schemas accept multiple supported tools", () => {
      const result = AgentSyncConfigSchema.safeParse({
        version: "1.0",
        tools: [...SUPPORTED_TOOLS],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Schema rejects tools without converters", () => {
    it("AgentSyncConfigSchema rejects unsupported tools", () => {
      const unsupportedTools = ["windsurf", "nonexistent", "invalid"];

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

    it("validated CLI tools are supported tools", () => {
      for (const tool of VALIDATED_CLI_TOOLS) {
        expect(SUPPORTED_TOOLS).toContain(tool);
      }
    });

    it("optional adapters are supported tools outside maintainer validation", () => {
      const validated = new Set(VALIDATED_CLI_TOOLS);
      const expectedOptional = SUPPORTED_TOOLS.filter(
        (tool) => !validated.has(tool),
      );

      expect(OPTIONAL_ADAPTER_TOOLS).toEqual(expectedOptional);
      expect(OPTIONAL_ADAPTER_TOOLS).toEqual([
        "cursor",
        "roocode",
        "copilot",
        "cline",
      ]);
    });
  });
});
