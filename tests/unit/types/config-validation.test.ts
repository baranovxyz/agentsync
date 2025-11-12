/**
 * Config Validation Tests
 * Tests that Zod schemas enforce correct types for config fields
 */

import { describe, expect, it } from "vitest";
import { AgentSyncConfigSchema } from "../../../src/types/schemas.js";

describe("AgentSync Config Schema Validation", () => {
  describe("mcpServers field", () => {
    it("accepts object format (correct)", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {
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
        version: "1.0",
        extends: [],
        mcpServers: {},
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects array format (old format)", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: [], // Wrong format!
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMessage = result.error.toString();
        expect(errorMessage).toContain("mcpServers");
        expect(errorMessage.toLowerCase()).toContain("record");
      }
    });

    it("rejects array of strings format", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: ["github", "postgres"], // Wrong format!
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("accepts command-based MCP server", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {
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
        version: "1.0",
        extends: [],
        mcpServers: {
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
        version: "1.0",
        extends: [],
        mcpServers: {
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

  describe("mcpEnabled field", () => {
    it("accepts array of strings", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {},
        mcpEnabled: ["github", "postgres"],
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts empty array", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {},
        mcpEnabled: [],
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("is optional", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {},
        tools: ["cursor"],
        // No mcpEnabled field
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("mcpDisabled field", () => {
    it("accepts array of strings", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {},
        mcpEnabled: ["github", "postgres"],
        mcpDisabled: ["postgres"],
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("is optional", () => {
      const config = {
        version: "1.0",
        extends: [],
        mcpServers: {},
        mcpEnabled: ["github"],
        tools: ["cursor"],
        // No mcpDisabled field
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("config without mcpServers field", () => {
    it("accepts config without mcpServers (field is optional)", () => {
      const config = {
        version: "1.0",
        extends: [],
        tools: ["cursor"],
      };

      const result = AgentSyncConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
