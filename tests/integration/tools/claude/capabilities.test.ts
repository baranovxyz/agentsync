import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Claude Code — Capabilities", () => {
  const p = getToolProvider("claude");

  it("supports skills, commands, agents", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(true);
    expect(p.capabilities.agents).toBe(true);
  });

  it("supports both MCP transports", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("does NOT read AGENTS.md natively (uses CLAUDE.md)", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(false);
  });

  it("does NOT discover .agents/skills/ natively", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(false);
    expect(p.readsAgentsDir).toBe(false);
  });

  it("uses .md agent file extension", () => {
    expect(p.agentFileExtension).toBe(".md");
  });

  it("has docsFormat for CLAUDE.md", () => {
    expect(p.docsFormat).not.toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".claude/skills");
    expect(p.paths.commandsDir).toBe(".claude/commands");
    expect(p.paths.agentsDir).toBe(".claude/agents");
    expect(p.paths.mcpConfigPath).toBe(".mcp.json");
    expect(p.paths.docsFile).toBe("CLAUDE.md");
  });
});
