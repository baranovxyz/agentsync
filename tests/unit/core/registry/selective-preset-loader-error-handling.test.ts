/**
 * Tests for error handling in selective preset loading
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ErrorCategory,
  SelectiveLoadingError,
} from "@/core/errors";
import { SelectivePresetLoader } from "@/core/registry/selective-preset-loader";
import type { Preset, PresetSelection } from "@/types/index";

describe("SelectivePresetLoader error handling", () => {
  let loader: SelectivePresetLoader;
  let mockPreset: Preset;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new SelectivePresetLoader();

    mockPreset = {
      source: "github:org/repo",
      version: "1.0.0",
      rules: new Map([
        ["rule1.md", "rule content 1"],
        ["rule2.md", "rule content 2"],
        ["nested/rule3.md", "rule content 3"],
      ]),
      commands: new Map([
        ["cmd1.js", "command content 1"],
        ["cmd2.py", "command content 2"],
      ]),
      mcps: {
        mcp1: { name: "mcp1", config: {} },
        mcp2: { name: "mcp2", config: {} },
      },
    };
  });

  describe("loadSelective", () => {
    it("should throw SelectiveLoadingError for invalid preset data", async () => {
      const invalidPreset = {
        source: "github:org/repo",
        rules: null, // Invalid rules
        commands: new Map(),
        mcps: {},
      } as any;

      await expect(loader.loadSelective(invalidPreset)).rejects.toThrow(
        SelectiveLoadingError,
      );
    });

    it("should throw SelectiveLoadingError for invalid selection patterns", async () => {
      const invalidSelection: PresetSelection = {
        rules: {
          include: ["[invalid-pattern"], // Invalid glob pattern
        },
      };

      await expect(
        loader.loadSelective(mockPreset, invalidSelection),
      ).rejects.toThrow(SelectiveLoadingError);
    });

    it("should handle empty preset gracefully", async () => {
      const emptyPreset: Preset = {
        source: "github:org/repo",
        version: "1.0.0",
        rules: new Map(),
        commands: new Map(),
        mcps: {},
      };

      const result = await loader.loadSelective(emptyPreset);
      expect(result.rules.size).toBe(0);
      expect(result.commands.size).toBe(0);
      expect(Object.keys(result.mcps).length).toBe(0);
    });
  });

  describe("validateSelection", () => {
    it("should throw SelectionValidationError for non-existent rule files", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["non-existent.md"],
        },
      };

      const result = await loader.validateSelection(mockPreset, selection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Rule file 'non-existent.md' not found in preset 'github:org/repo'",
      );
    });

    it("should throw SelectionValidationError for non-existent command files", async () => {
      const selection: PresetSelection = {
        commands: {
          include: ["non-existent.js"],
        },
      };

      const result = await loader.validateSelection(mockPreset, selection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Command file 'non-existent.js' not found in preset 'github:org/repo'",
      );
    });

    it("should throw SelectionValidationError for non-existent MCP servers", async () => {
      const selection: PresetSelection = {
        mcps: ["non-existent-mcp"],
      };

      const result = await loader.validateSelection(mockPreset, selection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "MCP server 'non-existent-mcp' not found in preset 'github:org/repo'",
      );
    });

    it("should throw SelectionValidationError for unmatched glob patterns", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["*.nonexistent"],
        },
      };

      const result = await loader.validateSelection(mockPreset, selection);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "No rule files match include pattern: *.nonexistent",
      );
    });

    it("should validate complex glob patterns correctly", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["**/*.md", "nested/*"],
        },
      };

      const result = await loader.validateSelection(mockPreset, selection);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("mergeFilteredPresets", () => {
    it("should throw SelectiveLoadingError for invalid result data", async () => {
      const invalidResults = [
        null,
        undefined,
        { rules: "invalid" }, // Should be Map
        { commands: "invalid" }, // Should be Map
        { mcps: "invalid" }, // Should be object
      ] as any;

      for (const invalidResult of invalidResults) {
        await expect(
          loader.mergeFilteredPresets([invalidResult]),
        ).rejects.toThrow(SelectiveLoadingError);
      }
    });

    it("should handle empty results array", () => {
      const result = loader.mergeFilteredPresets([]);
      expect(result.rules.size).toBe(0);
      expect(result.commands.size).toBe(0);
      expect(Object.keys(result.mcps).length).toBe(0);
    });

    it("should merge multiple results correctly", () => {
      const result1 = {
        commands: new Map([["cmd1.js", "content1"]]),
        rules: new Map([["rule1.md", "rule1"]]),
        mcps: { mcp1: { name: "mcp1" } },
      };

      const result2 = {
        commands: new Map([["cmd2.js", "content2"]]),
        rules: new Map([["rule2.md", "rule2"]]),
        mcps: { mcp2: { name: "mcp2" } },
      };

      const merged = loader.mergeFilteredPresets([result1, result2]);

      expect(merged.commands.size).toBe(2);
      expect(merged.rules.size).toBe(2);
      expect(Object.keys(merged.mcps).length).toBe(2);
    });
  });

  describe("getSelectionStats", () => {
    it("should throw SelectiveLoadingError for invalid preset data", async () => {
      const invalidPreset = {
        source: "github:org/repo",
        rules: "invalid", // Should be Map
        commands: new Map(),
        mcps: {},
      } as any;

      await expect(loader.getSelectionStats(invalidPreset)).rejects.toThrow(
        SelectiveLoadingError,
      );
    });

    it("should handle empty selection correctly", async () => {
      const stats = await loader.getSelectionStats(mockPreset);

      expect(stats.totalRules).toBe(3);
      expect(stats.selectedRules).toBe(3);
      expect(stats.totalCommands).toBe(2);
      expect(stats.selectedCommands).toBe(2);
      expect(stats.totalMcps).toBe(2);
      expect(stats.selectedMcps).toBe(2);
    });

    it("should calculate selection stats correctly", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["rule1.md"],
        },
        commands: {
          include: ["cmd1.js"],
        },
        mcps: ["mcp1"],
      };

      const stats = await loader.getSelectionStats(mockPreset, selection);

      expect(stats.totalRules).toBe(3);
      expect(stats.selectedRules).toBe(1);
      expect(stats.totalCommands).toBe(2);
      expect(stats.selectedCommands).toBe(1);
      expect(stats.totalMcps).toBe(2);
      expect(stats.selectedMcps).toBe(1);
    });
  });

  describe("isEmptySelection", () => {
    it("should throw SelectiveLoadingError for invalid preset data", async () => {
      const invalidPreset = {
        source: "github:org/repo",
        rules: null, // Invalid
        commands: new Map(),
        mcps: {},
      } as any;

      await expect(loader.isEmptySelection(invalidPreset)).rejects.toThrow(
        SelectiveLoadingError,
      );
    });

    it("should identify empty selections correctly", async () => {
      const emptySelection: PresetSelection = {
        rules: {
          include: ["non-existent.md"],
        },
      };

      const isEmpty = await loader.isEmptySelection(mockPreset, emptySelection);
      expect(isEmpty).toBe(true);
    });

    it("should identify non-empty selections correctly", async () => {
      const nonEmptySelection: PresetSelection = {
        rules: {
          include: ["rule1.md"],
        },
      };

      const isEmpty = await loader.isEmptySelection(
        mockPreset,
        nonEmptySelection,
      );
      expect(isEmpty).toBe(false);
    });
  });

  describe("error context and metadata", () => {
    it("should include preset source in error context", async () => {
      try {
        await loader.loadSelective(null as any);
      } catch (error) {
        expect(error).toBeInstanceOf(SelectiveLoadingError);
        if (error instanceof SelectiveLoadingError) {
          expect(error.metadata.context?.presetSource).toBe(mockPreset.source);
          expect(error.metadata.category).toBe(ErrorCategory.PARSE);
        }
      }
    });

    it("should include selection type in error context", async () => {
      try {
        await loader.validateSelection(mockPreset, {
          rules: { include: ["[invalid"] },
        } as any);
      } catch (error) {
        expect(error).toBeInstanceOf(SelectiveLoadingError);
        if (error instanceof SelectiveLoadingError) {
          expect(error.metadata.context?.selectionType).toBe("rules");
        }
      }
    });

    it("should provide user-friendly error messages with suggestions", async () => {
      try {
        await loader.loadSelective(mockPreset, {
          rules: { include: ["[invalid"] },
        });
      } catch (error) {
        expect(error).toBeInstanceOf(SelectiveLoadingError);
        if (error instanceof SelectiveLoadingError) {
          const userMessage = error.getUserMessage();
          expect(userMessage).toContain("💡 Suggestion:");
          expect(userMessage).toContain("Verify your selection patterns");
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle malformed selection objects", async () => {
      const malformedSelections = [
        null,
        undefined,
        { rules: null },
        { commands: "invalid" },
        { mcps: "not-array" },
      ] as any;

      for (const selection of malformedSelections) {
        await expect(
          loader.loadSelective(mockPreset, selection),
        ).rejects.toThrow(SelectiveLoadingError);
      }
    });

    it("should handle circular references in preset data", async () => {
      const circularPreset: any = {
        source: "github:org/repo",
        rules: new Map(),
        commands: new Map(),
        mcps: {},
      };

      // Create circular reference
      circularPreset.self = circularPreset;

      // Should not throw, but handle gracefully
      const result = await loader.loadSelective(circularPreset);
      expect(result).toBeDefined();
    });

    it("should handle extremely large preset data", async () => {
      const largePreset: Preset = {
        source: "github:org/repo",
        version: "1.0.0",
        rules: new Map(),
        commands: new Map(),
        mcps: {},
      };

      // Add many files
      for (let i = 0; i < 1000; i++) {
        largePreset.rules.set(`rule${i}.md`, `content ${i}`);
        largePreset.commands.set(`cmd${i}.js`, `content ${i}`);
      }

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
        commands: { include: ["*.js"] },
      };

      const result = await loader.loadSelective(largePreset, selection);
      expect(result.rules.size).toBe(1000);
      expect(result.commands.size).toBe(1000);
    });
  });
});
