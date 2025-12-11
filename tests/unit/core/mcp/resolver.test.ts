/**
 * MCP Config Resolver Tests
 * Tests the precedence chain for resolving MCP config from multiple sources
 */

import { describe, expect, it } from "vitest";
import {
  isValidMCP,
  resolveMCPConfig,
} from "../../../../src/core/mcp/resolver.js";

describe("resolveMCPConfig", () => {
  describe("precedence chain", () => {
    it("prefers JSON over transport", () => {
      const result = resolveMCPConfig({
        json: '{"command":"node","args":["server.js"]}',
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
      });

      expect(result).toEqual({
        command: "node",
        args: ["server.js"],
      });
    });

    it("prefers transport over preset", () => {
      const result = resolveMCPConfig({
        transport: "http",
        url: "https://api.example.com/mcp",
        preset: "github:owner/repo",
      });

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
      });
    });

    it("prefers preset over registry", () => {
      // Preset extraction not implemented yet, so this tests that it throws appropriately
      // Should fail since preset extraction not implemented
      expect(() => {
        resolveMCPConfig({
          preset: "github:owner/repo",
        });
      }).toThrow("Preset extraction not yet implemented");
    });
  });

  describe("JSON parsing", () => {
    it("parses valid command-based JSON", () => {
      const json =
        '{"command":"npx","args":["-y","@org/server"],"env":{"API_KEY":"secret"}}';

      const result = resolveMCPConfig({ json });

      expect(result).toEqual({
        command: "npx",
        args: ["-y", "@org/server"],
        env: { API_KEY: "secret" },
      });
    });

    it("parses valid URL-based JSON", () => {
      const json =
        '{"url":"https://api.example.com/mcp","headers":{"Auth":"Bearer token"}}';

      const result = resolveMCPConfig({ json });

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
        headers: { Auth: "Bearer token" },
      });
    });

    it("throws error for invalid JSON", () => {
      expect(() => {
        resolveMCPConfig({ json: "invalid json{" });
      }).toThrow(/Failed to parse --json/);
    });

    it("throws error for invalid MCP structure in JSON", () => {
      expect(() => {
        resolveMCPConfig({ json: '{"foo":"bar"}' });
      }).toThrow(/Failed to parse --json/);
    });
  });

  describe("transport parsing", () => {
    it("parses stdio transport", () => {
      const result = resolveMCPConfig({
        transport: "stdio",
        command: "node",
        args: ["./server.js"],
      });

      expect(result).toEqual({
        command: "node",
        args: ["./server.js"],
      });
    });

    it("parses http transport", () => {
      const result = resolveMCPConfig({
        transport: "http",
        url: "https://api.example.com/mcp",
      });

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
      });
    });

    it("includes env in transport", () => {
      const result = resolveMCPConfig({
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: { KEY: "value" },
      });

      expect(result).toEqual({
        command: "npx",
        args: ["-y", "server"],
        env: { KEY: "value" },
      });
    });
  });

  describe("error handling", () => {
    it("throws error if no config source provided", () => {
      expect(() => {
        resolveMCPConfig({});
      }).toThrow(/No MCP configuration source provided/);
    });

    it("suggests available sources in error message", () => {
      try {
        resolveMCPConfig({});
        expect.fail("Should have thrown");
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain("--json");
        expect(msg).toContain("--transport");
        expect(msg).toContain("--preset");
      }
    });
  });
});

describe("isValidMCP", () => {
  it("accepts command-based MCP", () => {
    const mcp = {
      command: "npx",
      args: ["-y", "server"],
    };

    expect(isValidMCP(mcp)).toBe(true);
  });

  it("accepts URL-based MCP", () => {
    const mcp = {
      url: "https://api.example.com/mcp",
    };

    expect(isValidMCP(mcp)).toBe(true);
  });

  it("accepts MCP with headers", () => {
    const mcp = {
      url: "https://api.example.com/mcp",
      headers: { Auth: "Bearer token" },
    };

    expect(isValidMCP(mcp)).toBe(true);
  });

  it("accepts MCP with env", () => {
    const mcp = {
      command: "node",
      args: ["server.js"],
      env: { API_KEY: "secret" },
    };

    expect(isValidMCP(mcp)).toBe(true);
  });

  it("rejects non-object", () => {
    expect(isValidMCP("not an object")).toBe(false);
    expect(isValidMCP(123)).toBe(false);
    expect(isValidMCP(null)).toBe(false);
  });

  it("rejects object without required fields", () => {
    expect(isValidMCP({ foo: "bar" })).toBe(false);
    expect(isValidMCP({ command: "npx" })).toBe(false); // Missing args
    expect(isValidMCP({ args: [] })).toBe(false); // Missing command
  });

  it("rejects object with invalid args type", () => {
    const mcp = {
      command: "npx",
      args: "not-an-array",
    };

    expect(isValidMCP(mcp)).toBe(false);
  });
});
