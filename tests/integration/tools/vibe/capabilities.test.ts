import { describe, expect, it } from "vitest";
import { getToolProvider } from "../../../../src/tools/index.js";

describe("Mistral Vibe — Capabilities", () => {
  const p = getToolProvider("vibe");

  it("supports skills only (no commands, no subagent sync)", () => {
    expect(p.capabilities.skills).toBe(true);
    expect(p.capabilities.commands).toBe(false);
    // .vibe/agents holds *.toml model/permission PROFILES, not role briefs —
    // a canonical agent .md has no lossless home there.
    expect(p.capabilities.agents).toBe(false);
    expect(p.paths.agentsDir).toBeNull();
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
    expect(p.paths.commandsDir).toBeNull();
    expect(p.paths.mcpConfigPath).toBe(".vibe/config.toml");
    expect(p.paths.docsFile).toBe("AGENTS.md");
  });
});
