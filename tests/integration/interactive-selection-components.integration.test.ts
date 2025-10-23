/**
 * Integration tests for interactive selection components
 * Tests the integration between all interactive selection components
 */

import * as fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigMerger } from "../../src/core/config/interactive-selection-merger.js";
import { ConfigMigrator } from "../../src/core/config/interactive-selection-migration.js";
import { GitHubResolver } from "../../src/core/registry/github-resolver.js";
import { PresetLoader } from "../../src/core/registry/preset-loader.js";
import { RegistryOrchestrator } from "../../src/core/registry/registry-orchestrator.js";
import { SelectivePresetLoader } from "../../src/core/registry/selective-preset-loader.js";
import { UserPresetRegistry } from "../../src/core/registry/user-preset-registry.js";
import type {
  InteractiveSelectionConfig,
  Preset,
  PresetSelection,
  UserPreset,
} from "../../src/types/index.js";

// Mock dependencies
vi.mock("../../src/core/registry/github-resolver.js");
vi.mock("../../src/core/registry/preset-loader.js");
vi.mock("../../src/core/registry/user-preset-registry.js");

const _mockGitHubResolver = vi.mocked(GitHubResolver);
const _mockPresetLoader = vi.mocked(PresetLoader);
const _mockUserPresetRegistry = vi.mocked(UserPresetRegistry);

