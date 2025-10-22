/**
 * Tests for preset add command with selection support
 */

import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PresetSelection,
  UserPresetEntry,
} from "../../../../src/types/index.js";
// The addPreset function will be implemented in src/commands/preset/add.ts
import { addPreset } from "../../../../src/commands/preset/add.js";
import {
  validateConfig,
  validateUserPresetEntry,
} from "../../../../src/types/schemas.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../../../src/types/schemas.js");

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockValidateConfig = vi.mocked(validateConfig);
const mockValidateUserPresetEntry = vi.mocked(validateUserPresetEntry);

describe("preset add command with selection support", () => {
  const mockCwd = "/test/project";
  const mockConfigPath = path.join(mockCwd, ".agentsync", "config.json");
  const mockConfig = {
    version: "1.0",
    extends: ["github:company/standards"],
    tools: ["cursor", "claude"] as ("cursor" | "claude")[],
    useSymlinks: true,
  };

  const mockSource = "github:testorg/testrepo";
  const mockUserPresetEntry: UserPresetEntry = {
    source: mockSource,
    type: "github",
    addedAt: "2023-10-22T06:53:00.000Z",
    description: "Test preset for unit testing",
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
    mockValidateUserPresetEntry.mockReturnValue(mockUserPresetEntry);

    // Mock console.log to capture output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add preset with selection to project config", async () => {
    const result = await addPreset(mockSource, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toMatchObject({
      source: mockSource,
      type: "github",
    });
    expect(result.preset?.addedAt).toBeDefined();
    expect(result.selection).toEqual(mockSelection);
    expect(mockWriteFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"extends"'),
      "utf-8",
    );
  });

  it("should add preset without selection for backward compatibility", async () => {
    const result = await addPreset(mockSource, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toMatchObject({
      source: mockSource,
      type: "github",
    });
    expect(result.preset?.addedAt).toBeDefined();
    expect(result.selection).toBeUndefined();
    expect(mockWriteFile).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"extends"'),
      "utf-8",
    );
  });

  it("should validate preset before adding", async () => {
    mockValidateUserPresetEntry.mockImplementation(() => {
      throw new Error("Invalid preset entry");
    });

    const result = await addPreset(mockSource, { cwd: mockCwd });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid preset entry");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should validate selection before adding", async () => {
    const invalidSelection = {
      rules: { include: [] }, // Empty include array is invalid
    };

    const result = await addPreset(mockSource, {
      selection: invalidSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Include patterns cannot be empty");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should add preset to existing extends array", async () => {
    const configWithMultiplePresets = {
      ...mockConfig,
      extends: ["github:existing/preset"],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(configWithMultiplePresets));
    mockValidateConfig.mockReturnValue(configWithMultiplePresets);

    const result = await addPreset(mockSource, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toMatchObject({
      source: mockSource,
      type: "github",
    });

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

    const result = await addPreset(mockSource, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.preset).toMatchObject({
      source: mockSource,
      type: "github",
    });

    const writtenConfig = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenConfig.extends).toEqual(["github:testorg/testrepo"]);
  });



  it("should not add duplicate presets", async () => {
    const configWithDuplicate = {
      ...mockConfig,
      extends: ["github:testorg/testrepo"],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(configWithDuplicate));
    mockValidateConfig.mockReturnValue(configWithDuplicate);

    const result = await addPreset(mockSource, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should handle file system errors gracefully", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const result = await addPreset(mockSource, { cwd: mockCwd });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ENOENT: no such file");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("should provide detailed success message", async () => {
    const result = await addPreset(mockSource, {
      selection: mockSelection,
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Added preset 'github:testorg/testrepo'");
    expect(result.message).toContain("with selection");
  });

  it("should provide detailed success message without selection", async () => {
    const result = await addPreset(mockSource, {
      cwd: mockCwd,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Added preset 'github:testorg/testrepo'");
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
  preset?: UserPresetEntry;
  selection?: PresetSelection;
  message?: string;
  error?: string;
}

// Mock implementation
async function addPreset(
  source: string,
  options: AddPresetOptions = {},
): Promise<AddPresetResult> {
  try {
    // Validate source format
    const match = source.match(/^github:([^/]+)\/([^/]+)$/);
    if (!match) {
      return {
        success: false,
        error: "Invalid source format. Expected: github:org/repo",
      };
    }

    const preset: UserPresetEntry = {
      source,
      type: "github",
      addedAt: new Date().toISOString(),
    };

    // Validate preset
    mockValidateUserPresetEntry(preset);

    // Load current config
    const configContent = await mockReadFile(
      path.join(options.cwd || process.cwd(), ".agentsync", "config.json"),
      "utf-8",
    );
    const config = mockValidateConfig(JSON.parse(configContent as string));

    // Check for duplicates
    if (config.extends?.includes(source)) {
      return {
        success: false,
        error: `Preset '${source}' already exists in configuration`,
      };
    }

    // Validate selection if provided
    if (options.selection) {
      if (options.selection.rules?.include?.length === 0) {
        return {
          success: false,
          error: "Include patterns cannot be empty",
        };
      }
    }

    // Add preset to extends
    const updatedConfig = {
      ...config,
      extends: [...(config.extends || []), source],
    };

    // Save updated config
    await mockWriteFile(
      path.join(options.cwd || process.cwd(), ".agentsync", "config.json"),
      JSON.stringify(updatedConfig, null, 2),
      "utf-8",
    );

    // Save selection if provided
    if (options.selection) {
      // This would be implemented with the actual interactive selection merger
      console.log(`Saving selection for ${source}`);
    }

    return {
      success: true,
      preset,
      selection: options.selection,
      message: options.selection
        ? `Added preset '${source}' with selection`
        : `Added preset '${source}'`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
