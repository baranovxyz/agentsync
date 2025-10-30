import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileSystemError,
  ValidationError,
} from "../../../../src/core/errors.js";
import { FilesystemSourcePlugin } from "../../../../src/core/registry/filesystem-source-plugin.js";
import * as fsUtils from "../../../../src/utils/fs.js";

vi.mock("node:fs/promises");
vi.mock("../../../../src/utils/fs.js", () => ({
  pathExists: vi.fn(),
}));

type MockStats = Partial<Awaited<ReturnType<typeof fs.stat>>>;

describe("FilesystemSourcePlugin", () => {
  let plugin: FilesystemSourcePlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = new FilesystemSourcePlugin();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getType", () => {
    it("returns filesystem as type", () => {
      expect(plugin.getType()).toBe("filesystem");
    });
  });

  describe("canHandle", () => {
    it("returns true for fs: prefixed sources", () => {
      expect(plugin.canHandle("fs:./path")).toBe(true);
      expect(plugin.canHandle("fs:/absolute/path")).toBe(true);
      expect(plugin.canHandle("fs:relative/path")).toBe(true);
    });

    it("returns true for absolute paths", () => {
      expect(plugin.canHandle("/absolute/path")).toBe(true);
      expect(plugin.canHandle("/home/user/presets")).toBe(true);
    });

    it("returns true for relative paths with dot", () => {
      expect(plugin.canHandle("./relative/path")).toBe(true);
      expect(plugin.canHandle("../parent/path")).toBe(true);
    });

    it("returns true for simple relative paths", () => {
      expect(plugin.canHandle("relative/path")).toBe(true);
      expect(plugin.canHandle("presets")).toBe(true);
    });

    it("returns false for empty or whitespace-only strings", () => {
      expect(plugin.canHandle("")).toBe(false);
      expect(plugin.canHandle("   ")).toBe(false);
    });

    it("returns false for URL-like patterns", () => {
      expect(plugin.canHandle("http://example.com")).toBe(false);
      expect(plugin.canHandle("https://example.com/path")).toBe(false);
      expect(plugin.canHandle("ftp://server.com")).toBe(false);
      expect(plugin.canHandle("git@github.com:org/repo.git")).toBe(false);
    });

    it("returns false for github: sources", () => {
      expect(plugin.canHandle("github:company/repo")).toBe(false);
    });

    it("returns false for sources with spaces", () => {
      expect(plugin.canHandle("path with spaces")).toBe(false);
    });
  });

  describe("validate", () => {
    it("validates fs: prefixed paths", () => {
      expect(() => plugin.validate("fs:./path")).not.toThrow();
      expect(() => plugin.validate("fs:/absolute/path")).not.toThrow();
    });

    it("validates absolute paths", () => {
      expect(() => plugin.validate("/absolute/path")).not.toThrow();
    });

    it("validates relative paths", () => {
      expect(() => plugin.validate("./relative/path")).not.toThrow();
      expect(() => plugin.validate("../parent/path")).not.toThrow();
      expect(() => plugin.validate("relative/path")).not.toThrow();
    });

    it("throws error for path traversal attempts in middle of path", () => {
      expect(() => plugin.validate("/path/../../../etc/passwd")).toThrow(
        ValidationError,
      );
      expect(() => plugin.validate("./path/../../../etc/passwd")).toThrow(
        ValidationError,
      );
    });

    it("allows path traversal at start (../)", () => {
      expect(() => plugin.validate("../parent/path")).not.toThrow();
      expect(() => plugin.validate("../../grandparent")).not.toThrow();
    });

    it("throws error for empty path after cleaning", () => {
      expect(() => plugin.validate("fs:")).toThrow(ValidationError);
    });
  });

  describe("resolve", () => {
    it("resolves fs: prefixed paths", async () => {
      const source = "fs:./local-presets";
      const expectedPath = path.resolve(process.cwd(), "./local-presets");

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

      const result = await plugin.resolve(source);

      expect(result).toBe(expectedPath);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
    });

    it("resolves absolute paths", async () => {
      const source = "/absolute/path/to/preset";

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

      const result = await plugin.resolve(source);

      expect(result).toBe(source);
      expect(fs.access).toHaveBeenCalledWith(source);
    });

    it("resolves relative paths against cwd", async () => {
      const source = "./relative/path";
      const expectedPath = path.resolve(process.cwd(), source);

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

      const result = await plugin.resolve(source);

      expect(result).toBe(expectedPath);
    });

    it("resolves relative paths against custom cwd", async () => {
      const source = "./relative/path";
      const customCwd = "/custom/working/dir";
      const expectedPath = path.resolve(customCwd, source);

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockResolvedValue(true);

      const result = await plugin.resolve(source, { cwd: customCwd });

      expect(result).toBe(expectedPath);
    });

    it("throws error for non-existent path", async () => {
      const source = "/non/existent/path";

      vi.mocked(fs.access).mockRejectedValue(
        new Error("ENOENT: no such file or directory"),
      );

      await expect(plugin.resolve(source)).rejects.toThrow(FileSystemError);
      await expect(plugin.resolve(source)).rejects.toThrow(
        "Filesystem source not accessible",
      );
    });

    it("throws error when path is not a directory", async () => {
      const source = "/path/to/file.txt";

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
      } as MockStats);

      await expect(plugin.resolve(source)).rejects.toThrow(FileSystemError);
      await expect(plugin.resolve(source)).rejects.toThrow(
        "Filesystem source must be a directory",
      );
    });

    it("warns when preset structure is missing", async () => {
      const source = "./empty-preset";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockResolvedValue(false);

      await plugin.resolve(source);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("has no rules/, commands/, or mcp.json"),
      );

      consoleWarnSpy.mockRestore();
    });

    it("does not warn when rules/ exists", async () => {
      const source = "./preset-with-rules";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockImplementation(async (p: string) => {
        return p.endsWith("rules");
      });

      await plugin.resolve(source);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("does not warn when commands/ exists", async () => {
      const source = "./preset-with-commands";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockImplementation(async (p: string) => {
        return p.endsWith("commands");
      });

      await plugin.resolve(source);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("does not warn when mcp.json exists", async () => {
      const source = "./preset-with-mcp";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as MockStats);
      vi.mocked(fsUtils.pathExists).mockImplementation(async (p: string) => {
        return p.endsWith("mcp.json");
      });

      await plugin.resolve(source);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
