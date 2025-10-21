/**
 * Preset types for GitHub registry system
 */

import type { MCP } from "../core/mcp/tokens.js";

/**
 * A preset loaded from a GitHub repo
 */
export interface Preset {
  /** Source identifier (e.g., "github:company/standards") */
  source: string;

  /** Namespace (extracted from source or explicit) */
  namespace: string;

  /** Path to cached repo */
  path: string;

  /** Commands: Map<filename, content> */
  commands: Map<string, string>;

  /** Rules: Map<filename, content> */
  rules: Map<string, string>;

  /** MCP servers from mcp.json */
  mcps: Record<string, MCP>;

  /** Optional metadata from .agentsync/preset.json */
  metadata?: PresetMetadata;
}

/**
 * Optional preset metadata
 */
export interface PresetMetadata {
  name?: string;
  version?: string;
  description?: string;
  namespace?: string; // Override default
  exports?: {
    rules?: string[]; // Glob patterns
    commands?: string[];
    exclude?: string[];
  };
}
