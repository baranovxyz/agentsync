import { describe, expect, it } from "vitest";
import { ClaudeRulesConverter } from "../../../../src/targets/rules/claude-rules-converter.js";

describe("ClaudeRulesConverter", () => {
  const converter = new ClaudeRulesConverter();

  describe("convert", () => {
    it("converts namespaced markdown keeping .md extension", () => {
      const result = converter.convert(
        "company:typescript.md",
        "# TypeScript Rules\n\nUse strict mode.",
      );

      expect(result.filename).toBe("company:typescript.md");
      expect(result.content).toBe("# TypeScript Rules\n\nUse strict mode.");
    });

    it("preserves namespace in filename", () => {
      const result = converter.convert("acme-corp:api.md", "# API Design");

      expect(result.filename).toBe("acme-corp:api.md");
    });

    it("preserves content as-is (no transformation)", () => {
      const content =
        "# Rules\n\n- Rule 1\n- Rule 2\n\n## Section\n\nMore content.";
      const result = converter.convert("company:rules.md", content);

      expect(result.content).toBe(content);
    });

    it("throws on invalid namespaced filename (no colon)", () => {
      expect(() => converter.convert("typescript.md", "content")).toThrow(
        "Invalid namespaced filename",
      );
    });

    it("handles complex namespaces", () => {
      const result = converter.convert(
        "my-company-123:backend-api.md",
        "content",
      );

      expect(result.filename).toBe("my-company-123:backend-api.md");
    });

    it("handles files without .md extension", () => {
      const result = converter.convert("team:security", "# Security");

      expect(result.filename).toBe("team:security");
    });
  });
});
