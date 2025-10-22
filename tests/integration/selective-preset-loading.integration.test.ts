/**
 * Integration tests for selective preset loading
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RegistryOrchestrator } from "../../src/core/registry/registry-orchestrator.js";
import { SelectivePresetLoader } from "../../src/core/registry/selective-preset-loader.js";
import { GitHubResolver } from "../../src/core/registry/github-resolver.js";
import { PresetLoader } from "../../src/core/registry/preset-loader.js";
import { sync } from "../../src/commands/sync.js";
import type { SelectionConfig } from "../../src/types/index.js";
import * as fs from "node:fs/promises";
import * as path from "path";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "os";
import * as fsUtils from "../../src/utils/fs.js";

// Mock dependencies
vi.mock("../../src/core/registry/github-resolver.js");
vi.mock("../../src/core/registry/preset-loader.js");
vi.mock("../../src/core/registry/selective-preset-loader.js");

describe("Selective Preset Loading Integration", () => {
  let tempDir: string;
  let orchestrator: RegistryOrchestrator;
  let selectiveLoader: SelectivePresetLoader;
  let mockGitHubResolver: any;
  let mockPresetLoader: any;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

    // Create mock instances
    mockGitHubResolver = {
      resolve: vi.fn(),
    };
    mockPresetLoader = {
      load: vi.fn(),
    };
    selectiveLoader = {
      load: vi.fn(),
      loadSelective: vi.fn(),
      validateSelection: vi.fn(),
      mergeFilteredPresets: vi.fn(),
      mergeFilteredPresetsWithNamespaces: vi.fn(),
    } as any;

    // Mock constructors
    vi.mocked(GitHubResolver).mockImplementation(() => mockGitHubResolver);
    vi.mocked(PresetLoader).mockImplementation(() => mockPresetLoader);
    vi.mocked(SelectivePresetLoader).mockImplementation(() => selectiveLoader);

    orchestrator = new RegistryOrchestrator();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("RegistryOrchestrator selective loading", () => {
    beforeEach(async () => {
      // Create .agentsync directory and config
      const agentsyncDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(agentsyncDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: ["github:test/standards", "github:test/tools"],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(agentsyncDir, "config.json"),
        JSON.stringify(config, null, 2)
      );
    });

    it("should load all presets when no selections provided", async () => {
      // Mock the GitHub resolver and preset loader
      const mockPreset1 = {
        source: "github:test/standards",
        namespace: "test",
        path: "/cache/test/standards",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- make"],
          ["test.md", "# Test Commands\n\n- make test"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["style.md", "# Style Rules\n\nUse 2 spaces"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
        },
      };

      const mockPreset2 = {
        source: "github:test/tools",
        namespace: "test",
        path: "/cache/test/tools",
        commands: new Map([
          ["deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([["security.md", "# Security Rules\n\nNo eval()"]]),
        mcps: {
          "security-server": { command: "security", args: [] },
        },
      };

      // Mock the orchestrator methods
      vi.spyOn(orchestrator as any, "loadAndMergeSelective").mockResolvedValue({
        commands: new Map([...mockPreset1.commands, ...mockPreset2.commands]),
        rules: new Map([...mockPreset1.rules, ...mockPreset2.rules]),
        mcps: {
          ...mockPreset1.mcps,
          ...mockPreset2.mcps,
        },
      });

      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      expect(result.commands.size).toBe(3);
      expect(result.rules.size).toBe(3);
      expect(Object.keys(result.mcps).length).toBe(2);
    });

    it("should apply selective filtering when selections provided", async () => {
      const selections: Record<string, SelectionConfig> = {
        "github:test/standards": {
          commands: { include: ["build.md"] },
          rules: { include: ["eslint.md"] },
          mcps: ["eslint-server"],
        },
        "github:test/tools": {
          commands: { include: ["deploy.md"] },
          rules: { include: ["security.md"] },
          mcps: ["security-server"],
        },
      };

      // Mock the selective loader with namespaced results
      const mockFiltered1 = {
        commands: new Map([["test:build.md", "# Build Commands\n\n- make"]]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules\n\nNo console.log"],
        ]),
        mcps: { "eslint-server": { command: "eslint", args: [] } },
      };

      const mockFiltered2 = {
        commands: new Map([
          ["test:deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([["test:security.md", "# Security Rules\n\nNo eval()"]]),
        mcps: { "security-server": { command: "security", args: [] } },
      };

      vi.spyOn(selectiveLoader, "load").mockResolvedValue({
        commands: new Map([
          ["test:build.md", "# Build Commands\n\n- make"],
          ["test:deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["test:security.md", "# Security Rules\n\nNo eval()"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "security-server": { command: "security", args: [] },
        },
      });

      const result = await orchestrator.loadAndMergeSelective(
        tempDir,
        selections
      );

      expect(result.commands.size).toBe(2);
      expect(result.rules.size).toBe(2);
      expect(Object.keys(result.mcps).length).toBe(2);

      // Verify namespaced keys
      expect(result.commands.has("test:build.md")).toBe(true);
      expect(result.commands.has("test:deploy.md")).toBe(true);
      expect(result.rules.has("test:eslint.md")).toBe(true);
      expect(result.rules.has("test:security.md")).toBe(true);
    });

    it("should validate selections and report errors", async () => {
      const selections: Record<string, SelectionConfig> = {
        "github:test/standards": {
          commands: { include: ["non-existent.md"] },
          rules: { include: ["missing.md"] },
          mcps: ["non-existent-server"],
        },
      };

      // Mock validation to return errors
      vi.spyOn(selectiveLoader, "validateSelection").mockResolvedValue({
        valid: false,
        errors: [
          "Command file 'non-existent.md' not found in preset 'github:test/standards'",
          "Rule file 'missing.md' not found in preset 'github:test/standards'",
          "MCP server 'non-existent-server' not found in preset 'github:test/standards'",
        ],
      });

      const result = await orchestrator.validateSelections(tempDir, selections);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain(
        "Command file 'non-existent.md' not found in preset 'github:test/standards'"
      );
    });

    it("should handle empty selections gracefully", async () => {
      const selections: Record<string, SelectionConfig> = {};

      // Mock to return empty result
      vi.spyOn(orchestrator as any, "loadAndMergeSelective").mockResolvedValue({
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      });

      const result = await orchestrator.loadAndMergeSelective(
        tempDir,
        selections
      );

      expect(result.commands.size).toBe(0);
      expect(result.rules.size).toBe(0);
      expect(Object.keys(result.mcps).length).toBe(0);
    });
  });

  describe("SelectivePresetLoader end-to-end", () => {
    it("should handle complex filtering scenarios", async () => {
      // Use real SelectivePresetLoader for this test
      const realSelectiveLoader = new SelectivePresetLoader();
      const preset = {
        source: "github:test/complex",
        namespace: "test",
        path: "/cache/test/complex",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
          ["deploy.md", "# Deploy Commands"],
          ["lint.md", "# Lint Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["pylint.md", "# Pylint Rules"],
          ["security.md", "# Security Rules"],
          ["style.md", "# Style Rules"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "pylsp-server": { command: "pylsp", args: [] },
          "security-server": { command: "security", args: [] },
        },
      };

      const selection: SelectionConfig = {
        commands: {
          include: ["*.md"],
          exclude: ["deploy.md"],
        },
        rules: {
          include: ["*lint.md", "security.md"],
        },
        mcps: ["eslint-server", "security-server"],
      };

      const result = await realSelectiveLoader.loadSelective(preset, selection);

      // Should include build, test, lint commands (exclude deploy)
      expect(result.commands.size).toBe(3);
      expect(result.commands.has("build.md")).toBe(true);
      expect(result.commands.has("test.md")).toBe(true);
      expect(result.commands.has("lint.md")).toBe(true);
      expect(result.commands.has("deploy.md")).toBe(false);

      // Should include eslint, pylint, security rules
      expect(result.rules.size).toBe(3);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("pylint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(true);
      expect(result.rules.has("style.md")).toBe(false);

      // Should include only selected MCPs
      expect(Object.keys(result.mcps).length).toBe(2);
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["security-server"]).toBeDefined();
      expect(result.mcps["pylsp-server"]).toBeUndefined();
    });

    it("should merge multiple filtered presets correctly", async () => {
      // Use real SelectivePresetLoader for this test
      const realSelectiveLoader = new SelectivePresetLoader();
      const preset1 = {
        source: "github:test/preset1",
        namespace: "test1",
        path: "/cache/test/preset1",
        commands: new Map([
          ["build.md", "# Build Commands v1"],
          ["test.md", "# Test Commands v1"],
        ]),
        rules: new Map([["eslint.md", "# ESLint Rules v1"]]),
        mcps: {
          "eslint-server": { command: "eslint-v1", args: [] },
        },
      };

      const preset2 = {
        source: "github:test/preset2",
        namespace: "test2",
        path: "/cache/test/preset2",
        commands: new Map([
          ["deploy.md", "# Deploy Commands v2"],
          ["test.md", "# Test Commands v2"], // Should override preset1
        ]),
        rules: new Map([
          ["security.md", "# Security Rules v2"],
          ["eslint.md", "# ESLint Rules v2"], // Should override preset1
        ]),
        mcps: {
          "security-server": { command: "security-v2", args: [] },
          "eslint-server": { command: "eslint-v2", args: [] }, // Should override preset1
        },
      };

      const selection1: SelectionConfig = {
        commands: { include: ["build.md", "test.md"] },
        rules: { include: ["eslint.md"] },
        mcps: ["eslint-server"],
      };

      const selection2: SelectionConfig = {
        commands: { include: ["deploy.md", "test.md"] },
        rules: { include: ["security.md", "eslint.md"] },
        mcps: ["eslint-server", "security-server"],
      };

      const filtered1 = await realSelectiveLoader.loadSelective(
        preset1,
        selection1
      );
      const filtered2 = await realSelectiveLoader.loadSelective(
        preset2,
        selection2
      );

      const merged = realSelectiveLoader.mergeFilteredPresets([
        filtered1,
        filtered2,
      ]);

      // Commands should include all unique files, with preset2 overriding preset1 for test.md
      expect(merged.commands.size).toBe(3);
      expect(merged.commands.has("build.md")).toBe(true);
      expect(merged.commands.has("deploy.md")).toBe(true);
      expect(merged.commands.has("test.md")).toBe(true);
      expect(merged.commands.get("test.md")).toContain("v2"); // From preset2

      // Rules should include all unique files, with preset2 overriding preset1 for eslint.md
      expect(merged.rules.size).toBe(2);
      expect(merged.rules.has("eslint.md")).toBe(true);
      expect(merged.rules.has("security.md")).toBe(true);
      expect(merged.rules.get("eslint.md")).toContain("v2"); // From preset2

      // MCPs should include all unique servers, with preset2 overriding preset1 for eslint-server
      expect(Object.keys(merged.mcps).length).toBe(2);
      expect(merged.mcps["eslint-server"]).toBeDefined();
      expect(merged.mcps["security-server"]).toBeDefined();
      expect(merged.mcps["eslint-server"].command).toBe("eslint-v2"); // From preset2
    });
  });
});

describe("End-to-End Selective Loading Integration", () => {
  let tempDir: string;
  let selectiveLoader: any;
  let mockGitHubResolver: any;
  let mockPresetLoader: any;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-e2e-test-"));

    // Create mock instances
    mockGitHubResolver = {
      resolve: vi.fn(),
    };
    mockPresetLoader = {
      load: vi.fn(),
    };

    // Mock constructors
    vi.mocked(GitHubResolver).mockImplementation(() => mockGitHubResolver);
    vi.mocked(PresetLoader).mockImplementation(() => mockPresetLoader);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Config-based Selective Loading", () => {
    it("should load presets with select criteria from config", async () => {
      // Setup config with new extends format
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/standards",
            select: {
              rules: { include: ["eslint.md", "style.md"] },
              commands: { include: ["build.md"] },
              mcps: ["eslint-server"],
            },
          },
          {
            source: "github:test/tools",
            select: {
              rules: { include: ["security.md"] },
              commands: { include: ["deploy.md", "test.md"] },
              mcps: ["security-server"],
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved paths
      mockGitHubResolver.resolve
        .mockResolvedValueOnce("/cache/test/standards")
        .mockResolvedValueOnce("/cache/test/tools");

      // Mock preset data
      const mockPreset1 = {
        source: "github:test/standards",
        namespace: "test",
        path: "/cache/test/standards",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- make build"],
          ["test.md", "# Test Commands\n\n- make test"],
          ["deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["test:style.md", "# Style Rules\n\nUse 2 spaces"],
          ["test:security.md", "# Security Rules\n\nNo eval()"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "style-server": { command: "stylelint", args: [] },
        },
      };

      const mockPreset2 = {
        source: "github:test/tools",
        namespace: "test",
        path: "/cache/test/tools",
        commands: new Map([
          ["deploy.md", "# Deploy Commands\n\n- kubectl apply"],
          ["test.md", "# Test Commands\n\n- npm test"],
          ["lint.md", "# Lint Commands\n\n- eslint"],
        ]),
        rules: new Map([
          ["test:security.md", "# Security Rules\n\nNo secrets"],
          ["test:performance.md", "# Performance Rules\n\nOptimize loops"],
        ]),
        mcps: {
          "security-server": { command: "security", args: [] },
          "perf-server": { command: "perf", args: [] },
        },
      };

      mockPresetLoader.load
        .mockResolvedValueOnce(mockPreset1)
        .mockResolvedValueOnce(mockPreset2);

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      // Verify selective loading worked
      expect(result.commands.size).toBe(3); // build.md, deploy.md, test.md
      expect(result.commands.has("build.md")).toBe(true);
      expect(result.commands.has("deploy.md")).toBe(true);
      expect(result.commands.has("test.md")).toBe(true);
      expect(result.commands.has("lint.md")).toBe(false); // Not selected

      expect(result.rules.size).toBe(3); // test:eslint.md, test:style.md, test:security.md
      expect(result.rules.has("test:eslint.md")).toBe(true);
      expect(result.rules.has("test:style.md")).toBe(true);
      expect(result.rules.has("test:security.md")).toBe(true);
      expect(result.rules.has("test:performance.md")).toBe(false); // Not selected

      expect(Object.keys(result.mcps).length).toBe(2); // eslint-server, security-server
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["security-server"]).toBeDefined();
      expect(result.mcps["style-server"]).toBeUndefined(); // Not selected
      expect(result.mcps["perf-server"]).toBeUndefined(); // Not selected
    });

    it("should handle mixed extends format (string and object)", async () => {
      // Setup config with mixed extends format
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          "github:test/full-preset", // No selection - load all
          {
            source: "github:test/partial-preset",
            select: {
              rules: { include: ["eslint.md"] },
              commands: { include: ["build.md"] },
            },
          },
        ],
        tools: ["cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved paths
      mockGitHubResolver.resolve
        .mockResolvedValueOnce("/cache/test/full-preset")
        .mockResolvedValueOnce("/cache/test/partial-preset");

      // Mock preset data
      const mockFullPreset = {
        source: "github:test/full-preset",
        namespace: "test",
        path: "/cache/test/full-preset",
        commands: new Map([
          ["build.md", "# Build Commands Full"],
          ["test.md", "# Test Commands Full"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules Full"],
          ["style.md", "# Style Rules Full"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint-full", args: [] },
        },
      };

      const mockPartialPreset = {
        source: "github:test/partial-preset",
        namespace: "test",
        path: "/cache/test/partial-preset",
        commands: new Map([
          ["build.md", "# Build Commands Partial"],
          ["deploy.md", "# Deploy Commands Partial"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules Partial"],
          ["security.md", "# Security Rules Partial"],
        ]),
        mcps: {
          "security-server": { command: "security-partial", args: [] },
        },
      };

      mockPresetLoader.load
        .mockResolvedValueOnce(mockFullPreset)
        .mockResolvedValueOnce(mockPartialPreset);

      // Create a real SelectivePresetLoader and mock its load method
      const mockSelectiveLoader = new SelectivePresetLoader();
      vi.spyOn(mockSelectiveLoader, "load").mockResolvedValue({
        commands: new Map([
          ["test:build.md", "# Build Commands Partial"], // From partial with selection
          ["test:test.md", "# Test Commands Full"], // From full (no selection)
          ["test:deploy.md", "# Deploy Commands Partial"], // From partial with selection
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules Partial"], // From partial with selection
          ["test:style.md", "# Style Rules Full"], // From full (no selection)
          ["test:security.md", "# Security Rules Partial"], // From partial with selection
        ]),
        mcps: {
          "eslint-server": { command: "eslint-full", args: [] }, // From full (no selection)
          "security-server": { command: "security-partial", args: [] }, // From partial with selection
        },
      });

      vi.mocked(SelectivePresetLoader).mockImplementation(
        () => mockSelectiveLoader
      );

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      // Verify mixed loading worked
      expect(result.commands.size).toBe(3); // build.md (from partial), test.md, deploy.md
      expect(result.commands.has("test:build.md")).toBe(true);
      expect(result.commands.has("test:test.md")).toBe(true);
      expect(result.commands.has("test:deploy.md")).toBe(true);

      expect(result.rules.size).toBe(3); // eslint.md (from partial), style.md, security.md
      expect(result.rules.has("test:eslint.md")).toBe(true);
      expect(result.rules.has("test:style.md")).toBe(true);
      expect(result.rules.has("test:security.md")).toBe(true);

      expect(Object.keys(result.mcps).length).toBe(2); // Both servers
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["security-server"]).toBeDefined();
    });
  });

  describe("Complex Filtering Scenarios", () => {
    it("should handle complex include/exclude patterns", async () => {
      // Setup config with complex patterns
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/complex-preset",
            select: {
              rules: {
                include: ["**/*.md"],
                exclude: ["**/security.md", "**/temp-*.md"],
              },
              commands: {
                include: ["*{uild,est}.md", "deploy*.md"],
                exclude: ["*temp*.md"],
              },
              mcps: ["*server", "!temp-server"],
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue(
        "/cache/test/complex-preset"
      );

      // Mock complex preset data
      const mockComplexPreset = {
        source: "github:test/complex-preset",
        namespace: "test",
        path: "/cache/test/complex-preset",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
          ["deploy.md", "# Deploy Commands"],
          ["deploy-prod.md", "# Deploy Prod Commands"],
          ["temp-build.md", "# Temp Build Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["style.md", "# Style Rules"],
          ["security.md", "# Security Rules"],
          ["temp-eslint.md", "# Temp ESLint Rules"],
          ["subdir/format.md", "# Format Rules"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "style-server": { command: "stylelint", args: [] },
          "security-server": { command: "security", args: [] },
          "temp-server": { command: "temp", args: [] },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockComplexPreset);

      // Create a real SelectivePresetLoader and mock its load method
      const mockSelectiveLoader = new SelectivePresetLoader();
      vi.spyOn(mockSelectiveLoader, "load").mockResolvedValue({
        commands: new Map([
          ["test:build.md", "# Build Commands"], // Included by pattern
          ["test:test.md", "# Test Commands"], // Included by pattern
          ["test:deploy.md", "# Deploy Commands"], // Included by pattern
          ["test:deploy-prod.md", "# Deploy Prod Commands"], // Included by pattern
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules"], // Included by pattern
          ["test:style.md", "# Style Rules"], // Included by pattern
          ["test:subdir/format.md", "# Format Rules"], // Included by pattern
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] }, // Selected by pattern
          "style-server": { command: "stylelint", args: [] }, // Selected by pattern
          "security-server": { command: "security", args: [] }, // Selected by pattern
        },
      });

      vi.mocked(SelectivePresetLoader).mockImplementation(
        () => mockSelectiveLoader
      );

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      // Verify complex filtering worked
      expect(result.commands.size).toBe(4); // build.md, test.md, deploy.md, deploy-prod.md
      expect(result.commands.has("test:build.md")).toBe(true);
      expect(result.commands.has("test:test.md")).toBe(true);
      expect(result.commands.has("test:deploy.md")).toBe(true);
      expect(result.commands.has("test:deploy-prod.md")).toBe(true);
      expect(result.commands.has("test:temp-build.md")).toBe(false); // Excluded

      expect(result.rules.size).toBe(3); // eslint.md, style.md, subdir/format.md
      expect(result.rules.has("test:eslint.md")).toBe(true);
      expect(result.rules.has("test:style.md")).toBe(true);
      expect(result.rules.has("test:security.md")).toBe(false); // Excluded
      expect(result.rules.has("test:temp-eslint.md")).toBe(false); // Excluded
      expect(result.rules.has("test:subdir/format.md")).toBe(true);

      expect(Object.keys(result.mcps).length).toBe(3); // eslint-server, style-server, security-server
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["style-server"]).toBeDefined();
      expect(result.mcps["security-server"]).toBeDefined();
      expect(result.mcps["temp-server"]).toBeUndefined(); // Excluded
    });

    it("should handle glob patterns with directories", async () => {
      // Setup config with directory patterns
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/nested-preset",
            select: {
              rules: {
                include: ["frontend/**/*.md", "backend/**/*.md"],
                exclude: ["frontend/**/temp-*.md"],
              },
              commands: {
                include: ["scripts/**/*.md"],
              },
            },
          },
        ],
        tools: ["cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/nested-preset");

      // Mock nested preset data
      const mockNestedPreset = {
        source: "github:test/nested-preset",
        namespace: "test",
        path: "/cache/test/nested-preset",
        commands: new Map([
          ["scripts/build.md", "# Build Script"],
          ["scripts/test.md", "# Test Script"],
          ["scripts/deploy.md", "# Deploy Script"],
          ["docs/readme.md", "# Documentation"],
        ]),
        rules: new Map([
          ["frontend/eslint.md", "# Frontend ESLint"],
          ["frontend/style.md", "# Frontend Style"],
          ["frontend/temp-rules.md", "# Frontend Temp Rules"],
          ["backend/security.md", "# Backend Security"],
          ["backend/performance.md", "# Backend Performance"],
          ["shared/common.md", "# Shared Rules"],
        ]),
        mcps: {},
      };

      mockPresetLoader.load.mockResolvedValue(mockNestedPreset);

      // Create a real SelectivePresetLoader and mock its load method
      const mockSelectiveLoader = new SelectivePresetLoader();
      vi.spyOn(mockSelectiveLoader, "load").mockResolvedValue({
        commands: new Map([
          ["test:scripts/build.md", "# Build Script"], // Included by pattern
          ["test:scripts/test.md", "# Test Script"], // Included by pattern
          ["test:scripts/deploy.md", "# Deploy Script"], // Included by pattern
        ]),
        rules: new Map([
          ["test:frontend/eslint.md", "# Frontend ESLint"], // Included by pattern
          ["test:frontend/style.md", "# Frontend Style"], // Included by pattern
          ["test:backend/security.md", "# Backend Security"], // Included by pattern
          ["test:backend/performance.md", "# Backend Performance"], // Included by pattern
        ]),
        mcps: {},
      });

      vi.mocked(SelectivePresetLoader).mockImplementation(
        () => mockSelectiveLoader
      );

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      // Verify directory patterns worked
      expect(result.commands.size).toBe(3); // All scripts
      expect(result.commands.has("test:scripts/build.md")).toBe(true);
      expect(result.commands.has("test:scripts/test.md")).toBe(true);
      expect(result.commands.has("test:scripts/deploy.md")).toBe(true);
      expect(result.commands.has("test:docs/readme.md")).toBe(false); // Not in scripts

      expect(result.rules.size).toBe(4); // frontend (except temp), backend
      expect(result.rules.has("test:frontend/eslint.md")).toBe(true);
      expect(result.rules.has("test:frontend/style.md")).toBe(true);
      expect(result.rules.has("test:frontend/temp-rules.md")).toBe(false); // Excluded
      expect(result.rules.has("test:backend/security.md")).toBe(true);
      expect(result.rules.has("test:backend/performance.md")).toBe(true);
      expect(result.rules.has("test:shared/common.md")).toBe(false); // Not in frontend/backend
    });
  });

  describe("MCP Server Selection", () => {
    it("should selectively load MCP servers", async () => {
      // Setup config with MCP selection
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/mcp-preset",
            select: {
              mcps: ["eslint-server", "typescript-server"],
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/mcp-preset");

      // Mock MCP preset data
      const mockMcpPreset = {
        source: "github:test/mcp-preset",
        namespace: "test",
        path: "/cache/test/mcp-preset",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["typescript.md", "# TypeScript Rules"],
        ]),
        mcps: {
          "eslint-server": {
            command: "eslint",
            args: ["--stdio"],
            env: { NODE_ENV: "production" },
          },
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
            args: ["--stdio"],
          },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockMcpPreset);

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {
        "github:test/mcp-preset": {
          mcps: ["eslint-server", "typescript-server"],
        },
      });

      // Verify MCP selection worked
      expect(Object.keys(result.mcps).length).toBe(2);
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["typescript-server"]).toBeDefined();
      expect(result.mcps["python-server"]).toBeUndefined();
      expect(result.mcps["docker-server"]).toBeUndefined();

      // Verify MCP configuration is preserved
      expect(result.mcps["eslint-server"]).toEqual({
        command: "eslint",
        args: ["--stdio"],
        env: { NODE_ENV: "production" },
      });
      expect(result.mcps["typescript-server"]).toEqual({
        command: "typescript-language-server",
        args: ["--stdio"],
      });
    });

    it("should handle non-existent MCP servers gracefully", async () => {
      // Setup config with non-existent MCP
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/mcp-preset",
            select: {
              mcps: ["non-existent-server", "eslint-server"],
            },
          },
        ],
        tools: ["cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/mcp-preset");

      // Mock MCP preset data
      const mockMcpPreset = {
        source: "github:test/mcp-preset",
        namespace: "test",
        path: "/cache/test/mcp-preset",
        commands: new Map(),
        rules: new Map(),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockMcpPreset);

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {
        "github:test/mcp-preset": {
          mcps: ["non-existent-server", "eslint-server"],
        },
      });

      // Verify only existing MCP is loaded
      expect(Object.keys(result.mcps).length).toBe(1);
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["non-existent-server"]).toBeUndefined();
    });
  });

  describe("Multiple Presets with Different Selections", () => {
    it("should handle multiple presets with different selection criteria", async () => {
      // Setup config with multiple presets
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/frontend-preset",
            select: {
              rules: { include: ["eslint.md", "style.md"] },
              commands: { include: ["build.md", "test.md"] },
              mcps: ["eslint-server"],
            },
          },
          {
            source: "github:test/backend-preset",
            select: {
              rules: { include: ["security.md", "performance.md"] },
              commands: { include: ["deploy.md", "migrate.md"] },
              mcps: ["security-server"],
            },
          },
          {
            source: "github:test/shared-preset",
            select: {
              rules: { include: ["common.md"] },
              commands: { include: ["lint.md"] },
            },
          },
        ],
        tools: ["claude", "cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved paths
      mockGitHubResolver.resolve
        .mockResolvedValueOnce("/cache/test/frontend-preset")
        .mockResolvedValueOnce("/cache/test/backend-preset")
        .mockResolvedValueOnce("/cache/test/shared-preset");

      // Mock preset data
      const mockFrontendPreset = {
        source: "github:test/frontend-preset",
        namespace: "frontend",
        path: "/cache/test/frontend-preset",
        commands: new Map([
          ["build.md", "# Frontend Build"],
          ["test.md", "# Frontend Test"],
          ["serve.md", "# Frontend Serve"],
        ]),
        rules: new Map([
          ["frontend:eslint.md", "# Frontend ESLint"],
          ["frontend:style.md", "# Frontend Style"],
          ["frontend:accessibility.md", "# Frontend Accessibility"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "style-server": { command: "stylelint", args: [] },
        },
      };

      const mockBackendPreset = {
        source: "github:test/backend-preset",
        namespace: "backend",
        path: "/cache/test/backend-preset",
        commands: new Map([
          ["deploy.md", "# Backend Deploy"],
          ["migrate.md", "# Backend Migrate"],
          ["seed.md", "# Backend Seed"],
        ]),
        rules: new Map([
          ["backend:security.md", "# Backend Security"],
          ["backend:performance.md", "# Backend Performance"],
          ["backend:logging.md", "# Backend Logging"],
        ]),
        mcps: {
          "security-server": { command: "security", args: [] },
          "perf-server": { command: "perf", args: [] },
        },
      };

      const mockSharedPreset = {
        source: "github:test/shared-preset",
        namespace: "shared",
        path: "/cache/test/shared-preset",
        commands: new Map([
          ["lint.md", "# Shared Lint"],
          ["format.md", "# Shared Format"],
        ]),
        rules: new Map([
          ["shared:common.md", "# Shared Common"],
          ["shared:git.md", "# Shared Git"],
        ]),
        mcps: {},
      };

      mockPresetLoader.load
        .mockResolvedValueOnce(mockFrontendPreset)
        .mockResolvedValueOnce(mockBackendPreset)
        .mockResolvedValueOnce(mockSharedPreset);

      // Create a real SelectivePresetLoader and mock its load method
      const mockSelectiveLoader = new SelectivePresetLoader();
      vi.spyOn(mockSelectiveLoader, "load").mockResolvedValue({
        commands: new Map([
          ["frontend:build.md", "# Frontend Build"], // Selected from frontend
          ["frontend:test.md", "# Frontend Test"], // Selected from frontend
          ["backend:deploy.md", "# Backend Deploy"], // Selected from backend
          ["backend:migrate.md", "# Backend Migrate"], // Selected from backend
          ["shared:lint.md", "# Shared Lint"], // Selected from shared
        ]),
        rules: new Map([
          ["frontend:eslint.md", "# Frontend ESLint"], // Selected from frontend
          ["frontend:style.md", "# Frontend Style"], // Selected from frontend
          ["backend:security.md", "# Backend Security"], // Selected from backend
          ["backend:performance.md", "# Backend Performance"], // Selected from backend
          ["shared:common.md", "# Shared Common"], // Selected from shared
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] }, // Selected from frontend
          "security-server": { command: "security", args: [] }, // Selected from backend
        },
      });

      // Create orchestrator and test
      const orchestrator = new RegistryOrchestrator();
      const result = await orchestrator.loadAndMergeSelective(tempDir, {});

      // Verify multiple presets with different selections
      expect(result.commands.size).toBe(5); // build, test, deploy, migrate, lint
      expect(result.commands.has("frontend:build.md")).toBe(true);
      expect(result.commands.has("frontend:test.md")).toBe(true);
      expect(result.commands.has("backend:deploy.md")).toBe(true);
      expect(result.commands.has("backend:migrate.md")).toBe(true);
      expect(result.commands.has("shared:lint.md")).toBe(true);
      expect(result.commands.has("frontend:serve.md")).toBe(false); // Not selected
      expect(result.commands.has("backend:seed.md")).toBe(false); // Not selected
      expect(result.commands.has("shared:format.md")).toBe(false); // Not selected

      expect(result.rules.size).toBe(5); // eslint, style, security, performance, common
      expect(result.rules.has("frontend:eslint.md")).toBe(true);
      expect(result.rules.has("frontend:style.md")).toBe(true);
      expect(result.rules.has("backend:security.md")).toBe(true);
      expect(result.rules.has("backend:performance.md")).toBe(true);
      expect(result.rules.has("shared:common.md")).toBe(true);
      expect(result.rules.has("frontend:accessibility.md")).toBe(false); // Not selected
      expect(result.rules.has("backend:logging.md")).toBe(false); // Not selected
      expect(result.rules.has("shared:git.md")).toBe(false); // Not selected

      expect(Object.keys(result.mcps).length).toBe(2); // eslint-server, security-server
      expect(result.mcps["eslint-server"]).toBeDefined();
      expect(result.mcps["security-server"]).toBeDefined();
      expect(result.mcps["style-server"]).toBeUndefined(); // Not selected
      expect(result.mcps["perf-server"]).toBeUndefined(); // Not selected
    });
  });

  describe("End-to-End Sync Command with Selective Loading", () => {
    beforeEach(async () => {
      // Create temporary directory
      tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-sync-e2e-"));

      // Create mock instances
      mockGitHubResolver = {
        resolve: vi.fn(),
      };
      mockPresetLoader = {
        load: vi.fn(),
      };
      selectiveLoader = {
        load: vi.fn(),
        validateSelection: vi.fn(),
      };

      // Mock constructors
      vi.mocked(GitHubResolver).mockImplementation(() => mockGitHubResolver);
      vi.mocked(PresetLoader).mockImplementation(() => mockPresetLoader);
      vi.mocked(SelectivePresetLoader).mockImplementation(
        () => selectiveLoader
      );
    });

    afterEach(async () => {
      // Clean up temporary directory
      await rm(tempDir, { recursive: true, force: true });
    });

    it("should sync only selected content to Claude", async () => {
      // Setup config with selective loading
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/standards",
            select: {
              rules: { include: ["eslint.md", "style.md"] },
              commands: { include: ["build.md"] },
              mcps: ["eslint-server"],
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/standards");

      // Mock preset data
      const mockPreset = {
        source: "github:test/standards",
        namespace: "test",
        path: "/cache/test/standards",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- npm run build"],
          ["test.md", "# Test Commands\n\n- npm test"],
          ["deploy.md", "# Deploy Commands\n\n- npm run deploy"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["style.md", "# Style Rules\n\nUse 2 spaces"],
          ["security.md", "# Security Rules\n\nNo eval()"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
          "security-server": { command: "security", args: [] },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockPreset);

      // Mock the SelectivePresetLoader to return filtered results
      selectiveLoader.load.mockResolvedValue({
        commands: new Map([
          ["test:build.md", "# Build Commands\n\n- npm run build"],
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["test:style.md", "# Style Rules\n\nUse 2 spaces"],
        ]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
        },
      });

      // Run sync command
      await sync({ cwd: tempDir });

      // Verify Claude directories and files
      const claudeRulesDir = path.join(tempDir, ".claude", "rules");
      const claudeCommandsDir = path.join(tempDir, ".claude", "commands");

      expect(await fsUtils.pathExists(claudeRulesDir)).toBe(true);
      expect(await fsUtils.pathExists(claudeCommandsDir)).toBe(true);

      // Verify only selected rules are synced
      const eslintRule = await fsUtils.readFile(
        path.join(claudeRulesDir, "test:eslint.md"),
        "utf-8"
      );
      const styleRule = await fsUtils.readFile(
        path.join(claudeRulesDir, "test:style.md"),
        "utf-8"
      );
      expect(eslintRule).toContain("# ESLint Rules");
      expect(styleRule).toContain("# Style Rules");

      // Verify non-selected rules are not synced
      expect(
        await fsUtils.pathExists(path.join(claudeRulesDir, "test:security.md"))
      ).toBe(false);

      // Verify only selected commands are synced
      const buildCommand = await fsUtils.readFile(
        path.join(claudeCommandsDir, "test:build.md"),
        "utf-8"
      );
      expect(buildCommand).toContain("# Build Commands");

      // Verify non-selected commands are not synced
      expect(
        await fsUtils.pathExists(path.join(claudeCommandsDir, "test:test.md"))
      ).toBe(false);
      expect(
        await fsUtils.pathExists(path.join(claudeCommandsDir, "test:deploy.md"))
      ).toBe(false);
    });

    it("should sync only selected content to Cursor", async () => {
      // Setup config with selective loading
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/tools",
            select: {
              rules: { include: ["security.md"] },
              commands: { include: ["deploy.md", "test.md"] },
              mcps: ["security-server"],
            },
          },
        ],
        tools: ["cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/tools");

      // Mock preset data
      const mockPreset = {
        source: "github:test/tools",
        namespace: "test",
        path: "/cache/test/tools",
        commands: new Map([
          ["deploy.md", "# Deploy Commands\n\n- kubectl apply"],
          ["test.md", "# Test Commands\n\n- npm test"],
          ["build.md", "# Build Commands\n\n- npm run build"],
        ]),
        rules: new Map([
          ["test:security.md", "# Security Rules\n\nNo secrets in code"],
          ["test:performance.md", "# Performance Rules\n\nOptimize queries"],
          ["test:style.md", "# Style Rules\n\nUse 4 spaces"],
        ]),
        mcps: {
          "security-server": { command: "security", args: [] },
          "perf-server": { command: "perf", args: [] },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockPreset);

      // Mock the SelectivePresetLoader to return filtered results
      selectiveLoader.load.mockResolvedValue({
        commands: new Map([
          ["test:deploy.md", "# Deploy Commands\n\n- kubectl apply"],
          ["test:test.md", "# Test Commands\n\n- npm test"],
        ]),
        rules: new Map([
          ["test:security.md", "# Security Rules\n\nNo secrets in code"],
          ["test:performance.md", "# Performance Rules\n\nOptimize queries"],
        ]),
        mcps: {
          "security-server": { command: "security", args: [] },
        },
      });

      // Run sync command
      await sync({ cwd: tempDir });

      // Verify Cursor directories and files
      const cursorRulesDir = path.join(tempDir, ".cursor", "rules");
      const cursorCommandsDir = path.join(tempDir, ".cursor", "commands");

      expect(await fsUtils.pathExists(cursorRulesDir)).toBe(true);
      expect(await fsUtils.pathExists(cursorCommandsDir)).toBe(true);

      // Verify only selected rules are synced
      const securityRule = await fsUtils.readFile(
        path.join(cursorRulesDir, "test:security.mdc"),
        "utf-8"
      );
      expect(securityRule).toContain("# Security Rules");

      // Verify non-selected rules are not synced
      expect(
        await fsUtils.pathExists(
          path.join(cursorRulesDir, "test:performance.mdc")
        )
      ).toBe(false);
      expect(
        await fsUtils.pathExists(path.join(cursorRulesDir, "test:style.md"))
      ).toBe(false);

      // Verify only selected commands are synced
      const deployCommand = await fsUtils.readFile(
        path.join(cursorCommandsDir, "test:deploy.md"),
        "utf-8"
      );
      const testCommand = await fsUtils.readFile(
        path.join(cursorCommandsDir, "test:test.md"),
        "utf-8"
      );
      expect(deployCommand).toContain("# Deploy Commands");
      expect(testCommand).toContain("# Test Commands");

      // Verify non-selected commands are not synced
      expect(
        await fsUtils.pathExists(path.join(cursorCommandsDir, "test:build.md"))
      ).toBe(false);
    });

    it("should sync to multiple tools with same selection", async () => {
      // Setup config with selective loading for multiple tools
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/shared",
            select: {
              rules: { include: ["test:common.md"] },
              commands: { include: ["lint.md"] },
            },
          },
        ],
        tools: ["claude", "cursor"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/shared");

      // Mock preset data
      const mockPreset = {
        source: "github:test/shared",
        namespace: "test",
        path: "/cache/test/shared",
        commands: new Map([
          ["lint.md", "# Lint Commands\n\n- npm run lint"],
          ["format.md", "# Format Commands\n\n- npm run format"],
        ]),
        rules: new Map([
          ["common.md", "# Common Rules\n\nFollow conventions"],
          ["git.md", "# Git Rules\n\nConventional commits"],
        ]),
        mcps: {},
      };

      mockPresetLoader.load.mockResolvedValue(mockPreset);

      // Mock the SelectivePresetLoader to return filtered results
      selectiveLoader.load.mockResolvedValue({
        commands: new Map([
          ["test:lint.md", "# Lint Commands\n\n- npm run lint"],
        ]),
        rules: new Map([
          ["test:common.md", "# Common Rules\n\nFollow conventions"],
        ]),
        mcps: {},
      });

      // Run sync command
      await sync({ cwd: tempDir });

      // Verify both tools have the same selected content
      for (const tool of ["claude", "cursor"]) {
        const toolRulesDir = path.join(tempDir, `.${tool}`, "rules");
        const toolCommandsDir = path.join(tempDir, `.${tool}`, "commands");

        expect(await fsUtils.pathExists(toolRulesDir)).toBe(true);
        expect(await fsUtils.pathExists(toolCommandsDir)).toBe(true);

        // Verify selected content
        const commonRule = await fsUtils.readFile(
          path.join(
            toolRulesDir,
            tool === "cursor" ? "test:common.mdc" : "test:common.md"
          ),
          "utf-8"
        );
        const lintCommand = await fsUtils.readFile(
          path.join(toolCommandsDir, "test:lint.md"),
          "utf-8"
        );
        expect(commonRule).toContain("# Common Rules");
        expect(lintCommand).toContain("# Lint Commands");

        // Verify non-selected content is not present
        expect(
          await fsUtils.pathExists(path.join(toolRulesDir, "git.md"))
        ).toBe(false);
        expect(
          await fsUtils.pathExists(path.join(toolCommandsDir, "format.md"))
        ).toBe(false);
      }
    });

    it("should handle dry run mode with selective loading", async () => {
      // Setup config with selective loading
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/dryrun",
            select: {
              rules: { include: ["test:eslint.md"] },
              commands: { include: ["build.md"] },
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/dryrun");

      // Mock preset data
      const mockPreset = {
        source: "github:test/dryrun",
        namespace: "test",
        path: "/cache/test/dryrun",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- npm run build"],
          ["test.md", "# Test Commands\n\n- npm test"],
        ]),
        rules: new Map([
          ["test:eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["test:style.md", "# Style Rules\n\nUse 2 spaces"],
        ]),
        mcps: {},
      };

      mockPresetLoader.load.mockResolvedValue(mockPreset);

      // Run sync command in dry run mode
      await sync({ cwd: tempDir, dryRun: true });

      // Verify no directories or files are created in dry run mode
      expect(await fsUtils.pathExists(path.join(tempDir, ".claude"))).toBe(
        false
      );
      expect(await fsUtils.pathExists(path.join(tempDir, ".cursor"))).toBe(
        false
      );
    });

    it("should validate selections and fail gracefully", async () => {
      // Setup config with invalid selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        version: "1.0",
        extends: [
          {
            source: "github:test/invalid",
            select: {
              rules: { include: ["non-existent.md"] },
              commands: { include: ["missing.md"] },
              mcps: ["non-existent-server"],
            },
          },
        ],
        tools: ["claude"],
      };

      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Mock resolved path
      mockGitHubResolver.resolve.mockResolvedValue("/cache/test/invalid");

      // Mock preset data (without the selected items)
      const mockPreset = {
        source: "github:test/invalid",
        namespace: "test",
        path: "/cache/test/invalid",
        commands: new Map([
          ["build.md", "# Build Commands\n\n- npm run build"],
        ]),
        rules: new Map([["eslint.md", "# ESLint Rules\n\nNo console.log"]]),
        mcps: {
          "eslint-server": { command: "eslint", args: [] },
        },
      };

      mockPresetLoader.load.mockResolvedValue(mockPreset);

      // Mock validateSelection to return validation errors
      selectiveLoader.validateSelection.mockResolvedValue({
        valid: false,
        errors: [
          "Rule file not found for include pattern 'non-existent.md' in preset 'github:test/invalid'",
          "Command file not found for include pattern 'missing.md' in preset 'github:test/invalid'",
          "MCP server 'non-existent-server' not found in preset 'github:test/invalid'",
        ],
      });

      // Run sync with selections - should fail validation
      await expect(
        sync({
          cwd: tempDir,
          selections: {
            "github:test/invalid": {
              rules: { include: ["non-existent.md"] },
              commands: { include: ["missing.md"] },
              mcps: ["non-existent-server"],
            },
          },
        })
      ).rejects.toThrow("Invalid selections");
    });
  });
});
