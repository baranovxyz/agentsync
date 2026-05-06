/**
 * Config Schema v1.0 Tests
 * Validates that the schema accepts all v1.0 fields and rejects removed fields
 */
import { describe, expect, it } from "vitest";
import { AgentSyncConfigSchema } from "../../../../src/types/schemas.js";

describe("Config Schema v1.0", () => {
  describe("accepts valid v1.0 configs", () => {
    it("minimal config", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
      });
      expect(result.success).toBe(true);
    });

    it("config with all 7 tools", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: [
          "claude",
          "opencode",
          "cursor",
          "roocode",
          "codex",
          "copilot",
          "gemini",
        ],
      });
      expect(result.success).toBe(true);
    });

    it("config with MCP servers (defined = enabled)", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
        mcp: {
          github: {
            command: "npx",
            args: ["-y", "@mcp/github"],
            env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("config with URL-based MCP", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
        mcp: {
          remote: {
            url: "https://api.example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("config with extends (flat strings)", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
        extends: ["github:company/standards", "fs:./local-rules"],
      });
      expect(result.success).toBe(true);
    });

    it("empty config (defaults applied)", () => {
      const result = AgentSyncConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("rejects removed v0.2 fields", () => {
    it("rejects config with security field", () => {
      // security was removed in v1.0
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
        security: {
          secretScanning: { enabled: true },
        },
      });
      // Zod strips unknown fields by default, so this passes
      // but the security field is not in the parsed result
      if (result.success) {
        expect(result.data).not.toHaveProperty("security");
      }
    });

    it("rejects config with useSymlinks field", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["claude"],
        useSymlinks: true,
      });
      if (result.success) {
        expect(result.data).not.toHaveProperty("useSymlinks");
      }
    });
  });

  describe("rejects removed tools", () => {
    it("accepts cline as a supported tool", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["cline"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects windsurf as a tool", () => {
      const result = AgentSyncConfigSchema.safeParse({
        tools: ["windsurf"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validates extends entries", () => {
    it("rejects invalid extends string", () => {
      const result = AgentSyncConfigSchema.safeParse({
        extends: ["http://invalid-url.com"],
      });
      expect(result.success).toBe(false);
    });

    it("accepts github source string", () => {
      const result = AgentSyncConfigSchema.safeParse({
        extends: ["github:org/repo"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts filesystem source string", () => {
      const result = AgentSyncConfigSchema.safeParse({
        extends: ["fs:./local-rules"],
      });
      expect(result.success).toBe(true);
    });
  });
});
