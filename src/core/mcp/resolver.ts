/**
 * MCP Config Resolver Module
 * Resolves MCP configuration from multiple sources with precedence chain
 */

import type { MCP } from "./tokens.js";
import { parseTransport, type TransportOptions } from "./transport.js";

export interface ResolveMCPOptions {
  // Inline config sources (precedence: json > transport > preset > registry)
  json?: string;
  transport?: "stdio" | "http" | "sse";
  preset?: string;

  // For transport: command and args after --
  command?: string;
  args?: string[];

  // For transport/http/sse: env and headers
  env?: Record<string, string>;
  headers?: Record<string, string>;

  // For http/sse: URL
  url?: string;

  // Registry lookup
  registry?: Record<string, MCP>;
}

/**
 * Resolve MCP configuration from multiple sources
 * Precedence: JSON → transport → preset → registry
 * @param options - Resolution options
 * @returns Resolved MCP configuration
 * @throws Error if no source provided or resolution fails
 */
export function resolveMCPConfig(options: ResolveMCPOptions): MCP {
  // 1. Try JSON first (highest priority)
  if (options.json) {
    try {
      const parsed = JSON.parse(options.json);
      if (!isValidMCP(parsed)) {
        throw new Error("Invalid MCP JSON structure");
      }
      return parsed as MCP;
    } catch (error) {
      throw new Error(`Failed to parse --json: ${(error as Error).message}`);
    }
  }

  // 2. Try transport flags
  if (options.transport) {
    const transportOptions: TransportOptions = {
      transport: options.transport,
      env: options.env,
      headers: options.headers,
      command: options.command,
      args: options.args,
      url: options.url,
    };
    return parseTransport(transportOptions);
  }

  // 3. Try preset extraction (not implemented yet - placeholder)
  if (options.preset) {
    throw new Error(
      "Preset extraction not yet implemented. Use --json or --transport instead.",
    );
  }

  // 4. Try registry lookup (fallback)
  if (options.registry) {
    throw new Error(
      "Registry lookup not yet implemented in resolver. Use enable command context.",
    );
  }

  throw new Error(
    "No MCP configuration source provided. Use --json, --transport, or --preset.",
  );
}

/**
 * Validate MCP configuration structure
 * @param obj - Object to validate
 * @returns true if valid MCP structure
 */
export function isValidMCP(obj: unknown): obj is MCP {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const mcp = obj as Record<string, unknown>;

  // Check for command-based MCP
  if (
    "command" in mcp &&
    typeof mcp.command === "string" &&
    Array.isArray(mcp.args)
  ) {
    // Valid command-based MCP
    return true;
  }

  // Check for URL-based MCP
  if ("url" in mcp && typeof mcp.url === "string") {
    return true;
  }

  return false;
}
