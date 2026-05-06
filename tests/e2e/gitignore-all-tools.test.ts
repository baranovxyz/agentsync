/**
 * Gitignore All Tools E2E Test
 * Tests gitignore generation for each individual tool and all tools combined.
 * Verifies patterns match actual output paths.
 */
import { describe, expect, it } from "vitest";
import type { ToolName } from "../../src/constants.js";
import {
  BASE_GITIGNORE_PATTERNS,
  generateGitignoreContent,
  hasAgentSyncSection,
  TOOL_GITIGNORE_PATTERNS,
  updateAgentSyncSection,
} from "../../src/utils/gitignore.js";

describe("Gitignore All Tools E2E", () => {
  const ALL_TOOLS: ToolName[] = [
    "claude",
    "opencode",
    "cursor",
    "roocode",
    "codex",
    "copilot",
    "cline",
    "gemini",
    "amp",
    "goose",
    "aider",
    "amazonq",
    "augment",
    "kiro",
    "openhands",
    "junie",
    "crush",
    "kilocode",
    "qwen",
  ];

  it("generates gitignore for all 19 tools combined", () => {
    const content = generateGitignoreContent(ALL_TOOLS);

    expect(content).toContain("# AgentSync");
    expect(content).toContain("# Tool MCP configs (regenerated on sync)");

    // Verify each tool's patterns are present
    for (const tool of ALL_TOOLS) {
      const patterns = TOOL_GITIGNORE_PATTERNS[tool];
      for (const pattern of patterns) {
        expect(content).toContain(pattern);
      }
    }
  });

  it("generates correct patterns for claude tool", () => {
    const content = generateGitignoreContent(["claude"]);

    expect(content).toContain(".mcp.json");
    expect(content).toContain("CLAUDE.md");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".claude/skills/");
    expect(content).not.toContain(".claude/commands/");
    expect(content).not.toContain(".claude/agents/");
  });

  it("generates correct patterns for opencode tool", () => {
    const content = generateGitignoreContent(["opencode"]);

    expect(content).toContain("opencode.json");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".opencode/skills/");
    expect(content).not.toContain(".opencode/commands/");
    expect(content).not.toContain(".opencode/agents/");
  });

  it("generates correct patterns for cursor tool", () => {
    const content = generateGitignoreContent(["cursor"]);

    expect(content).toContain(".cursor/mcp.json");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".cursor/skills/");
  });

  it("generates correct patterns for roocode tool", () => {
    const content = generateGitignoreContent(["roocode"]);

    expect(content).toContain(".roo/mcp.json");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".roo/skills/");
    expect(content).not.toContain(".roo/commands/");
  });

  it("generates correct patterns for codex tool", () => {
    const content = generateGitignoreContent(["codex"]);

    expect(content).toContain(".codex/config.toml");
  });

  it("generates correct patterns for copilot tool", () => {
    const content = generateGitignoreContent(["copilot"]);

    expect(content).toContain(".vscode/mcp.json");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".github/skills/");
    expect(content).not.toContain(".github/agents/");
  });

  it("generates correct patterns for gemini tool", () => {
    const content = generateGitignoreContent(["gemini"]);

    expect(content).toContain(".gemini/settings.json");
    expect(content).toContain("GEMINI.md");
    // Tool output dirs should NOT be gitignored
    expect(content).not.toContain(".gemini/skills/");
  });

  it("always includes base patterns", () => {
    const content = generateGitignoreContent(["claude"]);

    for (const pattern of BASE_GITIGNORE_PATTERNS) {
      if (pattern.trim()) {
        expect(content).toContain(pattern);
      }
    }

    // Base patterns include these regardless of tool
    expect(content).toContain(".agents/backups/");
    expect(content).toContain("agentsync.local.toml");
    // Old patterns should NOT be present
    expect(content).not.toContain(".agentsync/backups/");
    expect(content).not.toContain("agentsync.local.json");
  });

  it("generates empty tool section when no tools provided", () => {
    const content = generateGitignoreContent([]);

    expect(content).toContain("# AgentSync");
    expect(content).not.toContain("# Tool MCP configs (regenerated on sync)");
  });

  it("detects AgentSync section in existing gitignore", () => {
    const existing = "node_modules/\n\n# AgentSync\n.agents/backups/\n";
    expect(hasAgentSyncSection(existing)).toBe(true);
  });

  it("detects missing AgentSync section", () => {
    const existing = "node_modules/\ndist/\n";
    expect(hasAgentSyncSection(existing)).toBe(false);
  });

  it("updates existing AgentSync section with new tools", () => {
    const existing =
      "node_modules/\n\n# AgentSync\n.agents/backups/\nagentsync.local.toml\n\n# Tool MCP configs (regenerated on sync)\n.mcp.json\n";

    const updated = updateAgentSyncSection(existing, [
      "claude",
      "cursor",
      "gemini",
    ]);

    expect(updated).toContain("node_modules/");
    expect(updated).toContain(".cursor/mcp.json");
    expect(updated).toContain(".gemini/settings.json");
    expect(updated).toContain("GEMINI.md");
  });

  it("TOOL_GITIGNORE_PATTERNS has entries for all 19 tools", () => {
    for (const tool of ALL_TOOLS) {
      expect(
        TOOL_GITIGNORE_PATTERNS[tool],
        `${tool} should have gitignore patterns defined`,
      ).toBeDefined();
      expect(
        TOOL_GITIGNORE_PATTERNS[tool],
        `${tool} should have an array of gitignore patterns`,
      ).toBeInstanceOf(Array);
    }
  });
});
