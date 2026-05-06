import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Copilot CLI — Capabilities", () => {
  const p = getToolProvider("copilot");

  it("supports skills and agents (no commands)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(true);
  });

  it("supports both MCP transports", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("does NOT discover .agents/skills/ natively", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(false);
    expect(p.readsAgentsDir).toBe(false);
  });

  it("uses .agent.md file extension", () => {
    expect(p.agentFileExtension).toBe(".agent.md");
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".github/skills");
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBe(".github/agents");
    expect(p.paths.mcpConfigPath).toBe(".vscode/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
