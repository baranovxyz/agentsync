/**
 * Transport Parser Module
 * Parses CLI flags (--transport, --env, --header, --) into MCP configuration
 * Supports stdio, http, and sse transports
 */

import type { MCP } from "./tokens.js";

export interface TransportOptions {
  transport: "stdio" | "http" | "sse";
  env?: Record<string, string>;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  url?: string;
}

/**
 * Parse transport flags into MCP configuration
 * @param options - Parsed transport options
 * @returns MCP configuration object
 * @throws Error if configuration is invalid
 */
export function parseTransport(options: TransportOptions): MCP {
  switch (options.transport) {
    case "stdio":
      return parseStdio(options);
    case "http":
      return parseHttp(options);
    case "sse":
      return parseSse(options);
    default:
      throw new Error(`Unknown transport: ${options.transport}`);
  }
}

/**
 * Parse stdio transport (local command)
 * @param options - Transport options with command and args
 * @returns MCP configuration for stdio
 * @throws Error if command is missing
 */
function parseStdio(options: TransportOptions): MCP {
  if (!options.command) {
    throw new Error(
      'Stdio transport requires command after "--". ' +
        "Example: --transport stdio --env KEY=value -- npx server",
    );
  }

  const mcp: MCP = {
    command: options.command,
    args: options.args || [],
  };

  if (options.env && Object.keys(options.env).length > 0) {
    mcp.env = options.env;
  }

  return mcp;
}

/**
 * Parse HTTP transport (remote server)
 * @param options - Transport options with url and headers
 * @returns MCP configuration for HTTP
 * @throws Error if URL is missing
 */
function parseHttp(options: TransportOptions): MCP {
  if (!options.url) {
    throw new Error(
      "HTTP transport requires URL. " +
        "Example: --transport http https://api.example.com/mcp",
    );
  }

  const mcp: MCP = {
    url: options.url,
  };

  if (options.headers && Object.keys(options.headers).length > 0) {
    mcp.headers = options.headers;
  }

  return mcp;
}

/**
 * Parse SSE transport (remote server with Server-Sent Events)
 * @param options - Transport options with url and headers
 * @returns MCP configuration for SSE
 * @throws Error if URL is missing
 */
function parseSse(options: TransportOptions): MCP {
  if (!options.url) {
    throw new Error(
      "SSE transport requires URL. " +
        "Example: --transport sse https://api.example.com/sse",
    );
  }

  const mcp: MCP = {
    url: options.url,
  };

  if (options.headers && Object.keys(options.headers).length > 0) {
    mcp.headers = options.headers;
  }

  return mcp;
}
