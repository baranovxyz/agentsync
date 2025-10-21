/**
 * Interactive Selection Configuration Merger Tests
 * Tests for merging configurations across the three-level hierarchy
 * and applying file-level selections from presets
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ConfigMerger,
  type MergedConfig,
  type AppliedSelection,
} from "../../../src/core/config/interactive-selection-merger.js";
import type {
  InteractiveSelectionConfig,
  PresetSelection,
  FileSelection,
} from "../../../src/types/schemas.js";
import type { Preset } from "../../../src/types/preset.js";

describe("Interactive Selection Configuration Merger", () => {
  let merger: ConfigMerger;

  beforeEach(() => {
    merger = new ConfigMerger();
  });

  describe("Configuration merging", () => {
    it("merges all three levels with correct priority", () => {
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:company/standards"],
          defaultSelections: {
            "github:company/standards": {
              rules: { include: ["**/*.ts"] },
              commands: { include: ["package.json"] },
            },
          },
        },
        project: {
          selections: {
            "github:company/standards": {
              rules: { include: ["src/**/*.ts"] }, // Override user selection
            },
          },
          tools: ["cursor"],
        },
        local: {
          selections: {
            "github:company/standards": {
              commands: { include: ["scripts/**"] }, // Override project selection
            },
          },
          overrides: {
            mcpServers: { github: { env: { GITHUB_TOKEN: "local" } } },
          },
        },
      };

      const result = merger.mergeConfig(config);

      expect(result.presets).toEqual(["github:company/standards"]);
      expect(result.selections["github:company/standards"]).toEqual({
        rules: { include: ["src/**/*.ts"] }, // From project (overrides user)
        commands: { include: ["scripts/**"] }, // From local (overrides project)
      });
      expect(result.tools).toEqual(["cursor"]);
      expect(result.overrides).toEqual({
        mcpServers: { github: { env: { GITHUB_TOKEN: "local" } } },
      });
    });

    it("handles missing levels gracefully", () => {
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:company/standards"],
        },
      };

      const result = merger.mergeConfig(config);

      expect(result.presets).toEqual(["github:company/standards"]);
      expect(result.selections).toEqual({});
      expect(result.overrides).toEqual({});
      expect(result.tools).toEqual([]);
    });

    it("merges multiple presets correctly", () => {
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:company/standards", "github:team/backend"],
          defaultSelections: {
            "github:company/standards": {
              rules: { include: ["**/*.ts"] },
            },
            "github:team/backend": {
              commands: { include: ["docker-compose.yml"] },
            },
          },
        },
      };

      const result = merger.mergeConfig(config);

      expect(result.presets).toHaveLength(2);
      expect(result.selections["github:company/standards"]).toEqual({
        rules: { include: ["**/*.ts"] },
      });
      expect(result.selections["github:team/backend"]).toEqual({
        commands: { include: ["docker-compose.yml"] },
      });
    });
  });

  describe("File-level selection application", () => {
    it("applies rules selection with include patterns", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map([
          ["src/index.ts", "export class Index {}"],
          ["src/utils.ts", "export function utils() {}"],
          ["test/index.test.ts", "describe('index', () => {})"],
        ]),
        mcps: {},
      };

      const selection: PresetSelection = {
        rules: { include: ["src/**/*.ts"] },
      };

      const result = merger.applySelections(preset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.get("src/index.ts")).toBe("export class Index {}");
      expect(result.rules.get("src/utils.ts")).toBe(
        "export function utils() {}"
      );
      expect(result.rules.has("test/index.test.ts")).toBe(false);
    });

    it("applies rules selection with include and exclude patterns", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map([
          ["src/index.ts", "export class Index {}"],
          ["src/utils.ts", "export function utils() {}"],
          ["src/test/helper.ts", "export function helper() {}"],
        ]),
        mcps: {},
      };

      const selection: PresetSelection = {
        rules: {
          include: ["src/**/*.ts"],
          exclude: ["src/test/**"],
        },
      };

      const result = merger.applySelections(preset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.get("src/index.ts")).toBe("export class Index {}");
      expect(result.rules.get("src/utils.ts")).toBe(
        "export function utils() {}"
      );
      expect(result.rules.has("src/test/helper.ts")).toBe(false);
    });

    it("applies commands selection", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map([
          ["package.json", '{"name": "test"}'],
          ["scripts/build.sh", "#!/bin/bash\necho 'building'"],
          ["README.md", "# Project"],
        ]),
        rules: new Map(),
        mcps: {},
      };

      const selection: PresetSelection = {
        commands: { include: ["package.json", "scripts/**"] },
      };

      const result = merger.applySelections(preset, selection);

      expect(result.commands.size).toBe(2);
      expect(result.commands.get("package.json")).toBe('{"name": "test"}');
      expect(result.commands.get("scripts/build.sh")).toBe(
        "#!/bin/bash\necho 'building'"
      );
    });

    it("applies MCPs selection", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
          postgres: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-postgres"],
          },
          linear: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-linear"],
          },
        },
      };

      const selection: PresetSelection = {
        mcps: ["github", "linear"],
      };

      const result = merger.applySelections(preset, selection);

      expect(Object.keys(result.mcps)).toHaveLength(2);
      expect(result.mcps.github).toBeDefined();
      expect(result.mcps.linear).toBeDefined();
      expect(result.mcps.postgres).toBeUndefined();
    });

    it("handles empty selection gracefully", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map([["package.json", '{"name": "test"}']]),
        rules: new Map([["src/index.ts", "export class Index {}"]]),
        mcps: { github: { command: "npx", args: [] } },
      };

      const selection: PresetSelection = {};

      const result = merger.applySelections(preset, selection);

      expect(result.commands.size).toBe(0);
      expect(result.rules.size).toBe(0);
      expect(Object.keys(result.mcps)).toHaveLength(0);
    });

    it("handles missing preset content gracefully", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      const selection: PresetSelection = {
        rules: { include: ["**/*.ts"] },
        commands: { include: ["package.json"] },
        mcps: ["github"],
      };

      const result = merger.applySelections(preset, selection);

      expect(result.rules.size).toBe(0);
      expect(result.commands.size).toBe(0);
      expect(Object.keys(result.mcps)).toHaveLength(0);
    });
  });

  describe("Pattern matching", () => {
    it("matches simple glob patterns", () => {
      const testCases = [
        ["src/index.ts", "src/**/*.ts", true],
        ["src/utils/helper.ts", "src/**/*.ts", true],
        ["test/index.test.ts", "src/**/*.ts", false],
        ["src/index.js", "src/**/*.ts", false],
        ["package.json", "*.json", true],
        ["src/package.json", "*.json", false],
        ["src/index.ts", "**/*.ts", true],
        ["src/test/index.test.ts", "**/*.test.ts", true],
      ];

      testCases.forEach(([filename, pattern, expected]) => {
        const matches = (merger as any).simpleGlobMatch(filename, pattern);
        expect(matches).toBe(expected);
      });
    });

    it("handles exclude patterns correctly", () => {
      const testCases = [
        ["src/index.ts", ["src/**/*.ts"], ["src/test/**"], true],
        ["src/test/helper.ts", ["src/**/*.ts"], ["src/test/**"], false],
        ["src/utils/index.ts", ["src/**/*.ts"], ["src/test/**"], true],
        ["src/test/utils/helper.ts", ["src/**/*.ts"], ["src/test/**"], false],
      ];

      testCases.forEach(([filename, include, exclude, expected]) => {
        const fileSelection: FileSelection = {
          include: include as string[],
          exclude: exclude as string[],
        };
        const matches = (merger as any).matchesPattern(filename, fileSelection);
        expect(matches).toBe(expected);
      });
    });
  });

  describe("MCP validation", () => {
    it("validates MCP selection successfully", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {
          github: { command: "npx", args: [] },
          postgres: { command: "npx", args: [] },
        },
      };

      const selection: PresetSelection = {
        mcps: ["github", "postgres"],
      };

      const result = merger.validateMCPSelection(preset, selection);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects missing MCPs", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/tmp/preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {
          github: { command: "npx", args: [] },
        },
      };

      const selection: PresetSelection = {
        mcps: ["github", "postgres", "linear"],
      };

      const result = merger.validateMCPSelection(preset, selection);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("postgres");
      expect(result.errors[1]).toContain("linear");
    });
  });

  describe("Utility methods", () => {
    it("gets effective selection for preset", () => {
      const mergedConfig: MergedConfig = {
        presets: ["github:company/standards"],
        selections: {
          "github:company/standards": {
            rules: { include: ["**/*.ts"] },
          },
        },
        overrides: {},
        tools: [],
      };

      const selection = merger.getEffectiveSelection(
        "github:company/standards",
        mergedConfig
      );

      expect(selection).toEqual({
        rules: { include: ["**/*.ts"] },
      });
    });

    it("checks if preset has selections", () => {
      const mergedConfig: MergedConfig = {
        presets: ["github:company/standards", "github:team/backend"],
        selections: {
          "github:company/standards": {
            rules: { include: ["**/*.ts"] },
          },
          "github:team/backend": {},
        },
        overrides: {},
        tools: [],
      };

      expect(
        merger.hasSelections("github:company/standards", mergedConfig)
      ).toBe(true);
      expect(merger.hasSelections("github:team/backend", mergedConfig)).toBe(
        false
      );
      expect(merger.hasSelections("github:nonexistent", mergedConfig)).toBe(
        false
      );
    });

    it("gets presets with selections", () => {
      const mergedConfig: MergedConfig = {
        presets: [
          "github:company/standards",
          "github:team/backend",
          "github:team/frontend",
        ],
        selections: {
          "github:company/standards": {
            rules: { include: ["**/*.ts"] },
          },
          "github:team/backend": {},
          "github:team/frontend": {
            commands: { include: ["package.json"] },
          },
        },
        overrides: {},
        tools: [],
      };

      const presetsWithSelections =
        merger.getPresetsWithSelections(mergedConfig);

      expect(presetsWithSelections).toEqual([
        "github:company/standards",
        "github:team/frontend",
      ]);
    });

    it("merges applied selections", () => {
      const appliedSelections: AppliedSelection[] = [
        {
          commands: new Map([["package.json", '{"name": "app1"}']]),
          rules: new Map([["src/index.ts", "export class Index1 {}"]]),
          mcps: { github: { command: "npx", args: [] } },
        },
        {
          commands: new Map([["scripts/build.sh", "#!/bin/bash"]]),
          rules: new Map([["src/utils.ts", "export function utils() {}"]]),
          mcps: { postgres: { command: "npx", args: [] } },
        },
      ];

      const merged = merger.mergeAppliedSelections(appliedSelections);

      expect(merged.commands.size).toBe(2);
      expect(merged.commands.get("package.json")).toBe('{"name": "app1"}');
      expect(merged.commands.get("scripts/build.sh")).toBe("#!/bin/bash");

      expect(merged.rules.size).toBe(2);
      expect(merged.rules.get("src/index.ts")).toBe("export class Index1 {}");
      expect(merged.rules.get("src/utils.ts")).toBe(
        "export function utils() {}"
      );

      expect(Object.keys(merged.mcps)).toHaveLength(2);
      expect(merged.mcps.github).toBeDefined();
      expect(merged.mcps.postgres).toBeDefined();
    });
  });
});
