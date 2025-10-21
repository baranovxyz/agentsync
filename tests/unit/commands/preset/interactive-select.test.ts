/**
 * Unit tests for interactive preset selection command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { interactiveSelectPreset } from "../../../../src/commands/preset/interactive-select.js";
import * as path from "path";
import * as os from "os";
import * as fs from "../../../../src/utils/fs.js";
import { mkdtemp } from "node:fs/promises";
import type {
  UserPreset,
  PresetSelection,
} from "../../../../src/types/index.js";

// Mock the interactive prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Mock the registry orchestrator
vi.mock("../../../../src/core/registry/registry-orchestrator.js", () => ({
  RegistryOrchestrator: vi.fn().mockImplementation(() => ({
    loadAndMerge: vi.fn(),
    validateSelections: vi.fn(),
  })),
}));

// Mock the user preset registry
vi.mock("../../../../src/core/registry/user-preset-registry.js", () => ({
  UserPresetRegistry: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    add: vi.fn(),
    get: vi.fn(),
  })),
}));

// Mock the source resolver
vi.mock("../../../../src/core/registry/source-resolver.js", () => ({
  SourceResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn(),
    validateSource: vi.fn(),
    isGitHubSource: vi.fn(),
  })),
}));

// Mock the config merger
vi.mock("../../../../src/core/config/interactive-selection-merger.js", () => ({
  ConfigMerger: vi.fn().mockImplementation(() => ({
    mergeConfig: vi.fn(),
    applySelections: vi.fn(),
  })),
}));

describe("Interactive Preset Selection Command", () => {
  let tempDir: string;
  let mockSelect: any;
  let mockCheckbox: any;
  let mockInput: any;
  let mockConfirm: any;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "agentsync-interactive-test-")
    );

    // Setup mock functions
    const prompts = await import("@inquirer/prompts");
    mockSelect = vi.mocked(prompts.select);
    mockCheckbox = vi.mocked(prompts.checkbox);
    mockInput = vi.mocked(prompts.input);
    mockConfirm = vi.mocked(prompts.confirm);

    // Mock interactive environment
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.clearAllMocks();
  });

  describe("Preset Browsing and Selection", () => {
    it("should display available user presets and GitHub sources", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards", "github:org/backend-rules"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      const mockUserPresets: UserPreset[] = [
        {
          name: "frontend-standards",
          description: "Frontend development standards",
          version: "1.0.0",
          source: "github:company/frontend-standards",
          namespace: "company",
          metadata: {
            author: "Frontend Team",
            tags: ["frontend", "react"],
          },
        },
      ];
      mockRegistry.list.mockResolvedValue(mockUserPresets);

      // Mock user selects GitHub source
      mockSelect.mockResolvedValue("github:company/standards");

      await interactiveSelectPreset({ cwd: tempDir });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Select a preset source:",
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("frontend-standards"),
              value: "user:frontend-standards",
            }),
            expect.objectContaining({
              name: expect.stringContaining("github:company/standards"),
              value: "github:company/standards",
            }),
          ]),
        })
      );
    });

    it("should handle empty preset list gracefully", async () => {
      // Setup config with no extends
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock empty user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      mockRegistry.list.mockResolvedValue([]);

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "No presets available"
      );
    });

    it("should allow adding new GitHub source", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock empty user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      mockRegistry.list.mockResolvedValue([]);

      // Mock user selects "Add new GitHub source"
      mockSelect.mockResolvedValue("add-new");
      mockInput.mockResolvedValue("github:new-org/new-repo");

      await interactiveSelectPreset({ cwd: tempDir });

      expect(mockInput).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Enter GitHub source (format: github:org/repo):",
          validate: expect.any(Function),
        })
      );
    });
  });

  describe("File Pattern Input and Validation", () => {
    it("should prompt for file patterns for each content type", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules", "commands"]);

      // Mock file pattern inputs
      mockInput
        .mockResolvedValueOnce("*.md") // rules include
        .mockResolvedValueOnce("test-*.md") // rules exclude
        .mockResolvedValueOnce("*.js") // commands include
        .mockResolvedValueOnce(""); // commands exclude (empty)

      // Mock MCP selection
      mockCheckbox.mockResolvedValueOnce(["mcp-server-1"]);

      await interactiveSelectPreset({ cwd: tempDir });

      // Should prompt for rules patterns
      expect(mockInput).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Include patterns for rules (comma-separated):",
        })
      );

      expect(mockInput).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Exclude patterns for rules (comma-separated, optional):",
        })
      );

      // Should prompt for commands patterns
      expect(mockInput).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Include patterns for commands (comma-separated):",
        })
      );
    });

    it("should validate file pattern format", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock invalid pattern input
      mockInput.mockResolvedValue("invalid[pattern");

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Invalid glob pattern"
      );
    });

    it("should handle empty file patterns", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock empty pattern input
      mockInput.mockResolvedValue("");

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Include patterns cannot be empty"
      );
    });
  });

  describe("Preview Functionality", () => {
    it("should show preview of selected content before applying", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map([
          ["build.js", "build command content"],
          ["test.js", "test command content"],
        ]),
        rules: new Map([
          ["style.md", "style rule content"],
          ["security.md", "security rule content"],
        ]),
        mcps: {
          "mcp-server-1": { name: "mcp-server-1", command: "server1" },
          "mcp-server-2": { name: "mcp-server-2", command: "server2" },
        },
      });

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules", "commands"]);

      // Mock file pattern inputs
      mockInput
        .mockResolvedValueOnce("*.md") // rules include
        .mockResolvedValueOnce("") // rules exclude
        .mockResolvedValueOnce("*.js") // commands include
        .mockResolvedValueOnce(""); // commands exclude

      // Mock MCP selection
      mockCheckbox.mockResolvedValueOnce(["mcp-server-1"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveSelectPreset({ cwd: tempDir });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Apply this selection?"),
        })
      );
    });

    it("should allow user to cancel after preview", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map([["build.js", "build command content"]]),
        rules: new Map([["style.md", "style rule content"]]),
        mcps: {},
      });

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock file pattern inputs
      mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");

      // Mock user cancellation
      mockConfirm.mockResolvedValue(false);

      await interactiveSelectPreset({ cwd: tempDir });

      // Should not save any configuration
      expect(mockConfirm).toHaveBeenCalled();
    });
  });

  describe("Saving Selections to Configuration", () => {
    it("should save selections to project configuration", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map([["build.js", "build command content"]]),
        rules: new Map([["style.md", "style rule content"]]),
        mcps: {},
      });

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock file pattern inputs
      mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveSelectPreset({ cwd: tempDir });

      // Should have updated the configuration file
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      expect(updatedConfig.interactiveSelection).toBeDefined();
      expect(updatedConfig.interactiveSelection.project).toBeDefined();
      expect(
        updatedConfig.interactiveSelection.project.selections
      ).toBeDefined();
      expect(
        updatedConfig.interactiveSelection.project.selections[
          "github:company/standards"
        ]
      ).toBeDefined();
    });

    it("should merge with existing selections", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards", "github:org/backend-rules"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:org/backend-rules": {
                  rules: { include: ["*.py"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map([["build.js", "build command content"]]),
        rules: new Map([["style.md", "style rule content"]]),
        mcps: {},
      });

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock file pattern inputs
      mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveSelectPreset({ cwd: tempDir });

      // Should have merged selections
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      expect(updatedConfig.interactiveSelection.project.selections).toEqual({
        "github:org/backend-rules": {
          rules: { include: ["*.py"] },
        },
        "github:company/standards": {
          rules: { include: ["*.md"] },
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid GitHub source format", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock empty user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      mockRegistry.list.mockResolvedValue([]);

      // Mock user selects "Add new GitHub source" and enters invalid format
      mockSelect.mockResolvedValue("add-new");
      mockInput.mockResolvedValue("invalid-format");

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Invalid GitHub source format"
      );
    });

    it("should handle preset loading errors", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading error
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockRejectedValue(
        new Error("Failed to load preset")
      );

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Failed to load preset"
      );
    });

    it("should handle validation errors for selections", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map([["build.js", "build command content"]]),
        rules: new Map([["style.md", "style rule content"]]),
        mcps: {},
      });

      // Mock validation error
      mockOrchestrator.validateSelections.mockResolvedValue({
        valid: false,
        errors: ["Rule file 'nonexistent.md' not found in preset"],
      });

      // Mock preset selection
      mockSelect.mockResolvedValue("github:company/standards");
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock file pattern inputs
      mockInput
        .mockResolvedValueOnce("nonexistent.md")
        .mockResolvedValueOnce("");

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Rule file 'nonexistent.md' not found in preset"
      );
    });

    it("should handle non-interactive environment", async () => {
      // Mock non-interactive environment
      Object.defineProperty(process.stdin, "isTTY", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await expect(interactiveSelectPreset({ cwd: tempDir })).rejects.toThrow(
        "Interactive preset selection requires a terminal"
      );
    });
  });

  describe("Integration with User Preset Registry", () => {
    it("should allow selecting from user presets", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      const mockUserPresets: UserPreset[] = [
        {
          name: "my-custom-preset",
          description: "My custom preset",
          version: "1.0.0",
          source: "github:myorg/myrepo",
          namespace: "myorg",
        },
      ];
      mockRegistry.list.mockResolvedValue(mockUserPresets);

      // Mock user selects user preset
      mockSelect.mockResolvedValue("user:my-custom-preset");

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map(),
        rules: new Map([["custom.md", "custom rule"]]),
        mcps: {},
      });

      // Mock content selection
      mockCheckbox.mockResolvedValue(["rules"]);
      mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");
      mockConfirm.mockResolvedValue(true);

      await interactiveSelectPreset({ cwd: tempDir });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("my-custom-preset"),
              value: "user:my-custom-preset",
            }),
          ]),
        })
      );
    });

    it("should add new GitHub source to user registry", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" }
      );

      // Mock empty user presets
      const { UserPresetRegistry } = await import(
        "../../../../src/core/registry/user-preset-registry.js"
      );
      const mockRegistry = vi.mocked(UserPresetRegistry).mock.instances[0];
      mockRegistry.list.mockResolvedValue([]);

      // Mock user adds new source
      mockSelect.mockResolvedValue("add-new");
      mockInput
        .mockResolvedValueOnce("github:neworg/newrepo") // GitHub source
        .mockResolvedValueOnce("My New Preset") // Preset name
        .mockResolvedValueOnce("Description for my new preset"); // Preset description

      // Mock preset loading
      const { RegistryOrchestrator } = await import(
        "../../../../src/core/registry/registry-orchestrator.js"
      );
      const mockOrchestrator =
        vi.mocked(RegistryOrchestrator).mock.instances[0];
      mockOrchestrator.loadAndMerge.mockResolvedValue({
        commands: new Map(),
        rules: new Map([["example.md", "example rule"]]),
        mcps: {},
      });

      // Mock content selection
      mockCheckbox.mockResolvedValue(["rules"]);
      mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");
      mockConfirm.mockResolvedValue(true);

      await interactiveSelectPreset({ cwd: tempDir });

      expect(mockRegistry.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My New Preset",
          description: "Description for my new preset",
          source: "github:neworg/newrepo",
          namespace: "neworg",
        })
      );
    });
  });
});
