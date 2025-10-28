import { describe, expect, it } from "vitest";
import { ClaudeCommandsConverter } from "../../../src/targets/commands/claude-commands-converter.js";
import { CursorCommandsConverter } from "../../../src/targets/commands/cursor-commands-converter.js";
import { RooCodeCommandsConverter } from "../../../src/targets/commands/roocode-commands-converter.js";
import { ClaudeRulesConverter } from "../../../src/targets/rules/claude-rules-converter.js";
import { ClineRulesConverter } from "../../../src/targets/rules/cline-rules-converter.js";
import { CursorRulesConverter } from "../../../src/targets/rules/cursor-rules-converter.js";
import { RooCodeRulesConverter } from "../../../src/targets/rules/roocode-rules-converter.js";

describe("Namespace Formatting", () => {
  describe("Rules Converters", () => {
    describe("Cursor (nested directories)", () => {
      const converter = new CursorRulesConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory with .mdc extension", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.filename).toBe("company/typescript.mdc");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.content).toBe("# Rules");
      });
    });

    describe("Claude Code (nested directories)", () => {
      const converter = new ClaudeRulesConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.filename).toBe("company/typescript.md");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.content).toBe("# Rules");
      });
    });

    describe("RooCode (nested directories)", () => {
      const converter = new RooCodeRulesConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.filename).toBe("company/typescript.md");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.content).toBe("# Rules");
      });
    });

    describe("Cline (flat structure)", () => {
      const converter = new ClineRulesConverter();

      it("does NOT support nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(false);
      });

      it("formats namespace with underscore separator", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.filename).toBe("company_typescript.md");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_typescript.md", "# Rules");
        expect(result.content).toBe("# Rules");
      });
    });
  });

  describe("Commands Converters", () => {
    describe("Cursor (nested directories)", () => {
      const converter = new CursorCommandsConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory", () => {
        const result = converter.convert("company_commit.md", "# Commit");
        expect(result.filename).toBe("company/commit.md");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_commit.md", "# Commit");
        expect(result.content).toBe("# Commit");
      });
    });

    describe("Claude Code (nested directories)", () => {
      const converter = new ClaudeCommandsConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory", () => {
        const result = converter.convert("company_commit.md", "# Commit");
        expect(result.filename).toBe("company/commit.md");
      });

      it("preserves original content", () => {
        const result = converter.convert("company_commit.md", "# Commit");
        expect(result.content).toBe("# Commit");
      });
    });

    describe("RooCode (nested directories)", () => {
      const converter = new RooCodeCommandsConverter();

      it("supports nested directories", () => {
        expect(converter.supportsNestedDirs()).toBe(true);
      });

      it("formats namespace as nested directory", () => {
        const result = converter.convert(
          "company_commit.md",
          "# Commit command",
        );
        expect(result.filename).toBe("company/commit.md");
      });

      it("adds frontmatter with description and argument hint", () => {
        const result = converter.convert(
          "company_commit.md",
          "# Commit command",
        );
        expect(result.content).toContain("---");
        expect(result.content).toContain("description:");
        expect(result.content).toContain("argument-hint:");
      });
    });
  });

  describe("Namespace parsing", () => {
    const converter = new CursorRulesConverter();

    it("correctly parses namespace and filename with underscore", () => {
      const result = converter.convert("company_typescript.md", "# Content");
      // Should parse "company" as namespace and "typescript.md" as filename
      expect(result.filename).toBe("company/typescript.mdc");
    });

    it("handles multi-word filenames", () => {
      const result = converter.convert(
        "company_coding-standards.md",
        "# Content",
      );
      expect(result.filename).toBe("company/coding-standards.mdc");
    });

    it("handles filenames with multiple underscores after namespace", () => {
      const result = converter.convert(
        "company_my_coding_standards.md",
        "# Content",
      );
      // First underscore separates namespace from filename
      // Remaining underscores are part of the filename
      expect(result.filename).toBe("company/my_coding_standards.mdc");
    });
  });

  describe("Error handling", () => {
    const converter = new CursorRulesConverter();

    it("handles non-namespaced filenames (project custom files)", () => {
      // Project custom files (from .agentsync/rules/ or commands/) have no underscore
      // They should be treated as having an empty namespace and output as-is
      const result = converter.convert("custom-auth.md", "# Auth Rule");
      expect(result.filename).toBe("custom-auth.mdc");
      expect(result.content).toBe("# Auth Rule");
    });

    it("handles filenames with underscores correctly (namespace separation)", () => {
      // Namespaced files use FIRST underscore to separate namespace from filename
      // Additional underscores are part of the filename
      const result = converter.convert("team_my_style_guide.md", "# Style");
      expect(result.filename).toBe("team/my_style_guide.mdc");
    });
  });
});
