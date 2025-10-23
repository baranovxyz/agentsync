import { describe, expect, it } from "vitest";
import { CursorCommandsConverter } from "../../../../src/targets/commands/cursor-commands-converter.js";

describe("CursorCommandsConverter", () => {
  const converter = new CursorCommandsConverter();

  describe("convert", () => {
    it("converts namespaced markdown keeping .md extension", () => {
      const result = converter.convert(
        "company:commit.md",
        "# Generate Commit\n\nCreate conventional commit.",
      );

      expect(result.filename).toBe("company:commit.md");
      expect(result.content).toBe(
        "# Generate Commit\n\nCreate conventional commit.",
      );
    });

    it("preserves namespace in filename", () => {
      const result = converter.convert("team:deploy.md", "# Deploy");

      expect(result.filename).toBe("team:deploy.md");
    });

    it("preserves content as-is", () => {
      const content = "# Test\n\nRun all tests.";
      const result = converter.convert("company:test.md", content);

      expect(result.content).toBe(content);
    });

    it("throws on invalid namespaced filename", () => {
      expect(() => converter.convert("commit.md", "content")).toThrow(
        "Invalid namespaced filename",
      );
    });

    it("handles complex namespaces", () => {
      const result = converter.convert("acme-corp-123:review.md", "content");

      expect(result.filename).toBe("acme-corp-123:review.md");
    });
  });
});
