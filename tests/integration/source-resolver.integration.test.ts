import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemError } from "../../src/core/errors.js";
import { SourceResolver } from "../../src/core/registry/source-resolver.js";

describe("SourceResolver Integration", () => {
  let sourceResolver: SourceResolver;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), "temp-test-dir");
    await fs.mkdir(tempDir, { recursive: true });

    // Create a test file
    await fs.writeFile(path.join(tempDir, "test-preset.md"), "# Test Preset");

    sourceResolver = new SourceResolver();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe("Filesystem Resolution", () => {
    it("resolves absolute paths to existing files", async () => {
      const source = path.join(tempDir, "test-preset.md");
      const resolved = await sourceResolver.resolve(source);

      expect(resolved).toBe(source);
    });

    it("resolves relative paths to existing files", async () => {
      const source = "./temp-test-dir/test-preset.md";
      const expected = path.resolve(process.cwd(), source);
      const resolved = await sourceResolver.resolve(source);

      expect(resolved).toBe(expected);
    });

    it("resolves paths to existing directories", async () => {
      const resolved = await sourceResolver.resolve(tempDir);
      expect(resolved).toBe(tempDir);
    });

    it("throws error for non-existent paths", async () => {
      const source = path.join(tempDir, "non-existent.md");

      await expect(sourceResolver.resolve(source)).rejects.toThrow(
        FileSystemError,
      );
    });
  });

  describe("Source Type Detection", () => {
    it("correctly identifies different source types", () => {
      expect(sourceResolver.getSourceType("github:org/repo")).toBe("github");
      expect(sourceResolver.getSourceType("github:org/repo@main")).toBe(
        "github",
      );
      expect(sourceResolver.getSourceType("/absolute/path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("./relative/path")).toBe(
        "filesystem",
      );
      expect(sourceResolver.getSourceType("relative/path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("http://example.com")).toBe(
        "unknown",
      );
      expect(sourceResolver.getSourceType("https://example.com")).toBe(
        "unknown",
      );
      expect(sourceResolver.getSourceType("git@github.com:org/repo.git")).toBe(
        "unknown",
      );
    });

    it("validates source formats correctly", () => {
      // Valid sources should not throw
      expect(() =>
        sourceResolver.validateSource("github:org/repo"),
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("/absolute/path"),
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("./relative/path"),
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("relative/path"),
      ).not.toThrow();

      // Invalid sources should throw
      expect(() =>
        sourceResolver.validateSource("http://example.com"),
      ).toThrow();
      expect(() => sourceResolver.validateSource("")).toThrow();
    });
  });

  describe("GitHub Source Integration", () => {
    it("validates GitHub source format", () => {
      // Valid GitHub sources
      expect(() =>
        sourceResolver.validateSource("github:company/standards"),
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("github:company/standards@main"),
      ).not.toThrow();
      expect(() =>
        sourceResolver.validateSource("github:acme-corp/backend-rules"),
      ).not.toThrow();

      // Invalid GitHub sources
      expect(() => sourceResolver.validateSource("github:invalid")).toThrow();

      // This one should fail because only @main is supported in v0.3.0-beta
      try {
        sourceResolver.validateSource("github:org/repo@v1.0");
        expect.fail("Should have thrown an error for @v1.0");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      expect(() =>
        sourceResolver.validateSource("github:org/repo/extra"),
      ).toThrow();
    });

    it("identifies GitHub sources correctly", () => {
      expect(sourceResolver.isGitHubSource("github:org/repo")).toBe(true);
      expect(sourceResolver.isGitHubSource("github:org/repo@main")).toBe(true);
      expect(sourceResolver.isGitHubSource("/absolute/path")).toBe(false);
      expect(sourceResolver.isGitHubSource("./relative/path")).toBe(false);
      expect(sourceResolver.isGitHubSource("http://example.com")).toBe(false);
    });
  });

  describe("Filesystem Source Integration", () => {
    it("identifies filesystem sources correctly", () => {
      expect(sourceResolver.isFilesystemSource("/absolute/path")).toBe(true);
      expect(sourceResolver.isFilesystemSource("./relative/path")).toBe(true);
      expect(sourceResolver.isFilesystemSource("relative/path")).toBe(true);
      expect(sourceResolver.isFilesystemSource("../parent/path")).toBe(true);
      expect(sourceResolver.isFilesystemSource("github:org/repo")).toBe(false);
      expect(sourceResolver.isFilesystemSource("http://example.com")).toBe(
        false,
      );
      expect(sourceResolver.isFilesystemSource("")).toBe(false);
    });

    it("handles edge cases for filesystem detection", () => {
      // Paths with spaces should be considered filesystem paths
      expect(sourceResolver.isFilesystemSource("path with spaces")).toBe(false); // Contains spaces, so invalid

      // Empty and whitespace-only strings should not be filesystem sources
      expect(sourceResolver.isFilesystemSource("")).toBe(false);
      expect(sourceResolver.isFilesystemSource("   ")).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("provides clear error messages for invalid sources", async () => {
      try {
        await sourceResolver.resolve("http://invalid-source");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Invalid source format");
      }
    });

    it("handles filesystem access errors gracefully", async () => {
      const nonExistentPath = "/path/that/does/not/exist";

      try {
        await sourceResolver.resolve(nonExistentPath);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(FileSystemError);
        expect((error as FileSystemError).message).toContain("not accessible");
      }
    });
  });
});
