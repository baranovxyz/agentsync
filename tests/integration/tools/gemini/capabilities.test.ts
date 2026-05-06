import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Gemini CLI — Capabilities", () => {
  const p = getToolProvider("gemini");

  it("supports skills only (no commands, no agents)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(false);
  });

  it("supports both MCP transports", () => {
    expect(p.capabilities.mcpStdio).toBe(true);
    expect(p.capabilities.mcpHttp).toBe(true);
  });

  it("does NOT read AGENTS.md natively (uses GEMINI.md)", () => {
    expect(p.capabilities.nativeAgentsMd).toBe(false);
  });

  it("reads .agents/ directory directly", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsAgentsDir).toBe(true);
  });

  it("has docsFormat for GEMINI.md", () => {
    expect(p.docsFormat).not.toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".gemini/skills");
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBe(".gemini/settings.json");
    expect(p.paths.docsFile).toBe("GEMINI.md");
  });
});
