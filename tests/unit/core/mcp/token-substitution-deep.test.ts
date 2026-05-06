/**
 * Deep Token Substitution Tests
 * Covers edge cases in MCP env variable substitution
 */
import { describe, expect, it } from "vitest";
import type { MCP } from "../../../../src/core/mcp/tokens.js";
import {
  substituteAllMCPs,
  substituteTokens,
  validateTokens,
} from "../../../../src/core/mcp/tokens.js";

describe("Token Substitution — Deep Tests", () => {
  describe("substituteTokens", () => {
    it("substitutes single env var in command-based MCP", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
      };
      const result = substituteTokens(mcp, {
        GITHUB_TOKEN: "github_test_abc123",
      });
      expect("env" in result && result.env?.GITHUB_TOKEN).toBe(
        "github_test_abc123",
      );
    });

    it("substitutes multiple env vars", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/db"],
        env: {
          DB_HOST: "{DB_HOST}",
          DB_PORT: "{DB_PORT}",
          DB_NAME: "{DB_NAME}",
        },
      };
      const result = substituteTokens(mcp, {
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_NAME: "mydb",
      });
      expect("env" in result && result.env).toEqual({
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_NAME: "mydb",
      });
    });

    it("throws on missing env var", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
      };
      expect(() => substituteTokens(mcp, {})).toThrow(
        "Missing environment variable: GITHUB_TOKEN",
      );
    });

    it("leaves non-token strings unchanged", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/server"],
        env: { PLAIN_VALUE: "not-a-token" },
      };
      const result = substituteTokens(mcp, {});
      expect("env" in result && result.env?.PLAIN_VALUE).toBe("not-a-token");
    });

    it("handles mixed token and non-token values", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/server"],
        env: {
          TOKENED: "{MY_TOKEN}",
          PLAIN: "static-value",
        },
      };
      const result = substituteTokens(mcp, { MY_TOKEN: "secret" });
      expect("env" in result && result.env).toEqual({
        TOKENED: "secret",
        PLAIN: "static-value",
      });
    });

    it("substitutes URL-based MCP url token", () => {
      const mcp: MCP = {
        url: "https://{API_HOST}/mcp",
        headers: { Authorization: "Bearer {API_TOKEN}" },
      };
      const result = substituteTokens(mcp, {
        API_HOST: "api.example.com",
        API_TOKEN: "tok-123",
      });
      expect("url" in result && result.url).toBe("https://api.example.com/mcp");
      expect("headers" in result && result.headers?.Authorization).toBe(
        "Bearer tok-123",
      );
    });

    it("does not mutate original MCP object", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/server"],
        env: { TOKEN: "{TOKEN}" },
      };
      substituteTokens(mcp, { TOKEN: "replaced" });
      expect("env" in mcp && mcp.env?.TOKEN).toBe("{TOKEN}");
    });

    it("handles MCP without env field", () => {
      const mcp: MCP = {
        command: "npx",
        args: ["-y", "@mcp/server"],
      };
      const result = substituteTokens(mcp, {});
      expect("command" in result && result.command).toBe("npx");
    });
  });

  describe("substituteAllMCPs", () => {
    it("substitutes tokens across multiple servers", () => {
      const mcps: Record<string, MCP> = {
        github: {
          command: "npx",
          args: ["-y", "@mcp/github"],
          env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
        },
        db: {
          command: "docker",
          args: ["exec", "pg"],
          env: { DB_URL: "{DB_URL}" },
        },
      };

      const result = substituteAllMCPs(mcps, {
        GITHUB_TOKEN: "github_test_123",
        DB_URL: "postgresql://localhost/db",
      });

      expect("env" in result.github && result.github.env?.GITHUB_TOKEN).toBe(
        "github_test_123",
      );
      expect("env" in result.db && result.db.env?.DB_URL).toBe(
        "postgresql://localhost/db",
      );
    });

    it("throws if any server has missing env var", () => {
      const mcps: Record<string, MCP> = {
        server1: {
          command: "npx",
          args: [],
          env: { TOKEN: "{TOKEN}" },
        },
        server2: {
          command: "npx",
          args: [],
          env: { OTHER: "static" },
        },
      };
      expect(() => substituteAllMCPs(mcps, { OTHER: "value" })).toThrow(
        "Missing environment variable: TOKEN",
      );
    });
  });

  describe("validateTokens", () => {
    it("passes when all tokens are substituted", () => {
      const mcps: Record<string, MCP> = {
        server: {
          command: "npx",
          args: [],
          env: { TOKEN: "already-substituted" },
        },
      };
      expect(() => validateTokens(mcps)).not.toThrow();
    });

    it("throws when unsubstituted tokens remain", () => {
      const mcps: Record<string, MCP> = {
        server: {
          command: "npx",
          args: [],
          env: { TOKEN: "{MISSING_VAR}" },
        },
      };
      expect(() => validateTokens(mcps)).toThrow(
        "Missing required environment variables",
      );
    });

    it("reports all missing tokens in error message", () => {
      const mcps: Record<string, MCP> = {
        server1: {
          command: "npx",
          args: [],
          env: { A: "{VAR_A}" },
        },
        server2: {
          command: "npx",
          args: [],
          env: { B: "{VAR_B}" },
        },
      };
      try {
        validateTokens(mcps);
        expect.fail("Should have thrown");
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain("VAR_A");
        expect(msg).toContain("VAR_B");
        expect(msg).toContain("server1");
        expect(msg).toContain("server2");
      }
    });

    it("validates URL-based MCP headers too", () => {
      const mcps: Record<string, MCP> = {
        remote: {
          url: "https://api.example.com/mcp",
          headers: { Authorization: "Bearer {MISSING}" },
        },
      };
      expect(() => validateTokens(mcps)).toThrow("MISSING");
    });
  });
});
