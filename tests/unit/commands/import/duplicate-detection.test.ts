/**
 * Unit Tests for Duplicate Detection
 * Tests detection, normalization, and formatting of duplicate files
 */

import { describe, expect, it } from "vitest";
import {
  type DuplicateGroup,
  detectDuplicates,
  formatDuplicateDetails,
  formatDuplicateSummary,
} from "../../../../src/commands/import/duplicate-detector.js";
import type {
  CanonicalCommand,
  CanonicalRule,
} from "../../../../src/types/canonical.js";

// Helper to create test rules
function createTestRule(description: string): CanonicalRule {
  return {
    frontmatter: { description },
    markdown: "Test markdown content",
  };
}

// Helper to create test commands
function createTestCommand(description: string): CanonicalCommand {
  return {
    frontmatter: { description },
    markdown: "Test command markdown",
  };
}

describe("Duplicate Detection", () => {
  describe("detectDuplicates", () => {
    it("returns empty array when no duplicates exist", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([["typescript.md", createTestRule("TypeScript")]]),
      );
      sources.set("claude", new Map([["python.md", createTestRule("Python")]]));

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(0);
    });

    it("detects duplicate rules by normalized filename", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([["typescript.md", createTestRule("TypeScript from Cursor")]]),
      );
      sources.set(
        "claude",
        new Map([["typescript.md", createTestRule("TypeScript from Claude")]]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].normalizedName).toBe("typescript");
      expect(duplicates[0].variants).toHaveLength(2);
    });

    it("normalizes .mdc and .md extensions as equivalent", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([["typescript.mdc", createTestRule("TypeScript .mdc")]]),
      );
      sources.set(
        "claude",
        new Map([["typescript.md", createTestRule("TypeScript .md")]]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].normalizedName).toBe("typescript");
    });

    it("normalizes case-insensitive filenames", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([["TypeScript.md", createTestRule("TypeScript uppercase")]]),
      );
      sources.set(
        "claude",
        new Map([["typescript.md", createTestRule("TypeScript lowercase")]]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].normalizedName).toBe("typescript");
    });

    it("treats source prefixes as equivalent (cursor_typescript vs typescript)", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([["cursor_typescript.md", createTestRule("With prefix")]]),
      );
      sources.set(
        "claude",
        new Map([["typescript.md", createTestRule("Without prefix")]]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].normalizedName).toBe("typescript");
    });

    it("detects multiple duplicates", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([
          ["typescript.md", createTestRule("TS")],
          ["python.md", createTestRule("Python")],
          ["react.md", createTestRule("React")],
        ]),
      );
      sources.set(
        "claude",
        new Map([
          ["typescript.md", createTestRule("TS alt")],
          ["python.md", createTestRule("Python alt")],
        ]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(2);
      expect(duplicates.map((d) => d.normalizedName)).toContain("typescript");
      expect(duplicates.map((d) => d.normalizedName)).toContain("python");
    });

    it("works with both rules and commands", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([
          ["test.md", createTestRule("Rule")],
          ["commit.md", createTestCommand("Command")],
        ]),
      );
      sources.set(
        "claude",
        new Map([
          ["test.md", createTestCommand("Command with same name")],
          ["commit.md", createTestRule("Rule with same name")],
        ]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(2);
    });

    it("ignores files that appear in only one source", () => {
      const sources = new Map();
      sources.set(
        "cursor",
        new Map([
          ["typescript.md", createTestRule("TS")],
          ["cursor-only.md", createTestRule("Cursor only")],
        ]),
      );
      sources.set(
        "claude",
        new Map([
          ["typescript.md", createTestRule("TS alt")],
          ["claude-only.md", createTestRule("Claude only")],
        ]),
      );

      const duplicates = detectDuplicates(sources);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].normalizedName).toBe("typescript");
    });

    it("includes metadata (source, filename, modifiedTime) in variants", () => {
      const date = new Date("2025-10-30");
      const sources = new Map();
      const ruleWithTime: CanonicalRule & { modifiedTime?: Date } = {
        frontmatter: { description: "Test" },
        markdown: "Content",
        modifiedTime: date,
      };
      sources.set("cursor", new Map([["test.md", ruleWithTime]]));
      sources.set("claude", new Map([["test.md", createTestRule("Test")]]));

      const duplicates = detectDuplicates(sources);
      const cursorVariant = duplicates[0].variants.find(
        (v) => v.source === "cursor",
      );
      expect(cursorVariant?.modifiedTime).toEqual(date);
    });
  });

  describe("formatDuplicateSummary", () => {
    it("returns empty string for no duplicates", () => {
      expect(formatDuplicateSummary([])).toBe("");
    });

    it("formats single duplicate", () => {
      const duplicates: DuplicateGroup[] = [
        {
          normalizedName: "typescript",
          variants: [
            {
              source: "cursor",
              filename: "typescript.md",
              content: createTestRule("TS"),
            },
            {
              source: "claude",
              filename: "typescript.md",
              content: createTestRule("TS"),
            },
          ],
        },
      ];

      const summary = formatDuplicateSummary(duplicates);
      expect(summary).toContain("Found 1 duplicate");
      expect(summary).toContain("typescript");
    });

    it("formats multiple duplicates with correct pluralization", () => {
      const duplicates: DuplicateGroup[] = [
        {
          normalizedName: "typescript",
          variants: [
            {
              source: "cursor",
              filename: "typescript.md",
              content: createTestRule("TS"),
            },
            {
              source: "claude",
              filename: "typescript.md",
              content: createTestRule("TS"),
            },
          ],
        },
        {
          normalizedName: "python",
          variants: [
            {
              source: "cursor",
              filename: "python.md",
              content: createTestRule("Python"),
            },
            {
              source: "claude",
              filename: "python.md",
              content: createTestRule("Python"),
            },
          ],
        },
      ];

      const summary = formatDuplicateSummary(duplicates);
      expect(summary).toContain("Found 2 duplicates");
      expect(summary).toContain("typescript, python");
    });
  });

  describe("formatDuplicateDetails", () => {
    it("formats duplicate group with description", () => {
      const duplicate: DuplicateGroup = {
        normalizedName: "typescript",
        variants: [
          {
            source: "cursor",
            filename: "typescript.md",
            content: createTestRule("TypeScript Coding Standards"),
          },
          {
            source: "claude",
            filename: "typescript.md",
            content: createTestRule("TypeScript Best Practices"),
          },
        ],
      };

      const details = formatDuplicateDetails(duplicate);
      expect(details).toContain("typescript");
      expect(details).toContain("cursor");
      expect(details).toContain("claude");
      expect(details).toContain("TypeScript Coding Standards");
      expect(details).toContain("TypeScript Best Practices");
    });

    it("includes modified timestamps when available", () => {
      const date1 = new Date("2025-10-28");
      const date2 = new Date("2025-10-30");

      const duplicate: DuplicateGroup = {
        normalizedName: "test",
        variants: [
          {
            source: "cursor",
            filename: "test.md",
            content: createTestRule("Test 1"),
            modifiedTime: date1,
          },
          {
            source: "claude",
            filename: "test.md",
            content: createTestRule("Test 2"),
            modifiedTime: date2,
          },
        ],
      };

      const details = formatDuplicateDetails(duplicate);
      expect(details).toContain("2025-10-28");
      expect(details).toContain("2025-10-30");
    });

    it("marks newest variant with arrow indicator", () => {
      const olderDate = new Date("2025-10-28");
      const newerDate = new Date("2025-10-30");

      const duplicate: DuplicateGroup = {
        normalizedName: "test",
        variants: [
          {
            source: "cursor",
            filename: "test.md",
            content: createTestRule("Test 1"),
            modifiedTime: olderDate,
          },
          {
            source: "claude",
            filename: "test.md",
            content: createTestRule("Test 2"),
            modifiedTime: newerDate,
          },
        ],
      };

      const details = formatDuplicateDetails(duplicate);
      const lines = details.split("\n");
      // Find line with claude (newer)
      const claudeLine = lines.find((l) => l.includes("claude"));
      expect(claudeLine).toContain("← newest");
    });
  });
});
