/**
 * Integration tests for selective preset loading
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RegistryOrchestrator } from "../../src/core/registry/registry-orchestrator.js";
import { SelectivePresetLoader } from "../../src/core/registry/selective-preset-loader.js";
import { GitHubResolver } from "../../src/core/registry/github-resolver.js";
import { PresetLoader } from "../../src/core/registry/preset-loader.js";
import type { PresetSelection } from "../../src/types/index.js";
import * as fs from "node:fs/promises";
import * as path from "path";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "os";

// Mock dependencies
vi.mock("../../src/core/registry/github-resolver.js");
vi.mock("../../src/core/registry/preset-loader.js");

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

    // Mock constructors
    vi.mocked(GitHubResolver).mockImplementation(() => mockGitHubResolver);
    vi.mocked(PresetLoader).mockImplementation(() => mockPresetLoader);

    orchestrator = new RegistryOrchestrator();
    selectiveLoader = new SelectivePresetLoader();
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
      const selections: Record<string, PresetSelection> = {
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

      // Mock the selective loader
      const mockFiltered1 = {
        commands: new Map([["build.md", "# Build Commands\n\n- make"]]),
        rules: new Map([["eslint.md", "# ESLint Rules\n\nNo console.log"]]),
        mcps: { "eslint-server": { command: "eslint", args: [] } },
      };

      const mockFiltered2 = {
        commands: new Map([
          ["deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([["security.md", "# Security Rules\n\nNo eval()"]]),
        mcps: { "security-server": { command: "security", args: [] } },
      };

      vi.spyOn(selectiveLoader, "loadSelective")
        .mockResolvedValueOnce(mockFiltered1)
        .mockResolvedValueOnce(mockFiltered2);

      vi.spyOn(selectiveLoader, "mergeFilteredPresets").mockReturnValue({
        commands: new Map([
          ["build.md", "# Build Commands\n\n- make"],
          ["deploy.md", "# Deploy Commands\n\n- make deploy"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules\n\nNo console.log"],
          ["security.md", "# Security Rules\n\nNo eval()"],
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
    });

    it("should validate selections and report errors", async () => {
      const selections: Record<string, PresetSelection> = {
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
      const selections: Record<string, PresetSelection> = {};

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

      const selection: PresetSelection = {
        commands: {
          include: ["*.md"],
          exclude: ["deploy.md"],
        },
        rules: {
          include: ["*lint.md", "security.md"],
        },
        mcps: ["eslint-server", "security-server"],
      };

      const result = await selectiveLoader.loadSelective(preset, selection);

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

      const selection1: PresetSelection = {
        commands: { include: ["build.md", "test.md"] },
        rules: { include: ["eslint.md"] },
        mcps: ["eslint-server"],
      };

      const selection2: PresetSelection = {
        commands: { include: ["deploy.md", "test.md"] },
        rules: { include: ["security.md", "eslint.md"] },
        mcps: ["eslint-server", "security-server"],
      };

      const filtered1 = await selectiveLoader.loadSelective(
        preset1,
        selection1
      );
      const filtered2 = await selectiveLoader.loadSelective(
        preset2,
        selection2
      );

      const merged = selectiveLoader.mergeFilteredPresets([
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
