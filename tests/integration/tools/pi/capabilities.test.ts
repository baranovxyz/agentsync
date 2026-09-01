import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Pi — Capabilities", () => {
  const p = getToolProvider("pi");

  it("supports skills and commands (no subagents)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(true);
    expect(p.capabilities.agents).toBe(false);
  });

  it("has no MCP surface at all", () => {
    expect(p.capabilities.mcpStdio).toBe(false);
    expect(p.capabilities.mcpHttp).toBe(false);
    expect(p.paths.mcpConfigPath).toBeNull();
    expect(p.mcpFormat).toBeNull();
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
    expect(p.docsFormat).toBeNull();
  });

  it("reads .agents/ directly, including the global ~/.agents/ scope", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsGlobalAgentsDir).toBe(true);
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".agents/skills");
    expect(p.paths.commandsDir).toBe(".pi/prompts");
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
