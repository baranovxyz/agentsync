import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCodecRegistry } from "../../../src/targets/codec-registry.js";
import type { ToolCodec } from "../../../src/targets/tools/types.js";

describe("CodecRegistry - Tool Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detect", () => {
    it("detects cursor directory and returns tool info", async () => {
      const registry = getCodecRegistry();
      const testDir = path.join(process.cwd(), "tests/fixtures/tools/cursor");

      // Mock codec detect to simulate cursor detection
      const mockDetect = vi.spyOn(
        registry.get("cursor") as ToolCodec,
        "detect",
      );
      mockDetect.mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: testDir,
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 5,
        commandCount: 0,
      });

      const result = await registry.detect(testDir);

      expect(result).not.toBeNull();
      expect(result?.toolName).toBe("cursor");
      expect(result?.codec.name).toBe("cursor");

      mockDetect.mockRestore();
    });

    it("returns null if no codec detects the directory", async () => {
      const registry = getCodecRegistry();
      const emptyDir = "/non/existent/dir";

      // Mock all codecs to return null (no detection)
      const codecs = registry.getAll();
      const mocks = codecs.map((codec) =>
        vi.spyOn(codec, "detect").mockResolvedValue(null),
      );

      const result = await registry.detect(emptyDir);

      expect(result).toBeNull();

      mocks.forEach((mock) => {
        mock.mockRestore();
      });
    });

    it("returns first matching codec when multiple could match", async () => {
      const registry = getCodecRegistry();
      const testDir = "/some/path";

      // Mock first codec to match
      const cursor = registry.get("cursor") as ToolCodec;
      const cursorMock = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: testDir,
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 1,
        commandCount: 0,
      });

      const result = await registry.detect(testDir);

      expect(result?.toolName).toBe("cursor");
      expect(cursorMock).toHaveBeenCalledWith(testDir);

      cursorMock.mockRestore();
    });
  });

  describe("detectGlobal", () => {
    it("detects cursor at home directory", async () => {
      const registry = getCodecRegistry();
      const homeDir = process.env.HOME;

      if (!homeDir) {
        // Skip test if HOME not set
        expect(true).toBe(true);
        return;
      }

      // Mock cursor codec to detect global
      const cursor = registry.get("cursor") as ToolCodec;
      const mockDetect = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "global",
        toolName: "cursor",
        path: path.join(homeDir, ".cursor"),
        hasRules: true,
        hasCommands: true,
        hasMCP: true,
        ruleCount: 15,
        commandCount: 3,
      });

      const detected = await registry.detectGlobal();

      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].toolName).toBe("cursor");
      expect(detected[0].info.scope).toBe("global");

      mockDetect.mockRestore();
    });

    it("detects multiple tool directories in global scope", async () => {
      const registry = getCodecRegistry();
      const homeDir = process.env.HOME;

      if (!homeDir) {
        expect(true).toBe(true);
        return;
      }

      // Mock multiple codecs
      const cursor = registry.get("cursor") as ToolCodec;
      const claude = registry.get("claude") as ToolCodec;

      const cursorMock = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "global",
        toolName: "cursor",
        path: path.join(homeDir, ".cursor"),
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 10,
        commandCount: 0,
      });

      const claudeMock = vi.spyOn(claude, "detect").mockResolvedValue({
        scope: "global",
        toolName: "claude",
        path: path.join(homeDir, ".claude"),
        hasRules: true,
        hasCommands: true,
        hasMCP: false,
        ruleCount: 8,
        commandCount: 2,
      });

      const detected = await registry.detectGlobal();

      expect(detected.length).toBe(2);
      expect(detected.map((d) => d.toolName)).toContain("cursor");
      expect(detected.map((d) => d.toolName)).toContain("claude");
      expect(detected.every((d) => d.info.scope === "global")).toBe(true);

      cursorMock.mockRestore();
      claudeMock.mockRestore();
    });

    it("returns empty array if no tools found", async () => {
      const registry = getCodecRegistry();

      // Mock all codecs to return null
      const codecs = registry.getAll();
      const mocks = codecs.map((codec) =>
        vi.spyOn(codec, "detect").mockResolvedValue(null),
      );

      const detected = await registry.detectGlobal();

      expect(detected).toEqual([]);

      mocks.forEach((mock) => {
        mock.mockRestore();
      });
    });

    it("returns empty array if HOME not set", async () => {
      const registry = getCodecRegistry();
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      // Temporarily unset HOME and USERPROFILE
      process.env.HOME = undefined;
      process.env.USERPROFILE = undefined;

      const detected = await registry.detectGlobal();

      expect(detected).toEqual([]);

      // Restore
      if (originalHome) process.env.HOME = originalHome;
      if (originalUserProfile) process.env.USERPROFILE = originalUserProfile;
    });

    it("ignores project-scoped tools when detecting global", async () => {
      const registry = getCodecRegistry();
      const homeDir = process.env.HOME;

      if (!homeDir) {
        expect(true).toBe(true);
        return;
      }

      // Mock cursor as project scope (should be ignored)
      const cursor = registry.get("cursor") as ToolCodec;
      const mockDetect = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: ".cursor",
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 5,
        commandCount: 0,
      });

      // Mock other codecs to return null
      const claude = registry.get("claude") as ToolCodec;
      const cline = registry.get("cline") as ToolCodec;
      const roocode = registry.get("roocode") as ToolCodec;

      const claudeMock = vi.spyOn(claude, "detect").mockResolvedValue(null);
      const clineMock = vi.spyOn(cline, "detect").mockResolvedValue(null);
      const roocodeMock = vi.spyOn(roocode, "detect").mockResolvedValue(null);

      const detected = await registry.detectGlobal();

      // Should not include project-scoped
      expect(detected).toEqual([]);

      mockDetect.mockRestore();
      claudeMock.mockRestore();
      clineMock.mockRestore();
      roocodeMock.mockRestore();
    });
  });

  describe("detectProject", () => {
    it("detects cursor in project directory", async () => {
      const registry = getCodecRegistry();
      const projectDir = process.cwd();

      // Mock cursor codec to detect project scope
      const cursor = registry.get("cursor") as ToolCodec;
      const mockDetect = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: path.join(projectDir, ".cursor"),
        hasRules: true,
        hasCommands: true,
        hasMCP: false,
        ruleCount: 8,
        commandCount: 2,
      });

      const detected = await registry.detectProject(projectDir);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].toolName).toBe("cursor");
      expect(detected[0].info.scope).toBe("project");

      mockDetect.mockRestore();
    });

    it("detects multiple tool directories in project", async () => {
      const registry = getCodecRegistry();
      const projectDir = process.cwd();

      const cursor = registry.get("cursor") as ToolCodec;
      const cline = registry.get("cline") as ToolCodec;
      const claude = registry.get("claude") as ToolCodec;
      const roocode = registry.get("roocode") as ToolCodec;

      const cursorMock = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: path.join(projectDir, ".cursor"),
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 6,
        commandCount: 0,
      });

      const clineMock = vi.spyOn(cline, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cline",
        path: path.join(projectDir, ".cline"),
        hasRules: true,
        hasCommands: true,
        hasMCP: true,
        ruleCount: 4,
        commandCount: 1,
      });

      // Mock other codecs to return null
      const claudeMock = vi.spyOn(claude, "detect").mockResolvedValue(null);
      const roocodeMock = vi.spyOn(roocode, "detect").mockResolvedValue(null);

      const detected = await registry.detectProject(projectDir);

      expect(detected.length).toBe(2);
      expect(detected.map((d) => d.toolName)).toContain("cursor");
      expect(detected.map((d) => d.toolName)).toContain("cline");
      expect(detected.every((d) => d.info.scope === "project")).toBe(true);

      cursorMock.mockRestore();
      clineMock.mockRestore();
      claudeMock.mockRestore();
      roocodeMock.mockRestore();
    });

    it("returns empty array if no tools found", async () => {
      const registry = getCodecRegistry();

      // Mock all codecs to return null
      const codecs = registry.getAll();
      const mocks = codecs.map((codec) =>
        vi.spyOn(codec, "detect").mockResolvedValue(null),
      );

      const detected = await registry.detectProject(process.cwd());

      expect(detected).toEqual([]);

      mocks.forEach((mock) => {
        mock.mockRestore();
      });
    });

    it("ignores global-scoped tools when detecting project", async () => {
      const registry = getCodecRegistry();

      // Mock cursor as global scope (should be ignored)
      const cursor = registry.get("cursor") as ToolCodec;
      const mockDetect = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "global",
        toolName: "cursor",
        path: path.join(process.env.HOME || "/home/user", ".cursor"),
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 10,
        commandCount: 0,
      });

      // Mock other codecs to return null
      const claude = registry.get("claude") as ToolCodec;
      const cline = registry.get("cline") as ToolCodec;
      const roocode = registry.get("roocode") as ToolCodec;

      const claudeMock = vi.spyOn(claude, "detect").mockResolvedValue(null);
      const clineMock = vi.spyOn(cline, "detect").mockResolvedValue(null);
      const roocodeMock = vi.spyOn(roocode, "detect").mockResolvedValue(null);

      const detected = await registry.detectProject(process.cwd());

      // Should not include global-scoped
      expect(detected).toEqual([]);

      mockDetect.mockRestore();
      claudeMock.mockRestore();
      clineMock.mockRestore();
      roocodeMock.mockRestore();
    });

    it("respects custom cwd parameter", async () => {
      const registry = getCodecRegistry();
      const customCwd = "/custom/project/path";

      const cursor = registry.get("cursor") as ToolCodec;
      const mockDetect = vi.spyOn(cursor, "detect").mockResolvedValue({
        scope: "project",
        toolName: "cursor",
        path: path.join(customCwd, ".cursor"),
        hasRules: true,
        hasCommands: false,
        hasMCP: false,
        ruleCount: 3,
        commandCount: 0,
      });

      const detected = await registry.detectProject(customCwd);

      expect(mockDetect).toHaveBeenCalledWith(customCwd);
      expect(detected.length).toBeGreaterThan(0);

      mockDetect.mockRestore();
    });
  });

  describe("Registry consistency", () => {
    it("all codecs should be registered", () => {
      const registry = getCodecRegistry();
      const codecs = registry.getAll();

      expect(codecs.length).toBe(4);
      expect(codecs.map((c) => c.name)).toContain("cursor");
      expect(codecs.map((c) => c.name)).toContain("claude");
      expect(codecs.map((c) => c.name)).toContain("cline");
      expect(codecs.map((c) => c.name)).toContain("roocode");
    });

    it("can retrieve each codec by name", () => {
      const registry = getCodecRegistry();

      expect(registry.get("cursor")).not.toBeUndefined();
      expect(registry.get("claude")).not.toBeUndefined();
      expect(registry.get("cline")).not.toBeUndefined();
      expect(registry.get("roocode")).not.toBeUndefined();
    });

    it("returns undefined for unknown tool name", () => {
      const registry = getCodecRegistry();
      expect(registry.get("unknown")).toBeUndefined();
    });
  });
});
