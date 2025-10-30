import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubResolver } from "../../../../src/core/registry/github-resolver.js";
import type { GitHubSourceParser } from "../../../../src/core/registry/github-source.js";
import { GitHubSourcePlugin } from "../../../../src/core/registry/github-source-plugin.js";

vi.mock("../../../../src/core/registry/github-resolver.js");
vi.mock("../../../../src/core/registry/github-source.js");

interface MockFunction<T = unknown> {
  (...args: unknown[]): T;
  mockReturnValue(value: T): this;
  mockImplementation(fn: (...args: unknown[]) => T): this;
  mockResolvedValue(value: T): this;
}

interface MockResolver {
  resolve: MockFunction<Promise<string>>;
}

interface MockParser {
  parse: MockFunction;
  toCacheKey: MockFunction<string>;
}

describe("GitHubSourcePlugin", () => {
  let mockResolver: MockResolver;
  let mockParser: MockParser;
  let plugin: GitHubSourcePlugin;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResolver = {
      resolve: vi.fn(),
    } as unknown as MockResolver;

    mockParser = {
      parse: vi.fn(),
      toCacheKey: vi.fn(),
    } as unknown as MockParser;

    plugin = new GitHubSourcePlugin(
      mockResolver as unknown as GitHubResolver,
      mockParser as unknown as GitHubSourceParser,
    );
  });

  describe("getType", () => {
    it("returns github as type", () => {
      expect(plugin.getType()).toBe("github");
    });
  });

  describe("canHandle", () => {
    it("returns true for github: prefixed sources", () => {
      expect(plugin.canHandle("github:company/repo")).toBe(true);
      expect(plugin.canHandle("github:org/standards@main")).toBe(true);
    });

    it("returns false for non-github sources", () => {
      expect(plugin.canHandle("fs:./path")).toBe(false);
      expect(plugin.canHandle("/absolute/path")).toBe(false);
      expect(plugin.canHandle("./relative/path")).toBe(false);
      expect(plugin.canHandle("http://example.com")).toBe(false);
    });
  });

  describe("validate", () => {
    it("delegates validation to parser", () => {
      const source = "github:company/repo";
      (mockParser.parse as unknown as MockFunction).mockReturnValue({
        org: "company",
        repo: "repo",
        ref: "main",
      });

      plugin.validate(source);

      expect(mockParser.parse).toHaveBeenCalledWith(source);
    });

    it("throws error when parser throws", () => {
      const source = "github:invalid";
      (mockParser.parse as unknown as MockFunction).mockImplementation(() => {
        throw new Error("Invalid GitHub source format");
      });

      expect(() => plugin.validate(source)).toThrow(
        "Invalid GitHub source format",
      );
    });
  });

  describe("resolve", () => {
    it("delegates resolution to GitHub resolver", async () => {
      const source = "github:company/repo";
      const expectedPath = "/cache/github-company-repo";
      (mockResolver.resolve as unknown as MockFunction).mockResolvedValue(
        expectedPath,
      );

      const result = await plugin.resolve(source);

      expect(result).toBe(expectedPath);
      expect(mockResolver.resolve).toHaveBeenCalledWith(source, undefined);
    });

    it("passes options to resolver", async () => {
      const source = "github:company/repo";
      const options = { pull: true };
      const expectedPath = "/cache/github-company-repo";
      (mockResolver.resolve as unknown as MockFunction).mockResolvedValue(
        expectedPath,
      );

      await plugin.resolve(source, options);

      expect(mockResolver.resolve).toHaveBeenCalledWith(source, options);
    });
  });

  describe("getCacheKey", () => {
    it("generates cache key using parser", () => {
      const source = "github:company/repo";
      const parsed = { org: "company", repo: "repo", ref: "main" };
      (mockParser.parse as unknown as MockFunction).mockReturnValue(parsed);
      (mockParser.toCacheKey as unknown as MockFunction).mockReturnValue(
        "github-company-repo",
      );

      const cacheKey = plugin.getCacheKey(source);

      expect(cacheKey).toBe("github-company-repo");
      expect(mockParser.parse).toHaveBeenCalledWith(source);
      expect(mockParser.toCacheKey).toHaveBeenCalledWith(parsed);
    });
  });
});
