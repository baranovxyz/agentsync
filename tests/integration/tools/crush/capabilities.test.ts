import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Crush — Capabilities", () => {
  const p = getToolProvider("crush");

  it("supports no skills, commands, or agents", () => {
    expect(p.capabilities.skills).toBe(false);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(false);
  });

  it("supports stdio and HTTP MCP", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("does NOT read AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(false);
  });

  it("does NOT read .agents/ directory directly", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(false);
    expect(p.readsAgentsDir).toBe(false);
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBeNull();
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBe("crush.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
