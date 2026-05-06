import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("RooCode — Capabilities", () => {
  const p = getToolProvider("roocode");

  it("supports skills and commands (no agents)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(true);
    expect(p.capabilities.agents).toBe(false);
  });

  it("supports stdio MCP only", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(false);
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("reads .agents/ directory directly", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsAgentsDir).toBe(true);
  });

  it("has no docsFormat (reads AGENTS.md natively)", () => {
    expect(p.docsFormat).toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".roo/skills");
    expect(p.paths.commandsDir).toBe(".roo/commands");
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBe(".roo/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
