/**
 * Tests for error handling in source resolution
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SourceResolver } from "../../../src/core/registry/source-resolver.js";
import {
  SourceResolutionError,
  ValidationError,
  FileSystemError,
  ErrorCategory,
  ErrorSeverity,
} from "../../../src/core/errors.js";

// Mock dependencies
vi.mock("../../../src/core/registry/github-resolver.js", () => ({
  GitHubResolver: vi.fn(() => ({
    resolve: vi.fn(),
  })),
}));

vi.mock("../../../src/core/registry/cache-manager.js", () => ({
  CacheManager: vi.fn(() => ({
    getCachePath: vi.fn(),
    isCached: vi.fn(),
    getCachedPath: vi.fn(),
    setCached: vi.fn(),
  })),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

describe("SourceResolver error handling", () => {
  let sourceResolver: SourceResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    sourceResolver = new SourceResolver();
  });

  describe("validateSource", () => {
    it("should throw ValidationError for empty source", () => {
      expect(() => sourceResolver.validateSource("")).toThrow(ValidationError);
      expect(() => sourceResolver.validateSource(null as any)).toThrow(
        ValidationError
      );
      expect(() => sourceResolver.validateSource(undefined as any)).toThrow(
        ValidationError
      );
    });

    it("should throw ValidationError for invalid source format", () => {
      expect(() => sourceResolver.validateSource("invalid:format")).toThrow(
        ValidationError
      );
      expect(() => sourceResolver.validateSource("http://example.com")).toThrow(
        ValidationError
      );
      expect(() =>
        sourceResolver.validateSource("git@github.com:org/repo")
      ).toThrow(ValidationError);
    });

    it("should throw ValidationError for invalid GitHub source format", () => {
      expect(() => sourceResolver.validateSource("github:org")).toThrow(
        ValidationError
      );
      expect(() =>
        sourceResolver.validateSource("github:org/repo/extra")
      ).toThrow(ValidationError);
      expect(() =>
        sourceResolver.validateSource("github:org/repo@invalid@ref")
      ).toThrow(ValidationError);
    });

    it("should not throw for valid sources", () => {
      expect(() =>
        sourceResolver.validateSource("github:org/repo")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("github:org/repo@v1.0")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("/absolute/path")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("./relative/path")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("../parent/path")
      ).not.toThrow();
    });
  });

  describe("getSourceType", () => {
    it("should correctly identify GitHub sources", () => {
      expect(sourceResolver.getSourceType("github:org/repo")).toBe("github");
      expect(sourceResolver.getSourceType("github:org/repo@v1.0")).toBe(
        "github"
      );
    });

    it("should correctly identify filesystem sources", () => {
      expect(sourceResolver.getSourceType("/absolute/path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("./relative/path")).toBe(
        "filesystem"
      );
      expect(sourceResolver.getSourceType("../parent/path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("simple-relative")).toBe(
        "filesystem"
      );
    });

    it("should return unknown for invalid sources", () => {
      expect(sourceResolver.getSourceType("")).toBe("unknown");
      expect(sourceResolver.getSourceType("http://example.com")).toBe(
        "unknown"
      );
      expect(sourceResolver.getSourceType("invalid:format")).toBe("unknown");
    });
  });

  describe("resolve", () => {
    it("should throw SourceResolutionError for invalid sources", async () => {
      await expect(sourceResolver.resolve("invalid:source")).rejects.toThrow(
        SourceResolutionError
      );
    });

    it("should throw SourceResolutionError for GitHub resolution failures", async () => {
      const { GitHubResolver } = await import(
        "../../../src/core/registry/github-resolver.js"
      );

      const mockError = new Error("Network error");
      vi.mocked(GitHubResolver).mockImplementation(
        () =>
          ({
            resolve: vi.fn().mockRejectedValue(mockError),
          }) as any
      );

      await expect(sourceResolver.resolve("github:org/repo")).rejects.toThrow(
        SourceResolutionError
      );
    });

    it("should throw FileSystemError for filesystem access failures", async () => {
      const { access } = await import("node:fs/promises");
      vi.mocked(access).mockRejectedValue(new Error("Permission denied"));

      await expect(sourceResolver.resolve("/nonexistent/path")).rejects.toThrow(
        FileSystemError
      );
    });

    it("should wrap original errors in SourceResolutionError", async () => {
      const { GitHubResolver } = await import(
        "../../../src/core/registry/github-resolver.js"
      );

      const originalError = new Error("Original network error");
      vi.mocked(GitHubResolver).mockImplementation(
        () =>
          ({
            resolve: vi.fn().mockRejectedValue(originalError),
          }) as any
      );

      try {
        await sourceResolver.resolve("github:org/repo");
      } catch (error) {
        expect(error).toBeInstanceOf(SourceResolutionError);
        if (error instanceof SourceResolutionError) {
          expect(error.originalError).toBe(originalError);
          expect(error.metadata.context?.source).toBe("github:org/repo");
        }
      }
    });
  });

  describe("error context and metadata", () => {
    it("should include source in error context", async () => {
      try {
        sourceResolver.validateSource("invalid:source");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.metadata.category).toBe(ErrorCategory.VALIDATION);
          expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
        }
      }
    });

    it("should provide user-friendly error messages", async () => {
      try {
        sourceResolver.validateSource("invalid:source");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          const userMessage = error.getUserMessage();
          expect(userMessage).toContain("Invalid source format");
          expect(userMessage).toContain("💡 Suggestion:");
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace-only sources", () => {
      expect(() => sourceResolver.validateSource("   ")).toThrow(
        ValidationError
      );
      expect(() => sourceResolver.validateSource("\n\t")).toThrow(
        ValidationError
      );
    });

    it("should handle special characters in paths", () => {
      expect(() =>
        sourceResolver.validateSource("./path with spaces")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("./path-with-dashes")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("./path_with_underscores")
      ).not.toThrow();
    });

    it("should reject sources with protocols", () => {
      expect(() => sourceResolver.validateSource("ftp://example.com")).toThrow(
        ValidationError
      );
      expect(() => sourceResolver.validateSource("ssh://example.com")).toThrow(
        ValidationError
      );
      expect(() =>
        sourceResolver.validateSource("https://example.com")
      ).toThrow(ValidationError);
    });

    it("should handle complex GitHub references", () => {
      expect(() =>
        sourceResolver.validateSource("github:org/repo@v1.2.3")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("github:org/repo@feature-branch")
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("github:org/repo@commit_hash")
      ).not.toThrow();
    });
  });
});
