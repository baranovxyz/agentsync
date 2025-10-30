import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceResolutionError } from "../../../../src/core/errors.js";
import { SourceResolver } from "../../../../src/core/registry/source-resolver.js";
import * as fsUtils from "../../../../src/utils/fs.js";

vi.mock("node:fs/promises");
vi.mock("../../../../src/utils/fs.js", () => ({
  pathExists: vi.fn(),
}));

type MockStats = Partial<Awaited<ReturnType<typeof fs.stat>>>;

describe("SourceResolver", () => {
  let sourceResolver: SourceResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    sourceResolver = new SourceResolver();
  });

  describe("resolve", () => {
    describe("GitHub sources", () => {
      it("resolves github: sources", async () => {
        // GitHub resolution is tested through integration
        // The SourceResolver delegates to the GitHubSourcePlugin
        // which delegates to the GitHubResolver
        expect(() => {
          sourceResolver.validateSource("github:company/repo");
        }).not.toThrow();
      });
    });

    describe("filesystem sources", () => {
      it("resolves fs: prefixed paths", async () => {
        const source = "fs:./local-presets";
        const expectedPath = path.resolve(process.cwd(), "./local-presets");

        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.stat).mockResolvedValue({
          isDirectory: () => true,
        } as MockStats);
        vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

        const result = await sourceResolver.resolve(source);

        expect(result).toBe(expectedPath);
      });

      it("resolves absolute paths", async () => {
        const source = "/absolute/path/to/preset";

        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.stat).mockResolvedValue({
          isDirectory: () => true,
        } as MockStats);
        vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

        const result = await sourceResolver.resolve(source);

        expect(result).toBe(source);
      });

      it("resolves relative paths", async () => {
        const source = "./relative/path";
        const expectedPath = path.resolve(process.cwd(), source);

        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.stat).mockResolvedValue({
          isDirectory: () => true,
        } as MockStats);
        vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

        const result = await sourceResolver.resolve(source);

        expect(result).toBe(expectedPath);
      });
    });
  });

  describe("validateSource", () => {
    it("validates GitHub sources", () => {
      expect(() => {
        sourceResolver.validateSource("github:company/repo");
      }).not.toThrow();

      expect(() => {
        sourceResolver.validateSource("github:org/repo@main");
      }).not.toThrow();

      // v0.3.0-beta only supports @main
      expect(() => {
        sourceResolver.validateSource("github:org/repo@v1.0.0");
      }).toThrow(/not supported in v0.3.0-beta/);
    });

    it("validates filesystem sources", () => {
      expect(() => {
        sourceResolver.validateSource("fs:./path");
      }).not.toThrow();

      expect(() => {
        sourceResolver.validateSource("/absolute/path");
      }).not.toThrow();

      expect(() => {
        sourceResolver.validateSource("./relative/path");
      }).not.toThrow();
    });

    it("throws error for invalid sources", () => {
      expect(() => {
        sourceResolver.validateSource("invalid:source");
      }).toThrow(SourceResolutionError);

      expect(() => {
        sourceResolver.validateSource("http://example.com");
      }).toThrow(SourceResolutionError);
    });
  });

  describe("getSourceType", () => {
    it("identifies GitHub sources", () => {
      expect(sourceResolver.getSourceType("github:company/repo")).toBe(
        "github",
      );
    });

    it("identifies filesystem sources", () => {
      expect(sourceResolver.getSourceType("fs:./path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("/absolute/path")).toBe("filesystem");
      expect(sourceResolver.getSourceType("./relative/path")).toBe(
        "filesystem",
      );
      expect(sourceResolver.getSourceType("relative/path")).toBe("filesystem");
    });

    it("returns unknown for unsupported sources", () => {
      expect(sourceResolver.getSourceType("http://example.com")).toBe(
        "unknown",
      );
      expect(sourceResolver.getSourceType("git@github.com:org/repo.git")).toBe(
        "unknown",
      );
    });
  });
});
