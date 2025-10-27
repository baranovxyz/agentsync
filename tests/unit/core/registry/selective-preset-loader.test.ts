/**
 * Tests for SelectivePresetLoader
 */

import { mkdir, readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectivePresetLoader } from "../../../../src/core/registry/selective-preset-loader.js";
import type { Preset, PresetSelection } from "../../../../src/types/index.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../../src/utils/fs.js", () => ({
  pathExists: vi.fn(),
}));

const _mockReadFile = vi.mocked(readFile);
const _mockMkdir = vi.mocked(mkdir);

describe("SelectivePresetLoader", () => {
  let loader: SelectivePresetLoader;
  let mockPreset: Preset;

  beforeEach(() => {
    loader = new SelectivePresetLoader();
    vi.clearAllMocks();

    // Create a mock preset with test data
    mockPreset = {
      source: "github:test/standards",
      namespace: "test",
      path: "/cache/test/standards",
      commands: new Map([
        ["typescript.md", "# TypeScript Commands\n\n- Build: `tsc`"],
        ["python.md", "# Python Commands\n\n- Test: `pytest`"],
        ["docker.md", "# Docker Commands\n\n- Build: `docker build`"],
      ]),
      rules: new Map([
        ["eslint.md", "# ESLint Rules\n\nNo console.log"],
        ["pylint.md", "# Pylint Rules\n\nMax line length: 88"],
        ["security.md", "# Security Rules\n\nNo eval()"],
      ]),
      mcps: {
        "typescript-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
        },
        "python-server": {
          command: "pylsp",
          args: [],
        },
        "docker-server": {
          command: "docker-langserver",
          args: [],
        },
      },
    };
  });

  describe("loadSelective", () => {
    it("should load all content when no selection is provided", async () => {
      const result = await loader.loadSelective(mockPreset);

      expect(result.commands.size).toBe(3);
      expect(result.rules.size).toBe(3);
      expect(Object.keys(result.mcps).length).toBe(3);
    });

    it("should filter rules based on include patterns", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["*.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.rules.size).toBe(3);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(true);
    });

    it("should filter rules based on specific include patterns", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["eslint.md", "security.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(false);
    });

    it("should filter rules based on exclude patterns", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["*.md"],
          exclude: ["security.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(false);
    });

    it("should filter commands based on include patterns", async () => {
      const selection: PresetSelection = {
        commands: {
          include: ["*.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.commands.size).toBe(3);
      expect(result.commands.has("typescript.md")).toBe(true);
      expect(result.commands.has("python.md")).toBe(true);
      expect(result.commands.has("docker.md")).toBe(true);
    });

    it("should filter commands based on specific include patterns", async () => {
      const selection: PresetSelection = {
        commands: {
          include: ["typescript.md", "docker.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.commands.size).toBe(2);
      expect(result.commands.has("typescript.md")).toBe(true);
      expect(result.commands.has("docker.md")).toBe(true);
      expect(result.commands.has("python.md")).toBe(false);
    });

    it("should filter commands based on exclude patterns", async () => {
      const selection: PresetSelection = {
        commands: {
          include: ["*.md"],
          exclude: ["python.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.commands.size).toBe(2);
      expect(result.commands.has("typescript.md")).toBe(true);
      expect(result.commands.has("docker.md")).toBe(true);
      expect(result.commands.has("python.md")).toBe(false);
    });

    it("should filter MCPs based on selection", async () => {
      const selection: PresetSelection = {
        mcps: ["typescript-server", "docker-server"],
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(Object.keys(result.mcps).length).toBe(2);
      expect(result.mcps["typescript-server"]).toBeDefined();
      expect(result.mcps["docker-server"]).toBeDefined();
      expect(result.mcps["python-server"]).toBeUndefined();
    });

    it("should handle empty selections", async () => {
      const selection: PresetSelection = {};

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.commands.size).toBe(0);
      expect(result.rules.size).toBe(0);
      expect(Object.keys(result.mcps).length).toBe(0);
    });

    it("should handle glob patterns correctly", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["*lint.md"],
        },
        commands: {
          include: ["*script.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(false);

      expect(result.commands.size).toBe(1);
      expect(result.commands.has("typescript.md")).toBe(true);
      expect(result.commands.has("python.md")).toBe(false);
      expect(result.commands.has("docker.md")).toBe(false);
    });

    it("should handle complex glob patterns", async () => {
      const selection: PresetSelection = {
        rules: {
          include: ["**/*.md"],
          exclude: ["**/security.md"],
        },
        commands: {
          include: ["**/*{script,ocker}.md"],
        },
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(false);

      expect(result.commands.size).toBe(2);
      expect(result.commands.has("typescript.md")).toBe(true);
      expect(result.commands.has("docker.md")).toBe(true);
      expect(result.commands.has("python.md")).toBe(false);
    });

    it("should handle non-existent MCP names gracefully", async () => {
      const selection: PresetSelection = {
        mcps: ["non-existent-server", "typescript-server"],
      };

      const result = await loader.loadSelective(mockPreset, selection);

      expect(Object.keys(result.mcps).length).toBe(1);
      expect(result.mcps["typescript-server"]).toBeDefined();
      expect(result.mcps["non-existent-server"]).toBeUndefined();
    });

    it("should handle empty preset gracefully", async () => {
      const emptyPreset: Preset = {
        source: "github:test/empty",
        namespace: "test",
        path: "/cache/test/empty",
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
  });

  describe("mergeFilteredPresets", () => {
    it("should merge multiple filtered presets correctly", async () => {
      const preset1: Preset = {
        source: "github:test/preset1",
        namespace: "test1",
        path: "/cache/test/preset1",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- make"],
          ["test.md", "# Test Commands\n\n- make test"],
        ]),
        rules: new Map([["style.md", "# Style Rules\n\nUse 2 spaces"]]),
        mcps: {
          server1: { command: "server1", args: [] },
        },
      };

      const preset2: Preset = {
        source: "github:test/preset2",
        namespace: "test2",
        path: "/cache/test/preset2",
        commands: new Map([
          ["deploy.md", "# Deploy Commands\n\n- make deploy"],
          ["test.md", "# Test Commands v2\n\n- npm test"], // Should override preset1
        ]),
        rules: new Map([
          ["security.md", "# Security Rules\n\nNo eval()"],
          ["style.md", "# Style Rules v2\n\nUse 4 spaces"], // Should override preset1
        ]),
        mcps: {
          server2: { command: "server2", args: [] },
          server1: { command: "server1-v2", args: [] }, // Should override preset1
        },
      };

      const selection1: PresetSelection = {
        commands: { include: ["build.md"] },
        rules: { include: ["style.md"] },
        mcps: ["server1"],
      };

      const selection2: PresetSelection = {
        commands: { include: ["deploy.md", "test.md"] },
        rules: { include: ["security.md", "style.md"] },
        mcps: ["server1", "server2"],
      };

      const filtered1 = await loader.loadSelective(preset1, selection1);
      const filtered2 = await loader.loadSelective(preset2, selection2);

      const merged = loader.mergeFilteredPresets([filtered1, filtered2]);

      // Commands should include all unique files, with preset2 overriding preset1 for test.md
      expect(merged.commands.size).toBe(3);
      expect(merged.commands.has("build.md")).toBe(true);
      expect(merged.commands.has("deploy.md")).toBe(true);
      expect(merged.commands.has("test.md")).toBe(true);
      expect(merged.commands.get("test.md")).toContain("npm test"); // From preset2

      // Rules should include all unique files, with preset2 overriding preset1 for style.md
      expect(merged.rules.size).toBe(2);
      expect(merged.rules.has("style.md")).toBe(true);
      expect(merged.rules.has("security.md")).toBe(true);
      expect(merged.rules.get("style.md")).toContain("4 spaces"); // From preset2

      // MCPs should include all unique servers, with preset2 overriding preset1 for server1
      expect(Object.keys(merged.mcps).length).toBe(2);
      expect(merged.mcps.server1).toBeDefined();
      expect(merged.mcps.server2).toBeDefined();
      expect(merged.mcps.server1.command).toBe("server1-v2"); // From preset2
    });

    it("should handle empty array of filtered presets", () => {
      const merged = loader.mergeFilteredPresets([]);

      expect(merged.commands.size).toBe(0);
      expect(merged.rules.size).toBe(0);
      expect(Object.keys(merged.mcps).length).toBe(0);
    });

    it("should handle single filtered preset", async () => {
      const filtered = await loader.loadSelective(mockPreset, {
        rules: { include: ["eslint.md"] },
      });

      const merged = loader.mergeFilteredPresets([filtered]);

      expect(merged.rules.size).toBe(1);
      expect(merged.rules.has("eslint.md")).toBe(true);
      expect(merged.commands.size).toBe(0);
      expect(Object.keys(merged.mcps).length).toBe(0);
    });
  });

  describe("validateSelection", () => {
    it("should validate selection against preset content", async () => {
      const validSelection: PresetSelection = {
        rules: { include: ["eslint.md"] },
        commands: { include: ["typescript.md"] },
        mcps: ["typescript-server"],
      };

      const result = await loader.validateSelection(mockPreset, validSelection);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should report errors when include patterns match no files", async () => {
      const invalidSelection: PresetSelection = {
        rules: { include: ["non-existent.md"] },
      };

      const result = await loader.validateSelection(
        mockPreset,
        invalidSelection,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle partial validation errors", async () => {
      const partialInvalidSelection: PresetSelection = {
        rules: { include: ["eslint.md"] }, // Valid
        commands: { include: ["missing.md"] }, // Invalid
        mcps: ["typescript-server"], // Valid
      };

      const result = await loader.validateSelection(
        mockPreset,
        partialInvalidSelection,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
