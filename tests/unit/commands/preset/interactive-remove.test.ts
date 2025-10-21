/**
 * Unit tests for interactive preset removal command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { interactiveRemovePreset } from "../../../../src/commands/preset/interactive-remove.js";
import * as path from "path";
import * as os from "os";
import * as fs from "../../../../src/utils/fs.js";
import { mkdtemp } from "node:fs/promises";
import type {
  UserPreset,
  PresetSelection,
  InteractiveSelectionConfig,
} from "../../../../src/types/index.js";

// Mock the interactive prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  confirm: vi.fn(),
}));

// Mock the user preset registry
vi.mock("../../../../src/core/registry/user-preset-registry.js", () => ({
  UserPresetRegistry: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
  })),
}));

// Mock the config merger
vi.mock("../../../../src/core/config/interactive-selection-merger.js", () => ({
  ConfigMerger: vi.fn().mockImplementation(() => ({
    applySelections: vi.fn(),
  })),
}));

describe("Interactive Preset Removal Command", () => {
  let tempDir: string;
  let mockSelect: any;
  let mockCheckbox: any;
  let mockConfirm: any;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "agentsync-interactive-remove-test-")
    );

    // Setup mock functions
    const prompts = await import("@inquirer/prompts");
    mockSelect = vi.mocked(prompts.select);
    mockCheckbox = vi.mocked(prompts.checkbox);
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

  describe("Preset Browsing and Selection for Removal", () => {
    it("should display available configured presets for removal", async () => {
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
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                  commands: { include: ["*.js"] },
                },
                "github:org/backend-rules": {
                  rules: { include: ["*.py"] },
                },
              },
            },
          },
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
        },
      ];
      mockRegistry.list.mockResolvedValue(mockUserPresets);

      // Mock user selects a preset for removal
      mockSelect.mockResolvedValue("github:company/standards");

      await interactiveRemovePreset({ cwd: tempDir });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Select a preset to remove:",
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("github:company/standards"),
              value: "github:company/standards",
            }),
            expect.objectContaining({
              name: expect.stringContaining("github:org/backend-rules"),
              value: "github:org/backend-rules",
            }),
          ]),
        })
      );
    });

    it("should handle empty preset list gracefully", async () => {
      // Setup config with no selections
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

      await expect(interactiveRemovePreset({ cwd: tempDir })).rejects.toThrow(
        "No presets configured for removal"
      );
    });
  });

  describe("Removal Options Selection", () => {
    it("should allow removing entire preset or specific selections", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                  commands: { include: ["*.js"] },
                  mcps: ["mcp-server-1"],
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects specific content types to remove
      mockCheckbox.mockResolvedValue(["rules", "mcps"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "What would you like to remove?",
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("Remove entire preset"),
              value: "entire",
            }),
            expect.objectContaining({
              name: expect.stringContaining("Remove specific selections"),
              value: "specific",
            }),
          ]),
        })
      );

      expect(mockCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Select content types to remove:",
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("Rules"),
              value: "rules",
            }),
            expect.objectContaining({
              name: expect.stringContaining("Commands"),
              value: "commands",
            }),
            expect.objectContaining({
              name: expect.stringContaining("MCPs"),
              value: "mcps",
            }),
          ]),
        })
      );
    });

    it("should only show available content types for removal", async () => {
      // Setup config with only rules selection
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects rules
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      expect(mockCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Select content types to remove:",
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining("Rules"),
              value: "rules",
            }),
          ]),
        })
      );
    });
  });

  describe("Preview Functionality", () => {
    it("should show preview of what will be removed before applying", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"], exclude: ["test-*"] },
                  commands: { include: ["*.js"] },
                  mcps: ["mcp-server-1", "mcp-server-2"],
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects content types to remove
      mockCheckbox.mockResolvedValue(["rules", "mcps"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Remove these selections?"),
        })
      );
    });

    it("should allow user to cancel after preview", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("entire"); // Choose entire removal

      // Mock user cancellation
      mockConfirm.mockResolvedValue(false);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should not modify configuration
      const configContent = await fs.readFile(
        path.join(configDir, "config.json"),
        "utf-8"
      );
      const config = JSON.parse(configContent);
      expect(config.interactiveSelection.project.selections).toEqual({
        "github:company/standards": {
          rules: { include: ["*.md"] },
        },
      });
    });
  });

  describe("Configuration Updates", () => {
    it("should remove entire preset from configuration", async () => {
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
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                  commands: { include: ["*.js"] },
                },
                "github:org/backend-rules": {
                  rules: { include: ["*.py"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("entire"); // Choose entire removal

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have removed the preset from configuration
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      expect(
        updatedConfig.interactiveSelection.project.selections[
          "github:company/standards"
        ]
      ).toBeUndefined();

      // Other preset should remain
      expect(
        updatedConfig.interactiveSelection.project.selections[
          "github:org/backend-rules"
        ]
      ).toBeDefined();
    });

    it("should remove specific selections from preset", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"], exclude: ["test-*"] },
                  commands: { include: ["*.js"] },
                  mcps: ["mcp-server-1"],
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects content types to remove
      mockCheckbox.mockResolvedValue(["rules", "mcps"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have removed specific selections
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      const remainingSelection =
        updatedConfig.interactiveSelection.project.selections[
          "github:company/standards"
        ];

      expect(remainingSelection.rules).toBeUndefined();
      expect(remainingSelection.mcps).toBeUndefined();
      expect(remainingSelection.commands).toEqual({
        include: ["*.js"],
      });
    });

    it("should clean up empty preset after removing all selections", async () => {
      // Setup config with existing selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects the only content type
      mockCheckbox.mockResolvedValue(["rules"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have removed the entire preset since no selections remain
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      expect(
        updatedConfig.interactiveSelection.project.selections[
          "github:company/standards"
        ]
      ).toBeUndefined();
    });

    it("should handle removal from different configuration levels", async () => {
      // Setup config with selections at different levels
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            user: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
            project: {
              selections: {
                "github:company/standards": {
                  commands: { include: ["*.js"] },
                },
              },
            },
            local: {
              selections: {
                "github:company/standards": {
                  mcps: ["mcp-server-1"],
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset, config level, and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("project") // Select config level
        .mockResolvedValueOnce("specific"); // Choose specific removal

      // Mock user selects content types to remove
      mockCheckbox.mockResolvedValue(["commands"]);

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have removed from project level only
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      // User level should remain unchanged
      expect(
        updatedConfig.interactiveSelection.user.selections[
          "github:company/standards"
        ].rules
      ).toEqual({ include: ["*.md"] });

      // Project level should have commands removed
      expect(
        updatedConfig.interactiveSelection.project.selections[
          "github:company/standards"
        ].commands
      ).toBeUndefined();

      // Local level should remain unchanged
      expect(
        updatedConfig.interactiveSelection.local.selections[
          "github:company/standards"
        ].mcps
      ).toEqual(["mcp-server-1"]);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-interactive environment", async () => {
      // Mock non-interactive environment
      Object.defineProperty(process.stdin, "isTTY", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await expect(interactiveRemovePreset({ cwd: tempDir })).rejects.toThrow(
        "Interactive preset removal requires a terminal"
      );
    });

    it("should handle invalid configuration format", async () => {
      // Setup config with invalid format
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: "invalid-format", // Should be an object
        }),
        { encoding: "utf-8" }
      );

      await expect(interactiveRemovePreset({ cwd: tempDir })).rejects.toThrow(
        "Invalid configuration format"
      );
    });

    it("should handle preset not found in configuration", async () => {
      // Setup config with selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects a preset that doesn't exist
      mockSelect.mockResolvedValue("github:nonexistent/preset");

      await expect(interactiveRemovePreset({ cwd: tempDir })).rejects.toThrow(
        "Preset not found in configuration"
      );
    });

    it("should handle file system errors during configuration update", async () => {
      // Setup config with selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: ["github:company/standards"],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "github:company/standards": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
        }),
        { encoding: "utf-8" }
      );

      // Mock user selects preset and removal option
      mockSelect
        .mockResolvedValueOnce("github:company/standards") // Select preset
        .mockResolvedValueOnce("entire"); // Choose entire removal

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      // Mock file system error during write
      const originalWriteFile = fs.outputFile;
      vi.mocked(fs).outputFile.mockRejectedValueOnce(
        new Error("Permission denied")
      );

      await expect(interactiveRemovePreset({ cwd: tempDir })).rejects.toThrow(
        "Failed to update configuration"
      );

      // Restore mock
      vi.mocked(fs).outputFile = originalWriteFile;
    });
  });

  describe("Integration with User Preset Registry", () => {
    it("should allow removing user presets from registry", async () => {
      // Setup config with user preset selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "user:my-custom-preset": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
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

      // Mock user selects user preset and removal option
      mockSelect
        .mockResolvedValueOnce("user:my-custom-preset") // Select preset
        .mockResolvedValueOnce("entire"); // Choose entire removal

      // Mock confirmation
      mockConfirm.mockResolvedValue(true);

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have removed from configuration
      const updatedConfig = JSON.parse(
        await fs.readFile(path.join(configDir, "config.json"), "utf-8")
      );

      expect(
        updatedConfig.interactiveSelection.project.selections[
          "user:my-custom-preset"
        ]
      ).toBeUndefined();
    });

    it("should offer option to remove preset from user registry", async () => {
      // Setup config with user preset selections
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          tools: ["cursor"],
          useSymlinks: true,
          interactiveSelection: {
            version: "2.0",
            project: {
              selections: {
                "user:my-custom-preset": {
                  rules: { include: ["*.md"] },
                },
              },
            },
          },
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

      // Mock user selects user preset and removal option
      mockSelect
        .mockResolvedValueOnce("user:my-custom-preset") // Select preset
        .mockResolvedValueOnce("entire"); // Choose entire removal

      // Mock confirmation for removal and registry cleanup
      mockConfirm
        .mockResolvedValueOnce(true) // Confirm removal
        .mockResolvedValueOnce(true); // Confirm registry cleanup

      await interactiveRemovePreset({ cwd: tempDir });

      // Should have called remove on registry
      expect(mockRegistry.remove).toHaveBeenCalledWith("my-custom-preset");
    });
  });
});
