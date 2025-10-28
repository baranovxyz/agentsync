import { describe, it, expect } from "vitest";
import {
  generateGitignoreContent,
  hasAgentSyncSection,
  updateAgentSyncSection,
  BASE_GITIGNORE_PATTERNS,
  PRESERVE_PATTERNS,
  TOOL_GITIGNORE_PATTERNS,
} from "../../../src/utils/gitignore.js";
import type { ToolName } from "../../../src/types/index.js";

describe("gitignore utilities", () => {
  describe("generateGitignoreContent", () => {
    it("should generate base patterns for empty tool list", () => {
      const content = generateGitignoreContent([]);
      expect(content).toContain("# AgentSync");
      expect(content).toContain(".agentsync/logs/");
      expect(content).toContain(".agentsync/cache/");
      expect(content).toContain("agentsync.local.json");
      expect(content).toContain("# Keep project custom rules");
      expect(content).toContain("!.agentsync/rules/");
      expect(content).toContain("!.agentsync/commands/");
    });

    it("should include tool-specific patterns for selected tools", () => {
      const content = generateGitignoreContent(["cursor", "claude"]);
      expect(content).toContain(".cursor/rules/");
      expect(content).toContain(".cursor/commands/");
      expect(content).toContain(".cursor/mcp.json");
      expect(content).toContain(".claude/commands/");
      expect(content).toContain(".claude/mcp.json");
      expect(content).toContain("CLAUDE.md");
      expect(content).not.toContain(".clinerules/");
      expect(content).not.toContain(".roo/");
    });

    it("should include all tool patterns for cline", () => {
      const content = generateGitignoreContent(["cline"]);
      expect(content).toContain(".clinerules/*.md");
      expect(content).toContain(".clinerules/AGENTS.md");
      expect(content).toContain("cline_mcp_settings.json");
    });

    it("should include roocode patterns", () => {
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
      expect(updated).toContain(".cursor/rules/");
    });

    it("should replace existing AgentSync section", () => {
      const existing =
        "# Other\nfile.txt\n# AgentSync\n.old/rules/\n.old/commands/\n\n# More\nother.txt";
      const updated = updateAgentSyncSection(existing, ["cursor"]);
      expect(updated).toContain("# Other");
      expect(updated).toContain("file.txt");
      expect(updated).toContain(".cursor/rules/");
      expect(updated).toContain("# More");
      expect(updated).toContain("other.txt");
      expect(updated).not.toContain(".old/");
    });

    it("should update section with different tools", () => {
      const existing =
        "# Other\n# AgentSync\n.cursor/rules/\n.cursor/commands/\n\n# Keep project";
      const updated = updateAgentSyncSection(existing, ["claude"]);
      expect(updated).toContain(".claude/commands/");
      expect(updated).toContain(".claude/mcp.json");
      expect(updated).toContain("CLAUDE.md");
      expect(updated).not.toContain(".cursor/rules/");
    });

    it("should preserve preserve patterns", () => {
      const existing = "# Other\n# AgentSync\n.old/";
      const updated = updateAgentSyncSection(existing, ["cursor"]);
      expect(updated).toContain("!.agentsync/rules/");
      expect(updated).toContain("!.agentsync/commands/");
    });

    it("should handle empty tool list", () => {
      const existing = "# Other\n# AgentSync\n.cursor/";
      const updated = updateAgentSyncSection(existing, []);
      expect(updated).toContain("# AgentSync");
      expect(updated).not.toContain(".cursor/");
      expect(updated).toContain("!.agentsync/rules/");
    });
  });
});
