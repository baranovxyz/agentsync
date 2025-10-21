/**
 * Tests for preset list command with selection information
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listPresets } from "../../../../src/commands/preset/list.js";
import {
  validateConfig,
  normalizeExtends,
} from "../../../../src/types/schemas.js";
import { CacheManager } from "../../../../src/core/registry/cache-manager.js";
import { GitHubSourceParser } from "../../../../src/core/registry/github-source.js";
import { readFile } from "node:fs/promises";
import * as path from "path";
import type { PresetSelection } from "../../../../src/types/index.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../../../src/types/schemas.js");
vi.mock("../../../../src/core/registry/cache-manager.js");
vi.mock("../../../../src/core/registry/github-source.js");

const mockReadFile = vi.mocked(readFile);
const mockValidateConfig = vi.mocked(validateConfig);
const mockNormalizeExtends = vi.mocked(normalizeExtends);
const mockCacheManager = vi.mocked(CacheManager);
const mockGitHubSourceParser = vi.mocked(GitHubSourceParser);

describe("preset list command with selection information", () => {
  const mockCwd = "/test/project";
  const mockConfigPath = path.join(mockCwd, ".agentsync", "config.json");
  const mockConfig = {
    version: "1.0",
    extends: ["github:company/standards", "github:team/rules"],
    tools: ["cursor", "claude"] as ("cursor" | "claude")[],
    useSymlinks: true,
  };

  const mockExtendsEntries = [
    {
      source: "github:company/standards",
      namespace: "company",
      include: ["*.md"],
      exclude: ["test.md"],
    },
    {
      source: "github:team/rules",
      namespace: "team",
    },
  ];

  const mockSelections: Record<string, PresetSelection> = {
    "github:company/standards": {
      rules: { include: ["*.md"], exclude: ["test.md"] },
      commands: { include: ["*.md"] },
      mcps: ["github"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
    mockValidateConfig.mockReturnValue(mockConfig);
    mockNormalizeExtends.mockReturnValue(mockExtendsEntries);

    // Mock CacheManager
    const mockCacheManagerInstance = {
      getCacheMetadata: vi.fn(),
    };
    mockCacheManager.mockImplementation(() => mockCacheManagerInstance as any);

    // Mock GitHubSourceParser
    const mockGitHubSourceParserInstance = {
      parse: vi.fn(),
    };
    mockGitHubSourceParser.mockImplementation(
      () => mockGitHubSourceParserInstance as any
    );

    // Mock console.log to capture output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should display selection information when selections are available", async () => {
    const mockCacheManagerInstance = new (mockCacheManager as any)();
    const mockGitHubSourceParserInstance =
      new (mockGitHubSourceParser as any)();

    mockCacheManagerInstance.getCacheMetadata.mockResolvedValue({
      exists: true,
      size: 1024,
      lastUpdated: new Date(),
    });

    mockGitHubSourceParserInstance.parse.mockReturnValue({
      owner: "company",
      repo: "standards",
    });

    // Mock the interactive selection config loading
    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        loadSelectionsForProject: vi.fn().mockResolvedValue(mockSelections),
      })
    );

    await listPresets();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("📚 Extended Presets")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Namespace: company")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Include: *.md")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Exclude: test.md")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Selections:")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Rules: *.md (exclude: test.md)")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Commands: *.md")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("MCPs: github")
    );
  });

  it("should display no selections message when no selections exist", async () => {
    const mockCacheManagerInstance = new (mockCacheManager as any)();
    const mockGitHubSourceParserInstance =
      new (mockGitHubSourceParser as any)();

    mockCacheManagerInstance.getCacheMetadata.mockResolvedValue({
      exists: true,
      size: 1024,
      lastUpdated: new Date(),
    });

    mockGitHubSourceParserInstance.parse.mockReturnValue({
      owner: "company",
      repo: "standards",
    });

    // Mock empty selections
    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        loadSelectionsForProject: vi.fn().mockResolvedValue({}),
      })
    );

    await listPresets();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("📚 Extended Presets")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Selections:")
    );
  });

  it("should maintain backward compatibility when no selections config exists", async () => {
    const mockCacheManagerInstance = new (mockCacheManager as any)();
    const mockGitHubSourceParserInstance =
      new (mockGitHubSourceParser as any)();

    mockCacheManagerInstance.getCacheMetadata.mockResolvedValue({
      exists: true,
      size: 1024,
      lastUpdated: new Date(),
    });

    mockGitHubSourceParserInstance.parse.mockReturnValue({
      owner: "company",
      repo: "standards",
    });

    // Mock error loading selections (file doesn't exist)
    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        loadSelectionsForProject: vi
          .fn()
          .mockRejectedValue(new Error("File not found")),
      })
    );

    await listPresets();

    // Should still work without selections
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("📚 Extended Presets")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Selections:")
    );
  });

  it("should display partial selection information", async () => {
    const partialSelections: Record<string, PresetSelection> = {
      "github:company/standards": {
        rules: { include: ["*.md"] },
        // No commands or mcps
      },
    };

    const mockCacheManagerInstance = new (mockCacheManager as any)();
    const mockGitHubSourceParserInstance =
      new (mockGitHubSourceParser as any)();

    mockCacheManagerInstance.getCacheMetadata.mockResolvedValue({
      exists: true,
      size: 1024,
      lastUpdated: new Date(),
    });

    mockGitHubSourceParserInstance.parse.mockReturnValue({
      owner: "company",
      repo: "standards",
    });

    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        loadSelectionsForProject: vi.fn().mockResolvedValue(partialSelections),
      })
    );

    await listPresets();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Selections:")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Rules: *.md")
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Commands:")
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("MCPs:")
    );
  });

  it("should handle multiple presets with different selection configurations", async () => {
    const multipleSelections: Record<string, PresetSelection> = {
      "github:company/standards": {
        rules: { include: ["*.md"] },
        commands: { include: ["*.md"] },
      },
      "github:team/rules": {
        mcps: ["github", "filesystem"],
      },
    };

    const mockCacheManagerInstance = new (mockCacheManager as any)();
    const mockGitHubSourceParserInstance =
      new (mockGitHubSourceParser as any)();

    mockCacheManagerInstance.getCacheMetadata.mockResolvedValue({
      exists: true,
      size: 1024,
      lastUpdated: new Date(),
    });

    mockGitHubSourceParserInstance.parse.mockReturnValue({
      owner: "company",
      repo: "standards",
    });

    vi.doMock(
      "../../../../src/core/config/interactive-selection-merger.js",
      () => ({
        loadSelectionsForProject: vi.fn().mockResolvedValue(multipleSelections),
      })
    );

    await listPresets();

    // First preset should show rules and commands
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Rules: *.md")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Commands: *.md")
    );

    // Second preset should show only MCPs
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("github:team/rules")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("MCPs: github, filesystem")
    );
  });
});
