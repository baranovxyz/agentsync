/**
 * New Tools Validation Test
 * Tests that every supported tool is accepted by schema, along with common
 * combinations, unsupported values, and an empty tools array.
 */
import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../../src/constants.js";
import { AgentSyncConfigSchema } from "../../../../src/types/schemas.js";

describe("New Tools Validation", () => {
  const EXPECTED_TOOLS = [
    "claude",
    "opencode",
    "cursor",
    "roocode",
    "codex",
    "copilot",
    "cline",
    "gemini",
    "amp",
    "goose",
    "aider",
    "amazonq",
    "augment",
    "kiro",
    "openhands",
    "junie",
    "crush",
    "kilocode",
    "qwen",
    "droid",
    "pi",
    "vibe",
  ] as const;

  it("accepts every supported tool individually", () => {
    for (const tool of SUPPORTED_TOOLS) {
      const result = AgentSyncConfigSchema.safeParse({
        tools: [tool],
      });
      expect(result.success, `Tool '${tool}' should be accepted`).toBe(true);
    }
  });

  it("SUPPORTED_TOOLS matches the expected tool set", () => {
    expect([...SUPPORTED_TOOLS].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("accepts every supported tool together", () => {
    const result = AgentSyncConfigSchema.safeParse({
      tools: [...SUPPORTED_TOOLS],
    });
    expect(result.success).toBe(true);
  });

  it("accepts common tool combinations", () => {
    const combos = [
      ["claude", "cursor"],
      ["claude", "opencode"],
      ["cursor", "copilot", "gemini"],
      ["claude", "opencode", "cursor", "roocode"],
      ["codex", "copilot"],
    ] as const;

    for (const combo of combos) {
      const result = AgentSyncConfigSchema.safeParse({
        tools: [...combo],
      });
      expect(
        result.success,
        `Combo [${combo.join(", ")}] should be accepted`,
      ).toBe(true);
    }
  });

  it("accepts 'cline' as a supported tool", () => {
    const result = AgentSyncConfigSchema.safeParse({
      tools: ["cline"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects 'windsurf' as an unsupported tool", () => {
    const result = AgentSyncConfigSchema.safeParse({
      tools: ["windsurf"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary invalid tool names", () => {
    const invalidTools = ["vscode", "neovim", "emacs", "jetbrains", "zed"];
    for (const tool of invalidTools) {
      const result = AgentSyncConfigSchema.safeParse({
        tools: [tool],
      });
      expect(result.success, `Tool '${tool}' should be rejected`).toBe(false);
    }
  });

  it("accepts empty tools array", () => {
    const result = AgentSyncConfigSchema.safeParse({
      tools: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tools).toEqual([]);
    }
  });

  it("accepts config without tools field (optional)", () => {
    const result = AgentSyncConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects mix of valid and invalid tools", () => {
    const result = AgentSyncConfigSchema.safeParse({
      tools: ["claude", "windsurf", "cursor"],
    });
    expect(result.success).toBe(false);
  });
});
