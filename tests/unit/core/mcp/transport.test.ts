/**
 * Transport Parser Tests
 * Parses CLI flags into MCP configurations
 */

import { describe, expect, it } from "vitest";
import type { TransportOptions } from "../../../../src/core/mcp/transport.js";
import { parseTransport } from "../../../../src/core/mcp/transport.js";

describe("parseTransport", () => {
  describe("stdio transport", () => {
    it("parses basic stdio command", () => {
      const options: TransportOptions = {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@org/mcp-server"],
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        command: "npx",
        args: ["-y", "@org/mcp-server"],
      });
    });

    it("includes env variables in stdio config", () => {
      const options: TransportOptions = {
        transport: "stdio",
        command: "node",
        args: ["./server.js"],
        env: {
          API_KEY: "secret123",
          DEBUG: "true",
        },
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        command: "node",
        args: ["./server.js"],
        env: {
          API_KEY: "secret123",
          DEBUG: "true",
        },
      });
    });

    it("throws error if command is missing", () => {
      const options: TransportOptions = {
        transport: "stdio",
        args: ["-y", "server"],
      };

      expect(() => parseTransport(options)).toThrow(
        /Stdio transport requires command/,
      );
    });

    it("handles empty args list", () => {
      const options: TransportOptions = {
        transport: "stdio",
        command: "python",
        args: [],
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        command: "python",
        args: [],
      });
    });
  });

  describe("http transport", () => {
    it("parses basic http URL", () => {
      const options: TransportOptions = {
        transport: "http",
        url: "https://api.example.com/mcp",
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
      });
    });

    it("includes headers in http config", () => {
      const options: TransportOptions = {
        transport: "http",
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: "Bearer token123",
          "X-Custom-Header": "value",
        },
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: "Bearer token123",
          "X-Custom-Header": "value",
        },
      });
    });

    it("throws error if URL is missing", () => {
      const options: TransportOptions = {
        transport: "http",
      };

      expect(() => parseTransport(options)).toThrow(
        /HTTP transport requires URL/,
      );
    });

    it("does not include undefined headers", () => {
      const options: TransportOptions = {
        transport: "http",
        url: "https://api.example.com/mcp",
        headers: undefined,
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        url: "https://api.example.com/mcp",
      });
      expect("headers" in result).toBe(false);
    });
  });

  describe("sse transport", () => {
    it("parses basic sse URL", () => {
      const options: TransportOptions = {
        transport: "sse",
        url: "https://api.example.com/sse",
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        url: "https://api.example.com/sse",
      });
    });

    it("includes headers in sse config", () => {
      const options: TransportOptions = {
        transport: "sse",
        url: "https://mcp.asana.com/sse",
        headers: {
          Authorization: "Bearer token",
        },
      };

      const result = parseTransport(options);

      expect(result).toEqual({
        url: "https://mcp.asana.com/sse",
        headers: {
          Authorization: "Bearer token",
        },
      });
    });

    it("throws error if URL is missing", () => {
      const options: TransportOptions = {
        transport: "sse",
      };

      expect(() => parseTransport(options)).toThrow(
        /SSE transport requires URL/,
      );
    });
  });

  describe("invalid transport", () => {
    it("throws error for unknown transport type", () => {
      const options = {
        transport: "invalid",
      } as TransportOptions;

      expect(() => parseTransport(options)).toThrow(/Unknown transport/);
    });
  });
});
