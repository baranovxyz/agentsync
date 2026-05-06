/**
 * Preset types for GitHub registry system
 */

import type { MCP } from "../core/mcp/tokens.js";
import type { CanonicalCommand, CanonicalRule } from "./canonical.js";

/**
 * A preset loaded from a GitHub repo or filesystem
 * Uses canonical format (parsed frontmatter + markdown) throughout
 */
export interface Preset {
  /** Source identifier (e.g., "github:company/standards", "fs:~/.cursor") */
  source: string;

  /** Namespace (extracted from source or explicit) */
  namespace: string;

  /** Path to cached repo or filesystem directory */
  path: string;

  /** Commands in canonical format: Map<filename, CanonicalCommand> */
  commands: Map<string, CanonicalCommand>;

  /** Rules in canonical format: Map<filename, CanonicalRule> */
  rules: Map<string, CanonicalRule>;

  /** MCP servers from mcp.json */
  mcps: Record<string, MCP>;

  /** Optional metadata from .agents/preset.json */
  metadata?: PresetMetadata;

  /** Warnings accumulated during loading (sanitization, missing frontmatter, etc.) */
  warnings: string[];
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
