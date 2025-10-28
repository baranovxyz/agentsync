import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemError } from "../../../../src/core/errors.js";
import { CacheManager } from "../../../../src/core/registry/cache-manager.js";
import { GitHubResolver } from "../../../../src/core/registry/github-resolver.js";
import { SourceResolver } from "../../../../src/core/registry/source-resolver.js";

// Mock dependencies
vi.mock("../../../../src/core/registry/github-resolver.js");
vi.mock("../../../../src/core/registry/cache-manager.js");
vi.mock("node:fs/promises");

describe("SourceResolver", () => {
  let sourceResolver: SourceResolver;
  let mockGitHubResolver: any;
  let mockCacheManager: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock instances
    mockGitHubResolver = {
      resolve: vi.fn(),
    };
    mockCacheManager = {
      getCachePath: vi.fn(),
      isCached: vi.fn(),
    };

    // Mock constructors
    vi.mocked(GitHubResolver).mockImplementation(() => mockGitHubResolver);
    vi.mocked(CacheManager).mockImplementation(() => mockCacheManager);

    // Create source resolver instance
    sourceResolver = new SourceResolver(mockCacheManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolve", () => {
    it("resolves GitHub sources", async () => {
      const source = "github:company/standards";
      const expectedPath = "/cache/github-company-standards";

      mockGitHubResolver.resolve.mockResolvedValue(expectedPath);

      const result = await sourceResolver.resolve(source);

      expect(result).toBe(expectedPath);
      expect(mockGitHubResolver.resolve).toHaveBeenCalledWith(
        source,
        undefined,
      );
    });

    it("resolves GitHub sources with update option", async () => {
      const source = "github:company/standards";
      const expectedPath = "/cache/github-company-standards";
      const options = { pull: true };

      mockGitHubResolver.resolve.mockResolvedValue(expectedPath);

      const result = await sourceResolver.resolve(source, options);

      expect(result).toBe(expectedPath);
      expect(mockGitHubResolver.resolve).toHaveBeenCalledWith(source, options);
    });

    it("resolves absolute filesystem paths", async () => {
      const source = "/absolute/path/to/preset";
      const expectedPath = "/absolute/path/to/preset";

      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await sourceResolver.resolve(source);

      expect(result).toBe(expectedPath);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
    });

    it("resolves relative filesystem paths", async () => {
      const source = "./relative/path/to/preset";
      const expectedPath = path.resolve(process.cwd(), source);

      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await sourceResolver.resolve(source);

      expect(result).toBe(expectedPath);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
    });

    it("resolves relative filesystem paths without leading dot", async () => {
      const source = "relative/path/to/preset";
      const expectedPath = path.resolve(process.cwd(), source);

      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await sourceResolver.resolve(source);

      expect(result).toBe(expectedPath);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
    });

    it("throws error for invalid GitHub source format", async () => {
      const source = "github:invalid-format";

      mockGitHubResolver.resolve.mockRejectedValue(
        new Error("Invalid GitHub source"),
      );

      await expect(sourceResolver.resolve(source)).rejects.toThrow(
        "Invalid GitHub source",
      );
    });

    it("throws error for non-existent filesystem path", async () => {
      const source = "/non/existent/path";

      vi.mocked(fs.access).mockRejectedValue(
        new Error("ENOENT: no such file or directory"),
      );

      await expect(sourceResolver.resolve(source)).rejects.toThrow(
        FileSystemError,
      );
    });

    it("throws error for unsupported source type", async () => {
      const source = "http://example.com/preset";

      await expect(sourceResolver.resolve(source)).rejects.toThrow(
        "Invalid source format",
      );
    });
  });

  describe("validateSource", () => {
    it("validates GitHub source format", () => {
      const validGitHubSources = [
        "github:company/standards",
        "github:company/standards@main",
        "github:acme-corp/backend-rules",
      ];

      validGitHubSources.forEach((source) => {
        expect(() => sourceResolver.validateSource(source)).not.toThrow();
      });
    });

    it("validates absolute filesystem paths", () => {
      const validPaths = [
        "/absolute/path/to/preset",
        "/home/user/preset",
        // Windows paths would be handled differently
      ];

      validPaths.forEach((source) => {
        expect(() => sourceResolver.validateSource(source)).not.toThrow();
      });
    });

    it("validates relative filesystem paths", () => {
      const validPaths = ["./relative/path", "relative/path", "../parent/path"];

      validPaths.forEach((source) => {
        expect(() => sourceResolver.validateSource(source)).not.toThrow();
      });
    });

    it("rejects unsupported source types", () => {
      const invalidSources = [
        "http://example.com/preset",
        "https://example.com/preset",
        "git@github.com:company/repo.git",
      ];

      invalidSources.forEach((source) => {
        expect(() => sourceResolver.validateSource(source)).toThrow();
      });

      // Empty string should also throw
      expect(() => sourceResolver.validateSource("")).toThrow();
    });
  });

  describe("getSourceType", () => {
    it("identifies GitHub sources", () => {
      const githubSources = [
        "github:company/standards",
        "github:company/standards@main",
      ];

      githubSources.forEach((source) => {
        expect(sourceResolver.getSourceType(source)).toBe("github");
      });
    });

    it("identifies filesystem sources", () => {
      const filesystemSources = [
        "/absolute/path",
        "./relative/path",
        "relative/path",
        "../parent/path",
      ];

      filesystemSources.forEach((source) => {
        expect(sourceResolver.getSourceType(source)).toBe("filesystem");
      });
    });

    it("returns unknown for unsupported sources", () => {
      const unsupportedSources = [
        "http://example.com/preset",
        "https://example.com/preset",
        "git@github.com:company/repo.git",
      ];

      unsupportedSources.forEach((source) => {
        expect(sourceResolver.getSourceType(source)).toBe("unknown");
      });
    });
  });
});
