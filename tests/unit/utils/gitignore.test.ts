import { describe, expect, it } from "vitest";
import type { ToolName } from "../../../src/types/index.js";
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
      expect(content).toContain("agentsync.local.toml");
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

  // Regression coverage for the managed-block duplication bug: bare
  // filename entries (e.g. "CLAUDE.md") and the block's own inner
  // "# Tool MCP configs (regenerated on sync)" comment both used to trip
  // the old entry-shape heuristic and truncate the section one line (or one
  // sub-header) too early, so every init/sync appended another copy.
  describe("managed block boundary (no duplication)", () => {
    function countOccurrences(content: string, needle: string): number {
      return content.split(needle).length - 1;
    }

    it("converges to exactly one block across init -> sync -> sync", () => {
      const tools: ToolName[] = [
        "claude",
        "codex",
        "cursor",
        "opencode",
        "gemini",
      ];
      let content = "# Project files\nnode_modules/\n";

      // init
      content = updateAgentSyncSection(content, tools);
      // sync
      content = updateAgentSyncSection(content, tools);
      // sync again
      content = updateAgentSyncSection(content, tools);

      expect(countOccurrences(content, "# AgentSync")).toBe(1);
      expect(
        countOccurrences(content, "# Tool MCP configs (regenerated on sync)"),
      ).toBe(1);
      expect(countOccurrences(content, ".mcp.json")).toBe(1);
      expect(countOccurrences(content, "CLAUDE.md")).toBe(1);
      expect(content).toContain("# Project files");
      expect(content).toContain("node_modules/");
    });

    it("is byte-identical across repeated applications with user content on both sides", () => {
      const tools: ToolName[] = ["claude", "cursor"];
      const legacy =
        "# Project files\nnode_modules/\n\n# AgentSync\nagentsync.local.toml\n\n# mine\nsecret.txt\n";

      const first = updateAgentSyncSection(legacy, tools);
      const second = updateAgentSyncSection(first, tools);
      const third = updateAgentSyncSection(second, tools);

      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(
        first.startsWith("# Project files\nnode_modules/\n\n# AgentSync\n"),
      ).toBe(true);
      expect(
        first.endsWith("# End AgentSync managed block\n\n# mine\nsecret.txt\n"),
      ).toBe(true);
    });

    it("appends with exactly one blank separator and stays byte-identical afterwards", () => {
      const tools: ToolName[] = ["claude"];
      const original = "# Project files\nnode_modules/\n";

      const first = updateAgentSyncSection(original, tools);

      expect(
        first.startsWith("# Project files\nnode_modules/\n\n# AgentSync\n"),
      ).toBe(true);
      expect(first.endsWith("# End AgentSync managed block\n")).toBe(true);
      expect(updateAgentSyncSection(first, tools)).toBe(first);
    });

    it("folds accumulated blank lines above a legacy block into one separator", () => {
      const tools: ToolName[] = ["claude"];
      const legacy = "node_modules/\n\n\n\n# AgentSync\nagentsync.local.toml\n";

      const updated = updateAgentSyncSection(legacy, tools);

      expect(updated.startsWith("node_modules/\n\n# AgentSync\n")).toBe(true);
      expect(updateAgentSyncSection(updated, tools)).toBe(updated);
    });

    it("does not duplicate the inner tool-patterns comment across repeated syncs", () => {
      const tools: ToolName[] = ["claude", "cursor"];
      let content = "";

      content = updateAgentSyncSection(content, tools);
      content = updateAgentSyncSection(content, tools);
      content = updateAgentSyncSection(content, tools);

      expect(
        countOccurrences(content, "# Tool MCP configs (regenerated on sync)"),
      ).toBe(1);
      expect(countOccurrences(content, "# AgentSync")).toBe(1);
    });

    it("replaces a legacy block (no end marker, containing its own inner comment) in place, not duplicated", () => {
      // Shape produced by a pre-marker version of generateGitignoreContent:
      // header, base pattern, blank line, inner sub-header, tool entries —
      // separated from surrounding user content by a blank line, same as
      // the other pre-existing tests in this file.
      const legacyBlock =
        "\n# AgentSync\nagentsync.local.toml\n\n# Tool MCP configs (regenerated on sync)\n.mcp.json\nCLAUDE.md\n";
      const existing = `before one\nbefore two${legacyBlock}\n# More\nafter one\n`;

      const updated = updateAgentSyncSection(existing, ["claude"]);

      expect(countOccurrences(updated, "# AgentSync")).toBe(1);
      expect(
        countOccurrences(updated, "# Tool MCP configs (regenerated on sync)"),
      ).toBe(1);
      expect(updated).toContain("before one");
      expect(updated).toContain("before two");
      expect(updated).toContain("# More");
      expect(updated).toContain("after one");
      expect(updated).toContain("# End AgentSync managed block");
    });

    it("preserves surrounding user content byte-for-byte when replacing a marked block", () => {
      const before = "node_modules/\ndist/\n";
      const after = "# Local overrides\n.env.local\n";
      const block = generateGitignoreContent(["cursor", "claude"]);
      const existing = `${before}${block}${after}`;

      const updated = updateAgentSyncSection(existing, ["cursor", "claude"]);

      expect(updated.startsWith(before)).toBe(true);
      expect(updated.endsWith(after)).toBe(true);
    });

    it("drops entries for tools removed from the tool set", () => {
      const first = updateAgentSyncSection("", ["cursor", "claude"]);
      const updated = updateAgentSyncSection(first, ["claude"]);

      expect(updated).not.toContain(".cursor/mcp.json");
      expect(updated).toContain(".mcp.json");
      expect(updated).toContain("CLAUDE.md");
      expect(countOccurrences(updated, "# AgentSync")).toBe(1);
    });
  });
});
