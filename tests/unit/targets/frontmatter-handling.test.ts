import { describe, expect, it } from "vitest";
import { RooCodeCommandsConverter } from "../../../src/targets/commands/roocode-commands-converter.js";
import { RuleConverterBase } from "../../../src/targets/rules/rule-converter-base.js";

/**
 * Test helper that extends RuleConverterBase to expose validation methods
 */
class TestValidator extends RuleConverterBase {
  supportsNestedDirs(): boolean {
    return true;
  }
  convert(): never {
    throw new Error("Not implemented");
  }
  // Expose protected methods as public for testing
  public testParseFrontmatter(content: string) {
    return this.parseFrontmatter(content);
  }
  public testStripFrontmatter(content: string) {
    return this.stripFrontmatter(content);
  }
  public testExtractFrontmatterField(content: string, field: string) {
    return this.extractFrontmatterField(content, field);
  }
  public testValidateCommandFrontmatter(
    frontmatter: Record<string, unknown> | null,
  ) {
    return this.validateCommandFrontmatter(frontmatter);
  }
  public testValidateRuleFrontmatter(
    frontmatter: Record<string, unknown> | null,
  ) {
    return this.validateRuleFrontmatter(frontmatter);
  }
  public testBuildCommandFrontmatter(
    description: string,
    argumentHint: string,
  ) {
    return this.buildCommandFrontmatter(description, argumentHint);
  }
}

