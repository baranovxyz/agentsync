import { describe, expect, it } from "vitest";
import { ConfigError, ValidationError } from "../../../src/core/errors.js";

describe("agent-oriented errors", () => {
  it("ConfigError includes suggestion in flat property", () => {
    const err = new ConfigError(
      "No config found",
      "/path",
      "Run: agentsync init --tools cursor",
    );
    expect(err.suggestion).toBe("Run: agentsync init --tools cursor");
  });

  it("ValidationError includes context for agents", () => {
    const err = new ValidationError(
      "Tool 'cursro' is not supported",
      undefined,
      {
        suggestion: "agentsync config add tool cursor",
        validValues: ["cursor", "claude"],
      },
    );
    expect(err.context?.suggestion).toBe("agentsync config add tool cursor");
    expect(err.context?.validValues).toContain("cursor");
  });

  it("ConfigError serializes suggestion for JSON output", () => {
    const err = new ConfigError(
      'MCP server "github" requires --mcp-config flag',
      undefined,
      `agentsync config add mcp github --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'`,
    );
    // Simulate the cli.ts JSON serialization path
    const errorObj = {
      success: false,
      error: {
        code: err.code || "UNKNOWN_ERROR",
        message: err.message,
        suggestion: err.suggestion,
      },
    };
    expect(errorObj.error.suggestion).toContain("agentsync config add mcp");
    expect(errorObj.error.code).toBe("CONFIG_ERROR");
  });

  it("ValidationError includes validValues and suggestion in context", () => {
    const err = new ValidationError(
      'Unknown config type "bogus". Valid types: tool, mcp, preset, skill, command',
      undefined,
      {
        suggestion: "agentsync config add tool <name>",
        validValues: ["tool", "mcp", "preset", "skill", "command"],
        provided: "bogus",
      },
    );
    expect(err.context?.validValues).toEqual([
      "tool",
      "mcp",
      "preset",
      "skill",
      "command",
    ]);
    expect(err.context?.provided).toBe("bogus");
    expect(err.context?.suggestion).toBe("agentsync config add tool <name>");
  });

  it("ValidationError with invalid tool includes SUPPORTED_TOOLS in context", () => {
    const err = new ValidationError(
      'Unknown tool "cursro". Supported tools: claude, cursor',
      undefined,
      {
        suggestion: "agentsync config add tool claude",
        validValues: ["claude", "cursor"],
        provided: "cursro",
      },
    );
    expect(err.context?.validValues).toContain("claude");
    expect(err.context?.validValues).toContain("cursor");
    expect(err.context?.provided).toBe("cursro");
  });

  it("ValidationError with invalid preset source includes format examples", () => {
    const err = new ValidationError(
      'Invalid preset source "not-valid"',
      undefined,
      {
        suggestion: "agentsync config add preset github:org/repo",
        validFormats: [
          "github:org/repo",
          "github:org/repo@ref",
          "fs:./local-presets",
          "./relative/path",
        ],
        provided: "not-valid",
      },
    );
    expect(err.context?.validFormats).toContain("github:org/repo");
    expect(err.context?.suggestion).toContain("github:org/repo");
  });
});
