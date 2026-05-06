/**
 * Config Validation Tests
 * Tests that Zod schemas enforce correct types for config fields
 */

import { describe, expect, it } from "vitest";
import { AgentSyncConfigSchema } from "../../../src/types/schemas.js";

describe("AgentSync Config Schema Validation", () => {
  describe("mcp field", () => {
    it("accepts object format (correct)", () => {
      const config = {
        extends: [],
        mcp: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
        },
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts empty object format", () => {
      const config = {
        extends: [],
        mcp: {},
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects array format (old format)", () => {
      const config = {
        extends: [],
        mcp: [], // Wrong format!
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMessage = result.error.toString();
        expect(errorMessage).toContain("mcp");
      }
    });

    it("rejects array of strings format", () => {
      const config = {
        extends: [],
        mcp: ["github", "postgres"], // Wrong format!
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("accepts command-based MCP server", () => {
      const config = {
        extends: [],
        mcp: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "token",
            },
          },
        },
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts URL-based MCP server", () => {
      const config = {
        extends: [],
        mcp: {
          "remote-api": {
            url: "https://api.example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
        },
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts mixed command and URL servers", () => {
      const config = {
        extends: [],
        mcp: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
          "remote-api": {
            url: "https://api.example.com/mcp",
          },
        },
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("config without mcp field", () => {
    it("accepts config without mcp (field is optional)", () => {
      const config = {
        extends: [],
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
