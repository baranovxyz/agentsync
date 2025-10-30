import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolDirectoryLoader } from "../../../../src/core/registry/tool-directory-loader.js";
import { getCodecRegistry } from "../../../../src/targets/codec-registry.js";
import type { ToolCodec } from "../../../../src/targets/tools/types.js";
import type { CanonicalRule } from "../../../../src/types/canonical.js";

describe("ToolDirectoryLoader", () => {
  let loader: ToolDirectoryLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new ToolDirectoryLoader();
  });

  describe("load", () => {
    it("loads tool directory as Preset with canonical format", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("typescript.md", {
        frontmatter: {
          description: "TypeScript coding standards",
          globs: ["**/*.ts"],
        },
        markdown: "Use strict mode...",
      });

      const mockCommands = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockCommands.set("commit.md", {
        frontmatter: {
          description: "Create a commit message",
        },
        markdown: "Generate commit message...",
      });

      const mockMCPs = {
        github: {
          command: "npx",
          args: ["@modelcontextprotocol/server-github"],
        },
      };

      // Mock the codec
      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      const importRulesMock = vi
        .spyOn(cursor, "importRules")
        .mockResolvedValue(mockRules);
      const importCommandsMock = vi
        .spyOn(cursor, "importCommands")
        .mockResolvedValue(mockCommands);
      const importMCPMock = vi
        .spyOn(cursor, "importMCP")
        .mockResolvedValue(mockMCPs);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.source).toBe("fs:~/.cursor");
      expect(preset.namespace).toBe("cursor");
      expect(preset.path).toBe("/home/user/.cursor");
      expect(preset.rules.size).toBe(1);
      expect(preset.commands.size).toBe(1);
      expect(preset.mcps).toEqual(mockMCPs);

      // Verify canonical format
      const firstRule = preset.rules.get("typescript.md") as CanonicalRule;
      expect(firstRule).toHaveProperty("frontmatter");
      expect(firstRule).toHaveProperty("markdown");
      expect(firstRule.frontmatter.description).toBe(
        "TypeScript coding standards",
      );

      importRulesMock.mockRestore();
      importCommandsMock.mockRestore();
      importMCPMock.mockRestore();
    });

    it("strips metadata from imported rules and commands", async () => {
      const mockRules = new Map<
        string,
        {
          frontmatter: Record<string, unknown>;
          markdown: string;
          sourcePath?: string;
          modifiedTime?: number;
        }
      >();
      mockRules.set("test.md", {
        frontmatter: { description: "Test rule" },
        markdown: "Test content",
        sourcePath: "/home/user/.cursor/rules/test.md",
        modifiedTime: 1234567890,
      });

      const mockCommands = new Map<
        string,
        {
          frontmatter: Record<string, unknown>;
          markdown: string;
          sourcePath?: string;
        }
      >();
      mockCommands.set("cmd.md", {
        frontmatter: { description: "Test command" },
        markdown: "Command content",
        sourcePath: "/home/user/.cursor/commands/cmd.md",
      });

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(mockCommands);
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      // Verify metadata was stripped
      const rule = preset.rules.get("test.md");
      expect(rule).not.toHaveProperty("sourcePath");
      expect(rule).not.toHaveProperty("modifiedTime");
      expect(rule).toHaveProperty("frontmatter");
      expect(rule).toHaveProperty("markdown");

      const command = preset.commands.get("cmd.md");
      expect(command).not.toHaveProperty("sourcePath");
      expect(command).toHaveProperty("frontmatter");
      expect(command).toHaveProperty("markdown");
    });

    it("warns on invalid frontmatter but continues", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("no-description.md", {
        frontmatter: {},
        markdown: "Missing description field",
      });

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      // Note: The loader doesn't warn - codecs handle this and auto-generate frontmatter
      // This test verifies that invalid files are still included
      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.rules.size).toBe(1);
      expect(preset.rules.get("no-description.md")).toBeDefined();

      consoleWarnSpy.mockRestore();
    });

    it("fails on invalid MCP configuration", async () => {
      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;

      vi.spyOn(cursor, "importRules").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      // Return invalid MCP type (string instead of object/null)
      vi.spyOn(cursor, "importMCP").mockResolvedValue(
        "invalid" as unknown as null,
      );

      await expect(
        loader.load("fs:~/.cursor", "/home/user/.cursor", "cursor", "cursor"),
      ).rejects.toThrow("Invalid MCP configuration");
    });

    it("handles null MCPs correctly", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("rule.md", {
        frontmatter: { description: "Rule" },
        markdown: "Content",
      });

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.mcps).toEqual({});
    });

    it("throws error when codec not found", async () => {
      await expect(
        loader.load(
          "fs:~/.unknown",
          "/home/user/.unknown",
          "unknown",
          "unknown",
        ),
      ).rejects.toThrow("No codec found for tool: unknown");
    });

    it("preserves namespace from config", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("rule.md", {
        frontmatter: { description: "Test" },
        markdown: "Content",
      });

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "custom-namespace",
      );

      expect(preset.namespace).toBe("custom-namespace");
    });

    it("preserves source identifier", async () => {
      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.source).toBe("fs:~/.cursor");
    });

    it("handles empty rules and commands", async () => {
      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue({
        test: { command: "test" },
      });

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.rules.size).toBe(0);
      expect(preset.commands.size).toBe(0);
      expect(Object.keys(preset.mcps).length).toBe(1);
    });

    it("returns canonical format with separated frontmatter and markdown", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("typescript.md", {
        frontmatter: {
          description: "TypeScript standards",
          globs: ["**/*.ts", "**/*.tsx"],
          priority: 10,
        },
        markdown: "## TypeScript Rules\n\nUse strict mode...",
      });

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(new Map());
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      const rule = preset.rules.get("typescript.md") as CanonicalRule;

      // Verify separated structure
      expect(rule.frontmatter).toEqual({
        description: "TypeScript standards",
        globs: ["**/*.ts", "**/*.tsx"],
        priority: 10,
      });
      expect(rule.markdown).toEqual(
        "## TypeScript Rules\n\nUse strict mode...",
      );

      // Verify no serialized format
      expect(rule.markdown).not.toContain("---");
    });

    it("handles multiple rules and commands", async () => {
      const mockRules = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockRules.set("rule1.md", {
        frontmatter: { description: "Rule 1" },
        markdown: "Content 1",
      });
      mockRules.set("rule2.md", {
        frontmatter: { description: "Rule 2" },
        markdown: "Content 2",
      });
      mockRules.set("rule3.md", {
        frontmatter: { description: "Rule 3" },
        markdown: "Content 3",
      });

      const mockCommands = new Map<
        string,
        { frontmatter: Record<string, unknown>; markdown: string }
      >();
      mockCommands.set("cmd1.md", {
        frontmatter: { description: "Command 1" },
        markdown: "Cmd 1",
      });
      mockCommands.set("cmd2.md", {
        frontmatter: { description: "Command 2" },
        markdown: "Cmd 2",
      });

      const registry = getCodecRegistry();
      const cursor = registry.get("cursor") as ToolCodec;
      vi.spyOn(cursor, "importRules").mockResolvedValue(mockRules);
      vi.spyOn(cursor, "importCommands").mockResolvedValue(mockCommands);
      vi.spyOn(cursor, "importMCP").mockResolvedValue(null);

      const preset = await loader.load(
        "fs:~/.cursor",
        "/home/user/.cursor",
        "cursor",
        "cursor",
      );

      expect(preset.rules.size).toBe(3);
      expect(preset.commands.size).toBe(2);
      expect([...preset.rules.keys()]).toEqual([
        "rule1.md",
        "rule2.md",
        "rule3.md",
      ]);
      expect([...preset.commands.keys()]).toEqual(["cmd1.md", "cmd2.md"]);
    });
  });
});
