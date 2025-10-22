/**
 * Performance tests for large preset collections
 * Tests the performance of interactive selection with many presets and files
 */

import { performance } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigMerger } from "../../src/core/config/interactive-selection-merger.js";
import { RegistryOrchestrator } from "../../src/core/registry/registry-orchestrator.js";
import { SelectivePresetLoader } from "../../src/core/registry/selective-preset-loader.js";
import type {
  InteractiveSelectionConfig,
  Preset,
  PresetSelection,
} from "../../src/types/index.js";

describe("Performance Tests for Large Preset Collections", () => {
  let loader: SelectivePresetLoader;
  let merger: ConfigMerger;
  let _orchestrator: RegistryOrchestrator;

  beforeEach(() => {
    loader = new SelectivePresetLoader();
    merger = new ConfigMerger();
    _orchestrator = new RegistryOrchestrator();
  });

  describe("Large preset loading performance", () => {
    it("should handle large preset with many files efficiently", async () => {
      // Create a preset with many files
      const largePreset: Preset = {
        source: "github:example/large-preset",
        namespace: "example",
        path: "/cache/example/large-preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Add 1000 rule files
      for (let i = 0; i < 1000; i++) {
        largePreset.rules.set(
          `rule-${i}.md`,
          `# Rule ${i}\n\nContent for rule ${i}`,
        );
      }

      // Add 500 command files
      for (let i = 0; i < 500; i++) {
        largePreset.commands.set(
          `command-${i}.md`,
          `# Command ${i}\n\nContent for command ${i}`,
        );
      }

      // Add 100 MCP servers
      for (let i = 0; i < 100; i++) {
        largePreset.mcps[`mcp-${i}`] = {
          command: `mcp-server-${i}`,
          args: [`--port=${3000 + i}`],
        };
      }

      // Test loading without selection
      const startTime = performance.now();
      const resultWithoutSelection = await loader.loadSelective(largePreset);
      const loadTimeWithoutSelection = performance.now() - startTime;

      expect(resultWithoutSelection.rules.size).toBe(1000);
      expect(resultWithoutSelection.commands.size).toBe(500);
      expect(Object.keys(resultWithoutSelection.mcps).length).toBe(100);
      expect(loadTimeWithoutSelection).toBeLessThan(1000); // Should load in under 1 second

      // Test loading with selection
      const selection: PresetSelection = {
        rules: {
          include: ["rule-*.md"],
          exclude: ["rule-9*.md"], // Exclude 100 files
        },
        commands: {
          include: ["command-*.md"],
          exclude: ["command-4*.md"], // Exclude 50 files
        },
        mcps: Array.from({ length: 50 }, (_, i) => `mcp-${i}`), // Select 50 MCPs
      };

      const startTimeWithSelection = performance.now();
      const resultWithSelection = await loader.loadSelective(
        largePreset,
        selection,
      );
      const loadTimeWithSelection = performance.now() - startTimeWithSelection;

      expect(resultWithSelection.rules.size).toBe(900); // 1000 - 100 excluded
      expect(resultWithSelection.commands.size).toBe(450); // 500 - 50 excluded
      expect(Object.keys(resultWithSelection.mcps).length).toBe(50);
      expect(loadTimeWithSelection).toBeLessThan(2000); // Should filter in under 2 seconds
    });

    it("should handle merging many filtered presets efficiently", async () => {
      // Create 50 presets with overlapping content
      const presets: Preset[] = [];
      const filteredResults: any[] = [];

      for (let i = 0; i < 50; i++) {
        const preset: Preset = {
          source: `github:org/preset-${i}`,
          namespace: "org",
          path: `/cache/org/preset-${i}`,
          commands: new Map(),
          rules: new Map(),
          mcps: {},
        };

        // Add 20 rule files per preset
        for (let j = 0; j < 20; j++) {
          preset.rules.set(`rule-${i}-${j}.md`, `# Rule ${i}-${j}\n\nContent`);
        }

        // Add 10 command files per preset
        for (let j = 0; j < 10; j++) {
          preset.commands.set(
            `command-${i}-${j}.md`,
            `# Command ${i}-${j}\n\nContent`,
          );
        }

        // Add 5 MCP servers per preset
        for (let j = 0; j < 5; j++) {
          preset.mcps[`mcp-${i}-${j}`] = {
            command: `mcp-server-${i}-${j}`,
            args: [],
          };
        }

        presets.push(preset);

        // Create filtered result for each preset
        const selection: PresetSelection = {
          rules: { include: ["*.md"] },
          commands: { include: ["*.md"] },
          mcps: Object.keys(preset.mcps),
        };

        const filteredResult = await loader.loadSelective(preset, selection);
        filteredResults.push(filteredResult);
      }

      // Test merging performance
      const startTime = performance.now();
      const merged = loader.mergeFilteredPresets(filteredResults);
      const mergeTime = performance.now() - startTime;

      expect(merged.rules.size).toBe(1000); // 50 presets * 20 rules
      expect(merged.commands.size).toBe(500); // 50 presets * 10 commands
      expect(Object.keys(merged.mcps).length).toBe(250); // 50 presets * 5 MCPs
      expect(mergeTime).toBeLessThan(500); // Should merge in under 500ms
    });
  });

  describe("Complex pattern matching performance", () => {
    it("should handle complex glob patterns efficiently", async () => {
      // Create a preset with files that have complex naming patterns
      const complexPreset: Preset = {
        source: "github:example/complex-preset",
        namespace: "example",
        path: "/cache/example/complex-preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Add files with complex naming patterns
      const filePatterns = [
        "src/components/Button/Button.test.tsx",
        "src/components/Button/Button.stories.tsx",
        "src/components/Button/index.ts",
        "src/components/Form/Form.test.tsx",
        "src/components/Form/Form.stories.tsx",
        "src/components/Form/index.ts",
        "src/utils/helpers.test.ts",
        "src/utils/helpers.ts",
        "src/utils/constants.ts",
        "src/hooks/useAuth.test.ts",
        "src/hooks/useAuth.ts",
        "src/hooks/useApi.test.ts",
        "src/hooks/useApi.ts",
        "src/services/api.service.test.ts",
        "src/services/api.service.ts",
        "src/services/auth.service.test.ts",
        "src/services/auth.service.ts",
        "docs/guides/getting-started.md",
        "docs/guides/advanced-usage.md",
        "docs/api/reference.md",
        "docs/examples/basic-example.md",
        "docs/examples/advanced-example.md",
        "scripts/build.sh",
        "scripts/deploy.sh",
        "scripts/test.sh",
        "scripts/lint.sh",
        "config/webpack.config.js",
        "config/jest.config.js",
        "config/eslint.config.js",
        "config/tsconfig.json",
      ];

      // Add 100 files with various patterns
      for (let i = 0; i < 100; i++) {
        const pattern = filePatterns[i % filePatterns.length].replace(
          /\./g,
          `-${i}.`,
        );
        complexPreset.rules.set(pattern, `# Content for ${pattern}`);
      }

      // Test complex selection patterns
      const complexSelection: PresetSelection = {
        rules: {
          include: [
            "src/**/*.ts",
            "src/**/*.tsx",
            "docs/**/*.md",
            "config/**/*.js",
            "scripts/**/*.sh",
          ],
          exclude: ["**/*.test.*", "**/*.stories.*"],
        },
      };

      const startTime = performance.now();
      const result = await loader.loadSelective(
        complexPreset,
        complexSelection,
      );
      const patternMatchingTime = performance.now() - startTime;

      // Verify the result
      expect(result.rules.size).toBeGreaterThan(0);
      expect(patternMatchingTime).toBeLessThan(500); // Should complete pattern matching in under 500ms

      // Verify no test or story files are included
      for (const [filename] of result.rules.entries()) {
        expect(filename).not.toContain(".test.");
        expect(filename).not.toContain(".stories.");
      }
    });

    it("should handle many selection patterns efficiently", async () => {
      // Create a preset with many files
      const largePreset: Preset = {
        source: "github:example/large-preset",
        namespace: "example",
        path: "/cache/example/large-preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      // Add 500 files
      for (let i = 0; i < 500; i++) {
        largePreset.rules.set(`file-${i}.md`, `# File ${i}\n\nContent`);
      }

      // Create selection with many patterns
      const manyPatterns: PresetSelection = {
        rules: {
          include: [],
          exclude: [],
        },
      };

      // Add 100 include patterns
      for (let i = 0; i < 100; i++) {
        manyPatterns.rules?.include.push(`file-${i * 5}.md`);
      }

      // Add 50 exclude patterns
      for (let i = 0; i < 50; i++) {
        manyPatterns.rules?.exclude?.push(`file-${i * 10}.md`);
      }

      const startTime = performance.now();
      const result = await loader.loadSelective(largePreset, manyPatterns);
      const manyPatternsTime = performance.now() - startTime;

      // Should include 100 files but exclude 50 of them
      expect(result.rules.size).toBe(50);
      expect(manyPatternsTime).toBeLessThan(1000); // Should handle many patterns in under 1 second
    });
  });

  describe("Configuration merging performance", () => {
    it("should handle large configuration with many presets efficiently", () => {
      // Create a large configuration with many presets and selections
      const largeConfig: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: Array.from(
            { length: 100 },
            (_, i) => `github:org/user-preset-${i}`,
          ),
          defaultSelections: {} as Record<string, PresetSelection>,
        },
        project: {
          selections: {} as Record<string, PresetSelection>,
          tools: ["cursor", "claude"],
        },
        local: {
          selections: {} as Record<string, PresetSelection>,
          overrides: {},
        },
      };

      // Add selections for each preset at each level
      for (let i = 0; i < 100; i++) {
        const presetSource = `github:org/preset-${i}`;

        // User level selections
        largeConfig.user?.defaultSelections![presetSource] = {
          rules: { include: ["user-rules/*.md"] },
        };

        // Project level selections (should override user)
        largeConfig.project?.selections![presetSource] = {
          rules: { include: ["project-rules/*.md"] },
          commands: { include: ["commands/*.md"] },
        };

        // Local level selections (should override project)
        if (i < 50) {
          // Only add local selections for half the presets
          largeConfig.local?.selections![presetSource] = {
            rules: { include: ["local-rules/*.md"] },
            commands: { include: ["local-commands/*.md"] },
            mcps: [`mcp-${i}`],
          };
        }
      }

      const startTime = performance.now();
      const merged = merger.mergeConfig(largeConfig);
      const mergeTime = performance.now() - startTime;

      expect(merged.presets).toHaveLength(100);
      expect(Object.keys(merged.selections)).toHaveLength(100);
      expect(mergeTime).toBeLessThan(100); // Should merge in under 100ms

      // Verify priority order (local > project > user)
      for (let i = 0; i < 50; i++) {
        const presetSource = `github:org/preset-${i}`;
        const selection = merged.selections[presetSource];
        expect(selection.rules?.include).toEqual(["local-rules/*.md"]);
        expect(selection.commands?.include).toEqual(["local-commands/*.md"]);
        expect(selection.mcps).toEqual([`mcp-${i}`]);
      }

      for (let i = 50; i < 100; i++) {
        const presetSource = `github:org/preset-${i}`;
        const selection = merged.selections[presetSource];
        expect(selection.rules?.include).toEqual(["project-rules/*.md"]);
        expect(selection.commands?.include).toEqual(["commands/*.md"]);
        expect(selection.mcps).toBeUndefined();
      }
    });
  });

  describe("Memory efficiency", () => {
    it("should not leak memory when processing many presets", async () => {
      // Create many presets and process them sequentially
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        const preset: Preset = {
          source: `github:org/preset-${i}`,
          namespace: "org",
          path: `/cache/org/preset-${i}`,
          commands: new Map(),
          rules: new Map(),
          mcps: {},
        };

        // Add content to each preset
        for (let j = 0; j < 50; j++) {
          preset.rules.set(
            `rule-${j}.md`,
            `# Rule ${j}\n\n${"x".repeat(1000)}`,
          ); // 1KB per rule
          preset.commands.set(
            `command-${j}.md`,
            `# Command ${j}\n\n${"x".repeat(1000)}`,
          ); // 1KB per command
        }

        for (let j = 0; j < 10; j++) {
          preset.mcps[`mcp-${j}`] = {
            command: `mcp-server-${j}`,
            args: [],
          };
        }

        // Process the preset
        const selection: PresetSelection = {
          rules: { include: ["*.md"] },
          commands: { include: ["*.md"] },
          mcps: Object.keys(preset.mcps),
        };

        await loader.loadSelective(preset, selection);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
