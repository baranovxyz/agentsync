import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Cline — Capabilities", () => {
  const p = getToolProvider("cline");

  it("supports skills only (no commands, no agents)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(false);
  });

  it("does NOT support project-level MCP (global-only)", () => {
    expect(p.capabilities.mcpStdio).toBe(false);
    expect(p.capabilities.mcpHttp).toBe(false);
    expect(p.mcpFormat).toBeNull();
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("does NOT read .agents/ directory directly (holdout tool)", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(false);
    expect(p.readsAgentsDir).toBe(false);
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".clinerules");
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBeNull();
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
