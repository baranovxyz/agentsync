import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Aider — Capabilities", () => {
  const p = getToolProvider("aider");

  it("supports no skills, commands, or agents", () => {
    expect(p.capabilities.skills).toBe(false);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(false);
  });

  it("does not support MCP", () => {
    expect(p.capabilities.mcpStdio).toBe(false);
    expect(p.capabilities.mcpHttp).toBe(false);
  });

  it("reads AGENTS.md natively", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(true);
  });

  it("does not read .agents/ directory", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(false);
    expect(p.readsAgentsDir).toBe(false);
  });

  it("has no MCP or docs format handler", () => {
    expect(p.mcpFormat).toBeNull();
    expect(p.docsFormat).toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBeNull();
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBeNull();
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
