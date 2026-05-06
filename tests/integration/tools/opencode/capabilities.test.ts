import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("OpenCode — Capabilities", () => {
  const p = getToolProvider("opencode");

  it("supports skills, commands, agents", () => {
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

  it("reads .agents/ directory directly", () => {
    expect(p.capabilities.nativeSkillsDiscovery).toBe(true);
    expect(p.readsAgentsDir).toBe(true);
  });

  it("uses .md agent file extension", () => {
    expect(p.agentFileExtension).toBe(".md");
  });

  it("has no docsFormat (reads AGENTS.md natively)", () => {
    expect(p.docsFormat).toBeNull();
  });

  it("has correct paths", () => {
    expect(p.paths.skillsDir).toBe(".opencode/skills");
    expect(p.paths.commandsDir).toBe(".opencode/commands");
    expect(p.paths.agentsDir).toBe(".opencode/agents");
    expect(p.paths.mcpConfigPath).toBe("opencode.json");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
