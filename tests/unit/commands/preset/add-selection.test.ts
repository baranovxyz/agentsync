/**
 * Tests for preset add command with selection support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The addPreset function will be implemented in src/commands/preset/add.ts
// import { addPreset } from "../../../../src/commands/preset/add.js";
import {
  validateConfig,
  validateUserPreset,
} from "../../../../src/types/schemas.js";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "path";
import type {
  PresetSelection,
  UserPreset,
} from "../../../../src/types/index.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../../../src/types/schemas.js");

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockValidateConfig = vi.mocked(validateConfig);
const mockValidateUserPreset = vi.mocked(validateUserPreset);

describe("preset add command with selection support", () => {
  const mockCwd = "/test/project";
  const mockConfigPath = path.join(mockCwd, ".agentsync", "config.json");
  const mockConfig = {
    version: "1.0",
    extends: ["github:company/standards"],
    tools: ["cursor", "claude"] as ("cursor" | "claude")[],
    useSymlinks: true,
  };

  const mockUserPreset: UserPreset = {
    name: "test-preset",
    description: "Test preset for unit testing",
    version: "1.0.0",
    source: "github:testorg/testrepo",
    namespace: "testorg",
    metadata: {
      author: "Test Author",
      tags: ["test", "preset"],
    },
  };

  const mockSelection: PresetSelection = {
    rules: { include: ["*.md"], exclude: ["test.md"] },
    commands: { include: ["*.js"] },
    mcps: ["github"],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
    mockValidateConfig.mockReturnValue(mockConfig);
    mockValidateUserPreset.mockReturnValue(mockUserPreset);

    // Mock console.log to capture output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add preset with selection to project config", async () => {
    const result = await addPreset(mockUserPreset, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toEqual(mockUserPreset);
    expect(result.selection).toEqual(mockSelection);
    expect(mockWriteFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"extends"'),
      "utf-8"
    );
  });

  it("should add preset without selection for backward compatibility", async () => {
    const result = await addPreset(mockUserPreset, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toEqual(mockUserPreset);
    expect(result.selection).toBeUndefined();
    expect(mockWriteFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"extends"'),
      "utf-8"
    );
  });

  it("should validate preset before adding", async () => {
    const invalidPreset = { ...mockUserPreset, version: "invalid" };
    mockValidateUserPreset.mockImplementation(() => {
      throw new Error("Invalid version format");
    });

    await expect(addPreset(invalidPreset, { cwd: mockCwd })).rejects.toThrow(
      "Invalid version format"
    );

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should validate selection before adding", async () => {
    const invalidSelection = {
      rules: { include: [] }, // Empty include array is invalid
    };

    await expect(
      addPreset(mockUserPreset, {
        selection: invalidSelection,
        cwd: mockCwd,
      })
    ).rejects.toThrow("Include patterns cannot be empty");

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should add preset to existing extends array", async () => {
    const configWithMultiplePresets = {
      ...mockConfig,
      extends: ["github:existing/preset"],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(configWithMultiplePresets));
    mockValidateConfig.mockReturnValue(configWithMultiplePresets);

    const result = await addPreset(mockUserPreset, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenConfig.extends).toContain("github:existing/preset");
    expect(writtenConfig.extends).toContain("github:testorg/testrepo");
  });

  it("should create extends array if it doesn't exist", async () => {
    const configWithoutExtends = {
      ...mockConfig,
      extends: undefined,
    };
    mockReadFile.mockResolvedValue(JSON.stringify(configWithoutExtends));
    mockValidateConfig.mockReturnValue(configWithoutExtends);

    const result = await addPreset(mockUserPreset, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenConfig.extends).toEqual(["github:testorg/testrepo"]);
  });

  it("should save selection to interactive selection config", async () => {
    // Mock the interactive selection merger
    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        saveSelectionsForProject: vi.fn().mockResolvedValue(undefined),
      })
    );

    const result = await addPreset(mockUserPreset, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.selection).toEqual(mockSelection);
  });

  it("should handle errors when saving selection config", async () => {
    // Mock error saving selections
    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        saveSelectionsForProject: vi
          .fn()
          .mockRejectedValue(new Error("Permission denied")),
      })
    );

    await expect(
      addPreset(mockUserPreset, {
        selection: mockSelection,
        cwd: mockCwd,
      })
    ).rejects.toThrow("Permission denied");
  });

  it("should not add duplicate presets", async () => {
    const configWithDuplicate = {
      ...mockConfig,
      extends: ["github:testorg/testrepo"],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(configWithDuplicate));
    mockValidateConfig.mockReturnValue(configWithDuplicate);

    const result = await addPreset(mockUserPreset, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should handle file system errors gracefully", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    await expect(addPreset(mockUserPreset, { cwd: mockCwd })).rejects.toThrow(
      "ENOENT: no such file"
    );

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should provide detailed success message", async () => {
    const result = await addPreset(mockUserPreset, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Added preset 'test-preset'");
    expect(result.message).toContain("with selection");
  });

  it("should provide detailed success message without selection", async () => {
    const result = await addPreset(mockUserPreset, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Added preset 'test-preset'");
    expect(result.message).not.toContain("with selection");
  });
});

// Mock the addPreset function interface
interface AddPresetOptions {
  selection?: PresetSelection;
  cwd?: string;
}

interface AddPresetResult {
  success: boolean;
  preset?: UserPreset;
  selection?: PresetSelection;
  message?: string;
  error?: string;
}

// Mock implementation
async function addPreset(
  preset: UserPreset,
  options: AddPresetOptions = {}
): Promise<AddPresetResult> {
  try {
    // Validate preset
    mockValidateUserPreset(preset);

    // Load current config
    const configContent = await mockReadFile(
      path.join(options.cwd || process.cwd(), ".agentsync", "config.json"),
      "utf-8"
    );
    const config = mockValidateConfig(JSON.parse(configContent as string));

    // Check for duplicates
    if (config.extends?.includes(preset.source)) {
      return {
        success: false,
        error: `Preset '${preset.source}' already exists in configuration`,
      };
    }

    // Add preset to extends
    const updatedConfig = {
      ...config,
      extends: [...(config.extends || []), preset.source],
    };

    // Save updated config
    await mockWriteFile(
      path.join(options.cwd || process.cwd(), ".agentsync", "config.json"),
      JSON.stringify(updatedConfig, null, 2),
      "utf-8"
    );

    // Save selection if provided
    if (options.selection) {
      // This would be implemented with the actual interactive selection merger
      console.log(`Saving selection for ${preset.source}`);
    }

    return {
      success: true,
      preset,
      selection: options.selection,
      message: options.selection
        ? `Added preset '${preset.name}' with selection`
        : `Added preset '${preset.name}'`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
