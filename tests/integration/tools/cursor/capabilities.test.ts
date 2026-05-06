import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Cursor — Capabilities", () => {
  const p = getToolProvider("cursor");

  it("supports skills only (no commands, no agents)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    expect(p.capabilities.agents).toBe(false);
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

  it("has no docsFormat (reads AGENTS.md natively)", () => {
    expect(p.docsFormat).toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".cursor/skills");
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.agentsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBe(".cursor/mcp.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
