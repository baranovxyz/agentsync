import { describe, expect, it } from "vitest";
import {
  generateGitignoreContent,
  hasAgentSyncSection,
  updateAgentSyncSection,
} from "../../../src/utils/gitignore.js";

describe("gitignore utilities", () => {
  describe("generateGitignoreContent", () => {
    it("should generate base patterns for empty tool list", () => {
      const content = generateGitignoreContent([]);
      expect(content).toContain("# AgentSync");
      expect(content).toContain(".agents/backups/");
      expect(content).toContain("agentsync.local.toml");
    });

    it("should not gitignore old .agentsync/ patterns", () => {
      const content = generateGitignoreContent([]);
      expect(content).not.toContain(".agentsync/backups/");
      expect(content).not.toContain("agentsync.local.json");
      expect(content).not.toContain("*.backup");
    });

    it("should include tool MCP config patterns for selected tools", () => {
      const content = generateGitignoreContent(["cursor", "claude"]);
      expect(content).toContain(".cursor/mcp.json");
      expect(content).toContain(".mcp.json");
      expect(content).toContain("CLAUDE.md");
      expect(content).not.toContain(".roo/");
    });

    it("should not gitignore tool output directories (skills, commands, agents)", () => {
      const content = generateGitignoreContent([
        "cursor",
        "claude",
        "roocode",
        "copilot",
        "gemini",
      ]);
      expect(content).not.toContain(".cursor/skills/");
      expect(content).not.toContain(".claude/skills/");
      expect(content).not.toContain(".claude/commands/");
      expect(content).not.toContain(".claude/agents/");
      expect(content).not.toContain(".roo/skills/");
      expect(content).not.toContain(".roo/commands/");
      expect(content).not.toContain(".github/skills/");
      expect(content).not.toContain(".github/agents/");
      expect(content).not.toContain(".gemini/skills/");
      expect(content).not.toContain(".opencode/skills/");
    });

    it("should include roocode MCP pattern", () => {
      const content = generateGitignoreContent(["roocode"]);
      expect(content).toContain(".roo/mcp.json");
    });

    it("should end with newline", () => {
      const content = generateGitignoreContent(["cursor"]);
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("hasAgentSyncSection", () => {
    it("should detect AgentSync section", () => {
      const content = "# Other\nfile\n# AgentSync\n.cursor/";
      expect(hasAgentSyncSection(content)).toBe(true);
    });

    it("should return false without AgentSync section", () => {
      const content = "# Other\nfile\n# More";
      expect(hasAgentSyncSection(content)).toBe(false);
    });

    it("should handle empty content", () => {
      expect(hasAgentSyncSection("")).toBe(false);
    });
  });

  describe("updateAgentSyncSection", () => {
    it("should append AgentSync section if not present", () => {
      const existing = "# Other\nfile.txt\n";
      const updated = updateAgentSyncSection(existing, ["cursor"]);
      expect(updated).toContain("# Other");
      expect(updated).toContain("file.txt");
      expect(updated).toContain("# AgentSync");
      expect(updated).toContain(".cursor/mcp.json");
    });

    it("should replace existing AgentSync section", () => {
      const existing =
        "# Other\nfile.txt\n# AgentSync\n.old/rules/\n.old/commands/\n\n# More\nother.txt";
      const updated = updateAgentSyncSection(existing, ["cursor"]);
      expect(updated).toContain("# Other");
      expect(updated).toContain("file.txt");
      expect(updated).toContain(".cursor/mcp.json");
      expect(updated).toContain("# More");
      expect(updated).toContain("other.txt");
      expect(updated).not.toContain(".old/");
    });

    it("should update section with different tools", () => {
      const existing =
        "# Other\n# AgentSync\n.cursor/mcp.json\n\n# Keep project";
      const updated = updateAgentSyncSection(existing, ["claude"]);
      expect(updated).toContain(".mcp.json");
      expect(updated).toContain("CLAUDE.md");
      expect(updated).not.toContain(".cursor/mcp.json");
    });

    it("should handle empty tool list", () => {
      const existing = "# Other\n# AgentSync\n.cursor/mcp.json";
      const updated = updateAgentSyncSection(existing, []);
      expect(updated).toContain("# AgentSync");
      expect(updated).not.toContain(".cursor/");
    });
  });
});
