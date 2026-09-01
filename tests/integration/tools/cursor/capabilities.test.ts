import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Cursor — Capabilities", () => {
  const p = getToolProvider("cursor");

  it("supports skills, commands, and subagents", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(true);
    expect(p.capabilities.agents).toBe(true);
  });

  it("supports both MCP transports", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("discovers project and global .agents/skills natively", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsGlobalAgentsDir).toBe(true);
  });

  it("declares project hooks, CLI permissions, and rules writers", () => {
    expect(p.capabilities.hooks).toBe(true);
    expect(p.hooksFormat?.writeHooks).toBeTypeOf("function");
    expect(p.capabilities.permissions).toBe(true);
    expect(p.permissionsFormat?.writePermissions).toBeTypeOf("function");
    expect(p.capabilities.rules).toBe(true);
    expect(p.rulesFormat?.writeRules).toBeTypeOf("function");
  });

  it("has no docsFormat (reads AGENTS.md natively)", () => {
    expect(p.docsFormat).toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".agents/skills");
    expect(p.paths.generatedPresetSkillsDir).toBe(".cursor/skills");
    expect(p.paths.commandsDir).toBe(".cursor/commands");
    expect(p.paths.agentsDir).toBe(".cursor/agents");
    expect(p.paths.mcpConfigPath).toBe(".cursor/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