describe("Frontmatter Handling", () => {
  const validator = new TestValidator();

  describe("parseFrontmatter", () => {
    it("parses valid YAML frontmatter", () => {
      const content = `---
description: Test command
argument-hint: <arg>
---
# Content`;
      const result = validator.testParseFrontmatter(content);
      expect(result.frontmatter).toEqual({
        description: "Test command",
        "argument-hint": "<arg>",
      });
      expect(result.content).toBe("# Content");
    });

    it("handles content without frontmatter", () => {
      const content = "# No frontmatter here";
      const result = validator.testParseFrontmatter(content);
      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(content);
    });

    it("parses boolean values", () => {
      const content = `---
alwaysApply: true
enabled: false
---
# Content`;
      const result = validator.testParseFrontmatter(content);
      expect(result.frontmatter).toEqual({
        alwaysApply: true,
        enabled: false,
      });
    });

    it("parses numeric values", () => {
      const content = `---
priority: 5
version: 1
---
# Content`;
      const result = validator.testParseFrontmatter(content);
      expect(result.frontmatter).toEqual({
        priority: 5,
        version: 1,
      });
    });

    it("removes quotes from string values", () => {
      const content = `---
description: "Quoted description"
globs: '**/*.ts'
---
# Content`;
      const result = validator.testParseFrontmatter(content);
      expect(result.frontmatter).toEqual({
        description: "Quoted description",
        globs: "**/*.ts",
      });
    });
  });

  describe("stripFrontmatter", () => {
    it("removes frontmatter from content", () => {
      const content = `---
description: Test
---
# Content here`;
      const result = validator.testStripFrontmatter(content);
      expect(result).toBe("# Content here");
    });

    it("returns content as-is when no frontmatter", () => {
      const content = "# No frontmatter";
      const result = validator.testStripFrontmatter(content);
      expect(result).toBe(content);
    });
  });

  describe("extractFrontmatterField", () => {
    const content = `---
description: Test command
argument-hint: <arg>
priority: 5
---
# Content`;

    it("extracts string field", () => {
      const result = validator.testExtractFrontmatterField(
        content,
        "description",
      );
      expect(result).toBe("Test command");
    });

    it("extracts field with hyphens", () => {
      const result = validator.testExtractFrontmatterField(
        content,
        "argument-hint",
      );
      expect(result).toBe("<arg>");
    });

    it("converts numeric field to string", () => {
      const result = validator.testExtractFrontmatterField(content, "priority");
      expect(result).toBe("5");
    });

    it("returns null for non-existent field", () => {
      const result = validator.testExtractFrontmatterField(
        content,
        "nonexistent",
      );
      expect(result).toBeNull();
    });

    it("returns null when no frontmatter", () => {
      const result = validator.testExtractFrontmatterField(
        "# No frontmatter",
        "description",
      );
      expect(result).toBeNull();
    });
  });

  describe("validateCommandFrontmatter", () => {
    it("validates valid command frontmatter", () => {
      const frontmatter = { description: "Test", "argument-hint": "<arg>" };
      const result = validator.testValidateCommandFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("requires description field", () => {
      const frontmatter = { "argument-hint": "<arg>" };
      const result = validator.testValidateCommandFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain("Missing required field: description");
    });

    it("allows description-only frontmatter", () => {
      const frontmatter = { description: "Test command" };
      const result = validator.testValidateCommandFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
    });

    it("warns when frontmatter is missing", () => {
      const result = validator.testValidateCommandFrontmatter(null);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain("Missing frontmatter");
    });
  });

  describe("validateRuleFrontmatter", () => {
    it("validates valid rule frontmatter", () => {
      const frontmatter = {
        description: "TypeScript rules",
        globs: "**/*.ts",
        alwaysApply: false,
      };
      const result = validator.testValidateRuleFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("requires description field", () => {
      const frontmatter = { globs: "**/*.ts" };
      const result = validator.testValidateRuleFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain(
        "Missing recommended field: description",
      );
    });

    it("warns when frontmatter is missing", () => {
      const result = validator.testValidateRuleFrontmatter(null);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain("Missing frontmatter");
    });
  });

  describe("buildCommandFrontmatter", () => {
    it("builds frontmatter with description and argument-hint", () => {
      const result = validator.testBuildCommandFrontmatter(
        "Test command",
        "<arg>",
      );
      expect(result).toBe(`---
description: Test command
argument-hint: <arg>
---`);
    });
  });
});

describe("RooCode Commands Converter - Frontmatter Handling", () => {
  const converter = new RooCodeCommandsConverter();

  describe("convert with existing frontmatter", () => {
    it("strips existing frontmatter and adds new one", () => {
      const content = `---
description: Original description
argument-hint: <original>
---
# Auth Command

Authenticate users.`;

      const result = converter.convert("auth.md", content);

      // Should have new frontmatter with same values
      expect(result.content).toContain(
        "---\ndescription: Original description\nargument-hint: <original>\n---",
      );

      // Should have exactly one frontmatter block (match the full pattern)
      const frontmatterMatches = result.content.match(
        /^---\n[\s\S]*?\n---\n/gm,
      );
      expect(frontmatterMatches).toHaveLength(1);

      // Content should appear only once
      expect(result.content).toContain("# Auth Command");
      const contentMatches = result.content.match(/# Auth Command/g);
      expect(contentMatches).toHaveLength(1);

      // Should start with frontmatter
      expect(result.content).toMatch(/^---\n/);
    });

    it("preserves frontmatter values when converting", () => {
      const content = `---
description: Custom description
argument-hint: <custom> [optional]
---
# Command body`;

      const result = converter.convert("test.md", content);

      expect(result.content).toContain("description: Custom description");
      expect(result.content).toContain("argument-hint: <custom> [optional]");
    });

    it("adds default frontmatter when none exists", () => {
      const content = "# Auth Command\n\nAuthenticate users.";
      const result = converter.convert("auth.md", content);

      expect(result.content).toContain(
        "---\ndescription: Authenticate users.\nargument-hint: [optional arguments]\n---",
      );
      expect(result.content).toContain("# Auth Command");
    });

    it("uses first non-header line as description when no frontmatter", () => {
      const content = `# Command Title

This is the description line.

More content here.`;

      const result = converter.convert("test.md", content);

      expect(result.content).toContain(
        "description: This is the description line.",
      );
    });

    it("uses default description when no suitable line found", () => {
      const content = "# Just a header";
      const result = converter.convert("test.md", content);

      expect(result.content).toContain("description: Command");
    });
  });

  describe("namespace handling", () => {
    it("formats nested namespace correctly", () => {
      const content = `---
description: Test
---
# Content`;
      const result = converter.convert("company_auth.md", content);

      expect(result.filename).toBe("company/auth.md");
    });

    it("handles non-namespaced files", () => {
      const content = `---
description: Test
---
# Content`;
      const result = converter.convert("auth.md", content);

      expect(result.filename).toBe("auth.md");
    });
  });
});
