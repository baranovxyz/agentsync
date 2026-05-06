import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Amazon Q — Capabilities", () => {
  const p = getToolProvider("amazonq");

  it("supports skills and agents (no commands)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(true);
  });

  it("supports stdio and HTTP MCP", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("reads .agents/ directory directly (shared skills)", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsAgentsDir).toBe(true);
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".agents/skills");
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBe(".amazonq/agents");
    expect(p.paths.mcpConfigPath).toBe(".amazonq/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
