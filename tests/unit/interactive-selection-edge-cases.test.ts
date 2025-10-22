/**
 * Edge cases and error scenarios tests for interactive selection features
 * Tests unusual scenarios and error handling
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ConfigMerger } from "../../src/core/config/interactive-selection-merger.js";
import { ConfigMigrator } from "../../src/core/config/interactive-selection-migration.js";
import {
  SelectionValidationError,
  SelectiveLoadingError,
} from "../../src/core/errors.js";
import { RegistryOrchestrator } from "../../src/core/registry/registry-orchestrator.js";
import { SelectivePresetLoader } from "../../src/core/registry/selective-preset-loader.js";
import type {
  InteractiveSelectionConfig,
  Preset,
  PresetSelection,
} from "../../src/types/index.js";

describe("Interactive Selection Edge Cases and Error Scenarios", () => {
  let loader: SelectivePresetLoader;
  let merger: ConfigMerger;
  let migrator: ConfigMigrator;
  let _orchestrator: RegistryOrchestrator;

  beforeEach(() => {
    loader = new SelectivePresetLoader();
    merger = new ConfigMerger();
    migrator = new ConfigMigrator();
    _orchestrator = new RegistryOrchestrator();
  });

  describe("SelectivePresetLoader edge cases", () => {
    it("should handle empty preset gracefully", async () => {
      const emptyPreset: Preset = {
        source: "github:example/empty",
        namespace: "example",
        path: "/cache/example/empty",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
        commands: { include: ["*.md"] },
        mcps: ["any-server"],
      };

      const result = await loader.loadSelective(emptyPreset, selection);

      expect(result.commands.size).toBe(0);
      expect(result.rules.size).toBe(0);
      expect(Object.keys(result.mcps).length).toBe(0);
    });

    it("should handle null/undefined preset", async () => {
      await expect(loader.loadSelective(null as any)).rejects.toThrow(
        SelectiveLoadingError,
      );
      await expect(loader.loadSelective(undefined as any)).rejects.toThrow(
        SelectiveLoadingError,
      );
    });

    it("should handle preset with missing properties", async () => {
      const invalidPreset = {
        source: "github:example/invalid",
        // Missing namespace, path, commands, rules, mcps
      } as any;

      await expect(loader.loadSelective(invalidPreset)).rejects.toThrow(
        SelectiveLoadingError,
      );
    });

    it("should handle invalid selection structure", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build"]]),
        rules: new Map([["eslint.md", "# ESLint"]]),
        mcps: { github: { command: "github", args: [] } },
      };

      // Test with string instead of object
      await expect(
        loader.loadSelective(preset, "invalid" as any),
      ).rejects.toThrow(SelectiveLoadingError);

      // Test with invalid rules selection
      const invalidRulesSelection = {
        rules: "invalid" as any,
      };
      await expect(
        loader.loadSelective(preset, invalidRulesSelection),
      ).rejects.toThrow(SelectiveLoadingError);

      // Test with invalid commands selection
      const invalidCommandsSelection = {
        commands: "invalid" as any,
      };
      await expect(
        loader.loadSelective(preset, invalidCommandsSelection),
      ).rejects.toThrow(SelectiveLoadingError);

      // Test with invalid MCPs selection
      const invalidMcpsSelection = {
        mcps: "invalid" as any,
      };
      await expect(
        loader.loadSelective(preset, invalidMcpsSelection),
      ).rejects.toThrow(SelectiveLoadingError);
    });

    it("should handle circular references in mergeFilteredPresets", () => {
      // Create presets with overlapping content that could cause issues
      const preset1: any = {
        source: "github:example/preset1",
        commands: new Map([["shared.md", "Content from preset1"]]),
        rules: new Map([["shared.md", "Rules from preset1"]]),
        mcps: { shared: { command: "shared-1" } },
      };

      const preset2: any = {
        source: "github:example/preset2",
        commands: new Map([["shared.md", "Content from preset2"]]),
        rules: new Map([["shared.md", "Rules from preset2"]]),
        mcps: { shared: { command: "shared-2" } },
      };

      const filtered1 = {
        commands: preset1.commands,
        rules: preset1.rules,
        mcps: preset1.mcps,
      };

      const filtered2 = {
        commands: preset2.commands,
        rules: preset2.rules,
        mcps: preset2.mcps,
      };

      const merged = loader.mergeFilteredPresets([filtered1, filtered2]);

      expect(merged.commands.size).toBe(1);
      expect(merged.commands.get("shared.md")).toBe("Content from preset2"); // Second preset overrides
      expect(merged.rules.size).toBe(1);
      expect(merged.rules.get("shared.md")).toBe("Rules from preset2"); // Second preset overrides
      expect(merged.mcps.shared.command).toBe("shared-2"); // Second preset overrides
    });

    it("should handle very large file names", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Create very long filename
      const longFilename = `${"a".repeat(1000)}.md`;
      preset.rules.set(longFilename, "# Content");

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
      };

      const result = await loader.loadSelective(preset, selection);

      expect(result.rules.size).toBe(1);
      expect(result.rules.has(longFilename)).toBe(true);
    });

    it("should handle special characters in file names", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Add files with special characters
      const specialFiles = [
        "file with spaces.md",
        "file-with-dashes.md",
        "file_with_underscores.md",
        "file.with.dots.md",
        "file(with)parentheses.md",
        "file[with]brackets.md",
        "file{with}braces.md",
        "file'with'quotes.md",
        'file"with"double-quotes.md',
        "file#with#hash.md",
        "file@with@at.md",
        "file$with$dollar.md",
        "file%with%percent.md",
        "file^with^caret.md",
        "file&with&ampersand.md",
        "file*with*asterisk.md",
        "file+with+plus.md",
        "file=with=equals.md",
        "file|with|pipe.md",
        "file\\with\\backslash.md",
        "file/with/slash.md",
        "file?with?question.md",
        "file<with>brackets.md",
      ];

      specialFiles.forEach((filename) => {
        preset.rules.set(filename, `# Content for ${filename}`);
      });

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
      };

      const result = await loader.loadSelective(preset, selection);

      expect(result.rules.size).toBe(specialFiles.length);
      specialFiles.forEach((filename) => {
        expect(result.rules.has(filename)).toBe(true);
      });
    });
  });

  describe("ConfigMerger edge cases", () => {
    it("should handle empty configuration", () => {
      const emptyConfig: InteractiveSelectionConfig = {
        version: "2.0",
      };

      const merged = merger.mergeConfig(emptyConfig);

      expect(merged.presets).toEqual([]);
      expect(merged.selections).toEqual({});
      expect(merged.overrides).toEqual({});
      expect(merged.tools).toEqual([]);
    });

    it("should handle configuration with only one level", () => {
      const userOnlyConfig: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
          defaultSelections: {
            "github:example/standards": {
              rules: { include: ["*.md"] },
            },
          },
        },
      };

      const merged = merger.mergeConfig(userOnlyConfig);

      expect(merged.presets).toEqual(["github:example/standards"]);
      expect(merged.selections).toEqual({
        "github:example/standards": {
          rules: { include: ["*.md"] },
        },
      });
      expect(merged.overrides).toEqual({});
      expect(merged.tools).toEqual([]);
    });

    it("should handle malformed selection patterns", () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build"]]),
        rules: new Map([["eslint.md", "# ESLint"]]),
        mcps: { github: { command: "github", args: [] } },
      };

      // Test with empty include array
      const emptyIncludeSelection: PresetSelection = {
        rules: { include: [] },
      };

      const result1 = merger.applySelections(preset, emptyIncludeSelection);
      expect(result1.rules.size).toBe(0);

      // Test with null include
      const nullIncludeSelection: PresetSelection = {
        rules: { include: null as any },
      };

      const result2 = merger.applySelections(preset, nullIncludeSelection);
      expect(result2.rules.size).toBe(0);

      // Test with undefined include
      const undefinedIncludeSelection: PresetSelection = {
        rules: { include: undefined as any },
      };

      const result3 = merger.applySelections(preset, undefinedIncludeSelection);
      expect(result3.rules.size).toBe(0);
    });

    it("should handle conflicting selections across levels", () => {
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
          defaultSelections: {
            "github:example/standards": {
              rules: { include: ["user-rules/*.md"] },
              commands: { include: ["user-commands/*.md"] },
              mcps: ["user-mcp"],
            },
          },
        },
        project: {
          selections: {
            "github:example/standards": {
              rules: { include: ["project-rules/*.md"] }, // Should override user
              commands: { include: ["project-commands/*.md"] }, // Should override user
              mcps: ["project-mcp"], // Should override user
            },
          },
        },
        local: {
          selections: {
            "github:example/standards": {
              rules: { include: ["local-rules/*.md"] }, // Should override project
              // No commands - should inherit from project
              // No mcps - should inherit from project
            },
          },
        },
      };

      const merged = merger.mergeConfig(config);
      const selection = merged.selections["github:example/standards"];

      expect(selection.rules?.include).toEqual(["local-rules/*.md"]); // Local overrides project
      expect(selection.commands?.include).toEqual(["project-commands/*.md"]); // Project overrides user
      expect(selection.mcps).toEqual(["project-mcp"]); // Project overrides user
    });

    it("should handle very deep configuration nesting", () => {
      // Create a configuration with many levels of nesting
      const deepConfig: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
          defaultSelections: {
            "github:example/standards": {
              rules: { include: ["user-rules/*.md"] },
            },
          },
        },
        project: {
          selections: {
            "github:example/standards": {
              rules: { include: ["project-rules/*.md"] },
            },
          },
          overrides: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: "deep value",
                  },
                },
              },
            },
          },
        },
      };

      const merged = merger.mergeConfig(deepConfig);

      expect(merged.overrides).toEqual({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: "deep value",
              },
            },
          },
        },
      });
    });
  });

  describe("ConfigMigrator edge cases", () => {
    it("should handle empty legacy configuration", () => {
      const emptyLegacyConfig = {};

      const result = migrator.migrateFromLegacy(emptyLegacyConfig);

      expect(result.config.version).toBe("2.0");
      expect(result.config.user).toBeUndefined();
      expect(result.config.project).toBeUndefined();
      expect(result.config.local).toBeUndefined();
      expect(result.warnings).toHaveLength(0);
    });

    it("should handle legacy configuration with unknown fields", () => {
      const legacyConfigWithUnknownFields = {
        version: "1.0",
        extends: ["github:example/standards"],
        tools: ["cursor"],
        unknownField1: "value1",
        unknownField2: {
          nested: "value2",
        },
        unknownArray: [1, 2, 3],
      };

      const result = migrator.migrateFromLegacy(legacyConfigWithUnknownFields);

      expect(result.config.version).toBe("2.0");
      expect(result.config.user?.presets).toEqual(["github:example/standards"]);
      expect(result.config.project?.tools).toEqual(["cursor"]);
      // Unknown fields should be ignored without errors
    });

    it("should handle invalid tool names in legacy configuration", () => {
      const legacyConfigWithInvalidTools = {
        version: "1.0",
        extends: ["github:example/standards"],
        tools: ["cursor", "invalid-tool", "claude", "another-invalid"],
      };

      const result = migrator.migrateFromLegacy(legacyConfigWithInvalidTools);

      expect(result.config.project?.tools).toEqual(["cursor", "claude"]); // Only valid tools
    });

    it("should handle malformed mcpServers in legacy configuration", () => {
      const legacyConfigWithMalformedMcps = {
        version: "1.0",
        extends: ["github:example/standards"],
        mcpServers: {
          github: true,
          invalid: "not a boolean or object",
          filesystem: {
            command: "filesystem",
            args: ["--verbose"],
          },
          another: null,
        },
      };

      const result = migrator.migrateFromLegacy(legacyConfigWithMalformedMcps);

      expect(result.config.project?.overrides?.mcpServers).toEqual({
        github: true,
        invalid: "not a boolean or object",
        filesystem: {
          command: "filesystem",
          args: ["--verbose"],
        },
        another: null,
      });
    });

    it("should detect non-legacy configuration correctly", () => {
      const newConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
        },
        project: {
          tools: ["cursor"],
        },
      };

      expect(migrator.isLegacyConfig(newConfig)).toBe(false);

      const mixedConfig = {
        version: "1.0",
        extends: ["github:example/standards"], // Legacy field
        user: {
          presets: ["github:example/standards"], // New field
        },
      };

      expect(migrator.isLegacyConfig(mixedConfig)).toBe(false); // Has new structure
    });
  });

  describe("Error handling and validation", () => {
    it("should handle validation errors for invalid glob patterns", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build"]]),
        rules: new Map([["eslint.md", "# ESLint"]]),
        mcps: { github: { command: "github", args: [] } },
      };

      const selection: PresetSelection = {
        rules: { include: ["invalid[pattern"] }, // Invalid glob pattern
      };

      await expect(loader.loadSelective(preset, selection)).rejects.toThrow(
        SelectionValidationError,
      );
    });

    it("should handle validation errors for non-existent files", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build"]]),
        rules: new Map([["eslint.md", "# ESLint"]]),
        mcps: { github: { command: "github", args: [] } },
      };

      const selection: PresetSelection = {
        rules: { include: ["non-existent.md"] },
        commands: { include: ["missing.md"] },
        mcps: ["non-existent-server"],
      };

      const validation = await loader.validateSelection(preset, selection);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(3);
      expect(validation.errors).toContain(
        "Rule file 'non-existent.md' not found in preset 'github:example/standards'",
      );
      expect(validation.errors).toContain(
        "Command file 'missing.md' not found in preset 'github:example/standards'",
      );
      expect(validation.errors).toContain(
        "MCP server 'non-existent-server' not found in preset 'github:example/standards'",
      );
    });

    it("should handle circular references in configuration", () => {
      // Create a configuration that could cause circular references
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
          defaultSelections: {
            "github:example/standards": {
              rules: { include: ["*.md"] },
            },
          },
        },
        project: {
          selections: {
            "github:example/standards": {
              rules: { include: ["*.md"] },
            },
          },
        },
      };

      // This should not cause infinite recursion
      const merged = merger.mergeConfig(config);

      expect(merged.presets).toEqual(["github:example/standards"]);
      expect(
        merged.selections["github:example/standards"].rules?.include,
      ).toEqual(["*.md"]);
    });

    it("should handle memory pressure with large datasets", async () => {
      // Create a preset with a very large number of files
      const largePreset: Preset = {
        source: "github:example/large",
        namespace: "example",
        path: "/cache/example/large",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Add 10,000 files
      for (let i = 0; i < 10000; i++) {
        largePreset.rules.set(`file-${i}.md`, `# Content for file ${i}`);
      }

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
      };

      // This should not cause memory issues
      const result = await loader.loadSelective(largePreset, selection);

      expect(result.rules.size).toBe(10000);
    });

    it("should handle concurrent operations", async () => {
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build"]]),
        rules: new Map([["eslint.md", "# ESLint"]]),
        mcps: { github: { command: "github", args: [] } },
      };

      const selection: PresetSelection = {
        rules: { include: ["*.md"] },
        commands: { include: ["*.md"] },
        mcps: ["github"],
      };

      // Run multiple operations concurrently
      const promises = Array.from({ length: 100 }, () =>
        loader.loadSelective(preset, selection),
      );
      const results = await Promise.all(promises);

      // All operations should complete successfully
      results.forEach((result) => {
        expect(result.rules.size).toBe(1);
        expect(result.commands.size).toBe(1);
        expect(Object.keys(result.mcps).length).toBe(1);
      });
    });
  });

  describe("Backward compatibility edge cases", () => {
    it("should handle configuration version mismatches", () => {
      const configWithWrongVersion = {
        version: "999.0", // Very high version number
        user: {
          presets: ["github:example/standards"],
        },
      };

      // Should still process the configuration
      const merged = merger.mergeConfig(configWithWrongVersion as any);
      expect(merged.presets).toEqual(["github:example/standards"]);
    });

    it("should handle missing version in configuration", () => {
      const configWithoutVersion = {
        user: {
          presets: ["github:example/standards"],
        },
      };

      // Should use default version
      const merged = merger.mergeConfig(configWithoutVersion as any);
      expect(merged.presets).toEqual(["github:example/standards"]);
    });

    it("should handle configuration with null/undefined values", () => {
      const configWithNulls = {
        version: "2.0",
        user: null,
        project: {
          selections: null,
          tools: undefined,
        },
        local: {
          selections: undefined,
          overrides: null,
        },
      };

      // Should handle null/undefined values gracefully
      const merged = merger.mergeConfig(configWithNulls as any);
      expect(merged.presets).toEqual([]);
      expect(merged.selections).toEqual({});
      expect(merged.overrides).toEqual({});
      expect(merged.tools).toEqual([]);
    });
  });
});