describe("Interactive Selection Components Integration", () => {
  let tempDir: string;
  let orchestrator: RegistryOrchestrator;
  let _selectiveLoader: SelectivePresetLoader;
  let configMerger: ConfigMerger;
  let configMigrator: ConfigMigrator;
  let mockResolverInstance: any;
  let mockPresetLoaderInstance: any;
  let mockUserRegistryInstance: any;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-integration-"));

    // Create mock instances
    mockResolverInstance = {
      resolve: vi.fn(),
    };
    mockPresetLoaderInstance = {
      load: vi.fn(),
    };
    mockUserRegistryInstance = {
      list: vi.fn(),
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    };

    // Mock constructors
    vi.mocked(GitHubResolver).mockImplementation(() => mockResolverInstance);
    vi.mocked(PresetLoader).mockImplementation(() => mockPresetLoaderInstance);
    vi.mocked(UserPresetRegistry).mockImplementation(
      () => mockUserRegistryInstance,
    );

    // Create real instances
    orchestrator = new RegistryOrchestrator();
    _selectiveLoader = new SelectivePresetLoader();
    configMerger = new ConfigMerger();
    configMigrator = new ConfigMigrator();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("RegistryOrchestrator integration with SelectivePresetLoader", () => {
    it("should integrate loadAndMergeSelective with SelectivePresetLoader", async () => {
      // Setup mock preset
      const mockPreset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["style.md", "# Style Rules"],
        ]),
        mcps: {
          "github-server": { command: "github-server", args: [] },
          "filesystem-server": { command: "filesystem-server", args: [] },
        },
      };

      // Setup mocks
      mockResolverInstance.resolve.mockResolvedValue(
        "/cache/example/standards",
      );
      mockPresetLoaderInstance.load.mockResolvedValue(mockPreset);

      // Create selections
      const selections: Record<string, PresetSelection> = {
        "github:example/standards": {
          commands: { include: ["build.md"] },
          rules: { include: ["eslint.md"] },
          mcps: ["github-server"],
        },
      };

      // Create config file
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:example/standards"],
          tools: ["cursor"],
        }),
      );

      // Test integration
      const result = await orchestrator.loadAndMergeSelective(
        tempDir,
        selections,
      );

      expect(result.commands.size).toBe(1);
      expect(result.commands.has("build.md")).toBe(true);
      expect(result.rules.size).toBe(1);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(Object.keys(result.mcps).length).toBe(1);
      expect(result.mcps["github-server"]).toBeDefined();
    });

    it("should integrate validateSelections with SelectivePresetLoader", async () => {
      // Setup mock preset
      const mockPreset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([["build.md", "# Build Commands"]]),
        rules: new Map([["eslint.md", "# ESLint Rules"]]),
        mcps: {
          "github-server": { command: "github-server", args: [] },
        },
      };

      // Setup mocks
      mockResolverInstance.resolve.mockResolvedValue(
        "/cache/example/standards",
      );
      mockPresetLoaderInstance.load.mockResolvedValue(mockPreset);

      // Create selections with invalid files
      const selections: Record<string, PresetSelection> = {
        "github:example/standards": {
          commands: { include: ["nonexistent.md"] },
          rules: { include: ["eslint.md"] },
          mcps: ["nonexistent-server"],
        },
      };

      // Create config file
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:example/standards"],
          tools: ["cursor"],
        }),
      );

      // Test integration
      const result = await orchestrator.validateSelections(tempDir, selections);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain(
        "Command file 'nonexistent.md' not found in preset 'github:example/standards'",
      );
      expect(result.errors).toContain(
        "MCP server 'nonexistent-server' not found in preset 'github:example/standards'",
      );
    });
  });

  describe("ConfigMerger integration with SelectivePresetLoader", () => {
    it("should integrate applySelections with SelectivePresetLoader", async () => {
      // Create preset
      const preset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
          ["deploy.md", "# Deploy Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["style.md", "# Style Rules"],
          ["security.md", "# Security Rules"],
        ]),
        mcps: {
          "github-server": { command: "github-server", args: [] },
          "filesystem-server": { command: "filesystem-server", args: [] },
          "database-server": { command: "database-server", args: [] },
        },
      };

      // Create selection
      const selection: PresetSelection = {
        commands: {
          include: ["build.md", "deploy.md"],
        },
        rules: {
          include: ["*.md"],
          exclude: ["security.md"],
        },
        mcps: ["github-server", "database-server"],
      };

      // Test integration
      const result = configMerger.applySelections(preset, selection);

      expect(result.commands.size).toBe(2);
      expect(result.commands.has("build.md")).toBe(true);
      expect(result.commands.has("deploy.md")).toBe(true);
      expect(result.commands.has("test.md")).toBe(false);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("style.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(false);

      expect(Object.keys(result.mcps).length).toBe(2);
      expect(result.mcps["github-server"]).toBeDefined();
      expect(result.mcps["database-server"]).toBeDefined();
      expect(result.mcps["filesystem-server"]).toBeUndefined();
    });

    it("should integrate mergeAppliedSelections with SelectivePresetLoader", async () => {
      // Create multiple presets
      const preset1: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([
          ["build.md", "# Build Commands v1"],
          ["test.md", "# Test Commands v1"],
        ]),
        rules: new Map([["eslint.md", "# ESLint Rules v1"]]),
        mcps: {
          "github-server": { command: "github-server-v1", args: [] },
        },
      };

      const preset2: Preset = {
        source: "github:company/backend",
        namespace: "company",
        path: "/cache/company/backend",
        commands: new Map([
          ["deploy.md", "# Deploy Commands v2"],
          ["test.md", "# Test Commands v2"], // Should override preset1
        ]),
        rules: new Map([
          ["style.md", "# Style Rules v2"],
          ["eslint.md", "# ESLint Rules v2"], // Should override preset1
        ]),
        mcps: {
          "database-server": { command: "database-server", args: [] },
          "github-server": { command: "github-server-v2", args: [] }, // Should override preset1
        },
      };

      // Create selections
      const selection1: PresetSelection = {
        commands: { include: ["*.md"] },
        rules: { include: ["*.md"] },
        mcps: ["github-server"],
      };

      const selection2: PresetSelection = {
        commands: { include: ["*.md"] },
        rules: { include: ["*.md"] },
        mcps: ["github-server", "database-server"],
      };

      // Apply selections
      const applied1 = configMerger.applySelections(preset1, selection1);
      const applied2 = configMerger.applySelections(preset2, selection2);

      // Test integration
      const merged = configMerger.mergeAppliedSelections([applied1, applied2]);

      expect(merged.commands.size).toBe(3);
      expect(merged.commands.get("test.md")).toBe("# Test Commands v2"); // From preset2
      expect(merged.commands.get("build.md")).toBe("# Build Commands v1"); // From preset1
      expect(merged.commands.get("deploy.md")).toBe("# Deploy Commands v2"); // From preset2

      expect(merged.rules.size).toBe(2);
      expect(merged.rules.get("eslint.md")).toBe("# ESLint Rules v2"); // From preset2
      expect(merged.rules.get("style.md")).toBe("# Style Rules v2"); // From preset2

      expect(Object.keys(merged.mcps).length).toBe(2);
      expect(merged.mcps["github-server"].command).toBe("github-server-v2"); // From preset2
      expect(merged.mcps["database-server"]).toBeDefined(); // From preset2
    });
  });

  describe("ConfigMerger integration with configuration levels", () => {
    it("should merge user, project, and local configurations correctly", () => {
      // Create configuration with all three levels
      const config: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards", "github:company/backend"],
          defaultSelections: {
            "github:example/standards": {
              rules: { include: ["user-rules/*.md"] },
              commands: { include: ["user-commands/*.md"] },
            },
            "github:company/backend": {
              rules: { include: ["user-backend-rules/*.md"] },
            },
          },
        },
        project: {
          selections: {
            "github:example/standards": {
              rules: { include: ["project-rules/*.md"] }, // Should override user
              commands: { include: ["project-commands/*.md"] }, // Should override user
              mcps: ["github-server"],
            },
          },
          tools: ["cursor"],
        },
        local: {
          selections: {
            "github:example/standards": {
              rules: { include: ["local-rules/*.md"] }, // Should override project
              mcps: ["local-server"], // Should override project
            },
          },
          overrides: {
            useSymlinks: false,
          },
        },
      };

      // Test integration
      const merged = configMerger.mergeConfig(config);

      expect(merged.presets).toEqual([
        "github:example/standards",
        "github:company/backend",
      ]);
      expect(merged.tools).toEqual(["cursor"]);
      expect(merged.overrides).toEqual({ useSymlinks: false });

      // Check merged selections
      const standardsSelection = merged.selections["github:example/standards"];
      expect(standardsSelection.rules?.include).toEqual(["local-rules/*.md"]); // Local overrides project
      expect(standardsSelection.commands?.include).toEqual([
        "project-commands/*.md",
      ]); // Project overrides user
      expect(standardsSelection.mcps).toEqual(["local-server"]); // Local overrides project

      const backendSelection = merged.selections["github:company/backend"];
      expect(backendSelection.rules?.include).toEqual([
        "user-backend-rules/*.md",
      ]); // Only user level
      expect(backendSelection.commands).toBeUndefined(); // Not defined at any level
      expect(backendSelection.mcps).toBeUndefined(); // Not defined at any level
    });
  });

  describe("ConfigMigrator integration with ConfigMerger", () => {
    it("should migrate legacy config and merge with new format", () => {
      // Create legacy configuration
      const legacyConfig = {
        version: "1.0",
        extends: ["github:example/standards", "github:company/backend"],
        tools: ["cursor", "claude"],
        useSymlinks: true,
        mcpServers: ["github", "filesystem"],
        security: {
          secretScanning: { enabled: true },
        },
        watch: {
          enabled: true,
          debounceMs: 500,
        },
      };

      // Migrate to new format
      const migrationResult = configMigrator.migrateFromLegacy(legacyConfig);
      const newConfig = migrationResult.config;

      // Test integration with ConfigMerger
      const merged = configMerger.mergeConfig(newConfig);

      expect(merged.presets).toEqual([
        "github:example/standards",
        "github:company/backend",
      ]);
      expect(merged.tools).toEqual(["cursor", "claude"]);
      expect(merged.overrides).toEqual({
        useSymlinks: true,
        mcpServers: ["github", "filesystem"],
        security: {
          secretScanning: { enabled: true },
        },
        watch: {
          enabled: true,
          debounceMs: 500,
        },
      });
    });
  });

  describe("UserPresetRegistry integration with interactive selection", () => {
    it("should integrate user presets with interactive selection workflow", async () => {
      // Create mock user presets
      const mockUserPresets: UserPreset[] = [
        {
          name: "my-frontend-preset",
          description: "Frontend development standards",
          version: "1.0.0",
          source: "github:myorg/frontend-standards",
          namespace: "myorg",
        },
        {
          name: "my-backend-preset",
          description: "Backend development standards",
          version: "1.0.0",
          source: "github:myorg/backend-standards",
          namespace: "myorg",
        },
      ];

      // Setup mocks
      mockUserRegistryInstance.list.mockResolvedValue(mockUserPresets);
      mockUserRegistryInstance.get.mockImplementation((name: string) => {
        return Promise.resolve(mockUserPresets.find((p) => p.name === name));
      });

      // Create mock presets
      const mockFrontendPreset: Preset = {
        source: "github:myorg/frontend-standards",
        namespace: "myorg",
        path: "/cache/myorg/frontend-standards",
        commands: new Map([["build.md", "# Frontend Build Commands"]]),
        rules: new Map([["eslint.md", "# Frontend ESLint Rules"]]),
        mcps: {
          "frontend-server": { command: "frontend-server", args: [] },
        },
      };

      const mockBackendPreset: Preset = {
        source: "github:myorg/backend-standards",
        namespace: "myorg",
        path: "/cache/myorg/backend-standards",
        commands: new Map([["test.md", "# Backend Test Commands"]]),
        rules: new Map([["security.md", "# Backend Security Rules"]]),
        mcps: {
          "backend-server": { command: "backend-server", args: [] },
        },
      };

      // Setup mocks for preset loading
      mockResolverInstance.resolve.mockImplementation((source: string) => {
        if (source === "github:myorg/frontend-standards") {
          return Promise.resolve("/cache/myorg/frontend-standards");
        }
        if (source === "github:myorg/backend-standards") {
          return Promise.resolve("/cache/myorg/backend-standards");
        }
        return Promise.resolve("");
      });

      mockPresetLoaderInstance.load.mockImplementation(
        (source: string, _path: string, _namespace: string) => {
          if (source === "github:myorg/frontend-standards") {
            return Promise.resolve(mockFrontendPreset);
          }
          if (source === "github:myorg/backend-standards") {
            return Promise.resolve(mockBackendPreset);
          }
          return Promise.resolve({} as Preset);
        },
      );

      // Create config with user presets
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [
            "github:myorg/frontend-standards",
            "github:myorg/backend-standards",
          ],
          tools: ["cursor"],
        }),
      );

      // Create selections for user presets
      const selections: Record<string, PresetSelection> = {
        "github:myorg/frontend-standards": {
          commands: { include: ["build.md"] },
          rules: { include: ["eslint.md"] },
          mcps: ["frontend-server"],
        },
        "github:myorg/backend-standards": {
          commands: { include: ["test.md"] },
          rules: { include: ["security.md"] },
          mcps: ["backend-server"],
        },
      };

      // Test integration
      const result = await orchestrator.loadAndMergeSelective(
        tempDir,
        selections,
      );

      expect(result.commands.size).toBe(2);
      expect(result.commands.has("build.md")).toBe(true);
      expect(result.commands.has("test.md")).toBe(true);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("security.md")).toBe(true);

      expect(Object.keys(result.mcps).length).toBe(2);
      expect(result.mcps["frontend-server"]).toBeDefined();
      expect(result.mcps["backend-server"]).toBeDefined();
    });
  });

  describe("End-to-end integration workflow", () => {
    it("should handle complete workflow from migration to sync", async () => {
      // 1. Start with legacy configuration
      const legacyConfig = {
        version: "1.0",
        extends: ["github:example/standards"],
        tools: ["cursor"],
        useSymlinks: true,
      };

      // 2. Migrate to new format
      const migrationResult = configMigrator.migrateFromLegacy(legacyConfig);
      const newConfig = migrationResult.config;

      // 3. Add interactive selections
      newConfig.project = {
        ...newConfig.project,
        selections: {
          "github:example/standards": {
            rules: { include: ["*.md"] },
            commands: { include: ["build.md"] },
            mcps: ["github-server"],
          },
        },
      };

      // 4. Merge configuration
      const merged = configMerger.mergeConfig(newConfig);

      // 5. Create mock preset
      const mockPreset: Preset = {
        source: "github:example/standards",
        namespace: "example",
        path: "/cache/example/standards",
        commands: new Map([
          ["build.md", "# Build Commands"],
          ["test.md", "# Test Commands"],
        ]),
        rules: new Map([
          ["eslint.md", "# ESLint Rules"],
          ["style.md", "# Style Rules"],
        ]),
        mcps: {
          "github-server": { command: "github-server", args: [] },
          "filesystem-server": { command: "filesystem-server", args: [] },
        },
      };

      // 6. Setup mocks
      mockResolverInstance.resolve.mockResolvedValue(
        "/cache/example/standards",
      );
      mockPresetLoaderInstance.load.mockResolvedValue(mockPreset);

      // 7. Create config file
      const configDir = path.join(tempDir, ".agentsync");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:example/standards"],
          tools: ["cursor"],
          interactiveSelection: newConfig,
        }),
      );

      // 8. Load and apply selections
      const result = await orchestrator.loadAndMergeSelective(
        tempDir,
        merged.selections,
      );

      // 9. Verify final result
      expect(result.commands.size).toBe(1);
      expect(result.commands.has("build.md")).toBe(true);

      expect(result.rules.size).toBe(2);
      expect(result.rules.has("eslint.md")).toBe(true);
      expect(result.rules.has("style.md")).toBe(true);

      expect(Object.keys(result.mcps).length).toBe(1);
      expect(result.mcps["github-server"]).toBeDefined();
    });
  });
});
