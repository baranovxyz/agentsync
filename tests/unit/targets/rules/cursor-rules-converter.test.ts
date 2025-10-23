import { describe, expect, it } from "vitest";
import { CursorRulesConverter } from "../../../../src/targets/rules/cursor-rules-converter.js";

describe("CursorRulesConverter", () => {
  const converter = new CursorRulesConverter();

  describe("convert", () => {
    it("converts namespaced markdown to .mdc format", () => {
      const result = converter.convert(
        "company:typescript.md",
        "# TypeScript Rules\n\nUse strict mode.",
      );

      expect(result.filename).toBe("company:typescript.mdc");
      expect(result.content).toBe("# TypeScript Rules\n\nUse strict mode.");
    });

    it("handles files without .md extension", () => {
      const result = converter.convert(
        "team:security",
        "# Security\n\nNo secrets.",
      );

      expect(result.filename).toBe("team:security.mdc");
      expect(result.content).toBe("# Security\n\nNo secrets.");
    });

    it("preserves namespace in filename", () => {
      const result = converter.convert("acme-corp:api.md", "# API Design");

      expect(result.filename).toBe("acme-corp:api.mdc");
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

      expect(result.filename).toBe("my-company-123:backend-api.mdc");
    });
  });
});
