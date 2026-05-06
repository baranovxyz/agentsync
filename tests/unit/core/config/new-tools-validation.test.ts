/**
 * New Tools Validation Test
 * Tests that all 19 tools are accepted by schema, tool combinations,
 * rejection of removed tools (windsurf), and empty tools array.
 */
import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../../src/constants.js";
import { AgentSyncConfigSchema } from "../../../../src/types/schemas.js";

describe("New Tools Validation", () => {
  const ALL_TOOLS = [
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
  ] as const;

  it("accepts all 19 supported tools individually", () => {
    for (const tool of ALL_TOOLS) {
      const result = AgentSyncConfigSchema.safeParse({
        tools: [tool],
      });
      expect(result.success, `Tool '${tool}' should be accepted`).toBe(true);
    }
  });

  it("SUPPORTED_TOOLS constant matches expected 19 tools", () => {
    expect(SUPPORTED_TOOLS).toHaveLength(19);
    for (const tool of ALL_TOOLS) {
      expect(SUPPORTED_TOOLS).toContain(tool);
    }
  });

  it("accepts all 19 tools together", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
      tools: [...ALL_TOOLS],
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
      version: "1.0",
      tools: ["cline"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects 'windsurf' as an unsupported tool", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
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
      version: "1.0",
      tools: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tools).toEqual([]);
    }
  });

  it("accepts config without tools field (optional)", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mix of valid and invalid tools", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
      tools: ["claude", "windsurf", "cursor"],
    });
    expect(result.success).toBe(false);
  });
});
