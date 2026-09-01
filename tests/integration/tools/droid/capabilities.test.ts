import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Factory Droid — Capabilities", () => {
  const p = getToolProvider("droid");

  it("supports skills, commands and subagents", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(true);
    expect(p.capabilities.agents).toBe(true);
  });

  it("supports stdio and HTTP MCP", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
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
    expect(p.paths.commandsDir).toBe(".factory/commands");
    expect(p.paths.agentsDir).toBe(".factory/droids");
    expect(p.paths.mcpConfigPath).toBe(".factory/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
