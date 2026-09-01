/**
 * Config Remove Command Tests
 * Verifies that agentsync config rm correctly removes tools, MCP servers,
 * presets, skills, and commands from the configuration.
 */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configRm } from "../../../../src/commands/config/rm.js";
import { ConfigError, ValidationError } from "../../../../src/core/errors.js";
import { ensureDir, outputFile, pathExists } from "../../../../src/utils/fs.js";

const PORTABILITY_INVALID_NAMES = [
  "CON",
  "nul.txt",
  "COM1",
  "COM¹.log",
  "Lpt9.log",
  "CLOCK$",
  "bad:name",
  "question?",
  "star*",
  'quote"',
  "pipe|",
  "less<",
  "greater>",
  "trailing.",
  "trailing ",
  "control\u001f",
];

describe("Config Remove Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-rm-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("invalid type", () => {
    it("throws on invalid type", async () => {
      await expect(configRm("invalid", "foo", { cwd: tmpDir })).rejects.toThrow(
        "Unknown config type",
      );
    });
  });

  describe("noncanonical config layouts", () => {
    it.each([
      ["default_agents", 'default_agents = ["claude"]\n'],
      ["agents table", "[agents.claude]\nenabled = true\n"],
      ["invalid current field", 'tools = ["claude"]\nunexpected = true\n'],
    ])("refuses to mutate a %s config", async (_layout, original) => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(configPath, original);

      await expect(
        configRm("tool", "claude", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("refuses to remove MCP state from a foreign config", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original =
        'default_agents = ["claude"]\n\n[mcp_servers.github]\ncommand = "npx"\n';
      await outputFile(configPath, original);

      await expect(
        configRm("mcp", "github", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it.each([
      "skill",
      "command",
    ] as const)("refuses to remove a %s beside a foreign config", async (type) => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original = 'default_agents = ["claude"]\n';
      const itemPath =
        type === "skill"
          ? path.join(tmpDir, ".agents", "skills", "audit", "SKILL.md")
          : path.join(tmpDir, ".agents", "commands", "audit.md");
      await outputFile(configPath, original);
      await outputFile(itemPath, "keep me\n");

      await expect(
        configRm(type, "audit", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
      expect(await readFile(itemPath, "utf-8")).toBe("keep me\n");
    });
  });

  describe.runIf(process.platform !== "win32")("config path safety", () => {
    it("does not follow a config file symlink outside the project", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "agentsync-rm-out-"));
      const externalConfig = path.join(outside, "agentsync.toml");
      const original = '[mcp.github]\ncommand = "npx"\n# keep external bytes\n';
      try {
        await outputFile(externalConfig, original);
        await ensureDir(path.join(tmpDir, ".agents"));
        await symlink(
          externalConfig,
          path.join(tmpDir, ".agents", "agentsync.toml"),
        );

        await expect(
          configRm("mcp", "github", { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ConfigError);
        expect(await readFile(externalConfig, "utf-8")).toBe(original);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe("rm tool", () => {
    it("removes tool from config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude", "cursor"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"claude"');
      expect(content).not.toContain('"cursor"');
    });

    it("returns not_found when tool not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });

    it("returns not_found when no config exists", async () => {
      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });

    it("handles removing the only tool", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["cursor"]\n',
      );

      const result = await configRm("tool", "cursor", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("tools = []");
    });

    it("removes a decoded single-quoted value and preserves surrounding bytes", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const suffix =
        ' # keep array comment\n\n[mcp.kept]\ncommand   = "node" # exact suffix\n';
      const original = `# exact prefix\ntools = ['claude', 'cursor']${suffix}`;
      await outputFile(configPath, original);

      await configRm("tool", "cursor", { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).tools).toEqual(["claude"]);
      expect(content.startsWith("# exact prefix\ntools = ['claude', ")).toBe(
        true,
      );
      expect(content.endsWith(suffix)).toBe(true);
    });
  });

  describe("rm mcp", () => {
    it("removes MCP section from config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n\n[mcp.github]\ncommand = "npx"\nargs = ["-y", "@org/server"]\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain("[mcp.github]");
      expect(content).not.toContain("npx");
      expect(parseToml(content)).toEqual({ tools: ["claude"] });
    });

    it("removes MCP section with env sub-section", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[mcp.github]\ncommand = "npx"\n\n[mcp.github.env]\nTOKEN = "abc"\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain("[mcp.github]");
      expect(content).not.toContain("[mcp.github.env]");
      expect(content).not.toContain("TOKEN");
    });

    it("returns not_found when MCP not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configRm("mcp", "github", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });

    it("removes a quoted dotted MCP key and preserves unrelated values", async () => {
      const name = "team.server";
      const keptServer = {
        command: 'node "kept"\\worker',
        args: ["C:\\Program Files\\tool", "line one\nline two"],
        env: { "TOKEN.VALUE": 'keep\\this"value' },
      };
      const originalConfig = {
        tools: ["claude"],
        extends: ["github:org/base"],
        output_style: {
          custom: [
            {
              name: "keep",
              file: 'keep "quotes" and \\slashes\nacross lines',
            },
          ],
        },
        mcp: {
          [name]: {
            url: "https://example.com/path?query=one&other=two",
            headers: { "X.Special": 'remove\\this"value' },
          },
          "kept.server": keptServer,
        },
      };
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        stringifyToml(originalConfig),
      );

      const result = await configRm("mcp", name, { cwd: tmpDir });

      expect(result.action).toBe("removed");
      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(parseToml(content)).toEqual({
        tools: originalConfig.tools,
        extends: originalConfig.extends,
        output_style: originalConfig.output_style,
        mcp: { "kept.server": keptServer },
      });
    });

    it("preserves comments, formatting, and header-like multiline text", async () => {
      const original = [
        "# keep top comment",
        'tools   =   [ "claude" ] # keep inline comment',
        "[[hooks.Stop]]",
        'id = "keep-header-like-command"',
        'command = """',
        '[mcp."team.server"]',
        '"""',
        "",
        "# remove this server, but the parser decides what is a real header",
        '[mcp."team.server"] # target',
        'command = "remove"',
        "",
        '[mcp."team.server".env]',
        'TOKEN = "remove"',
        "",
        "# keep server comment",
        "[mcp.kept]",
        'command   =   "keep" # keep spacing',
        "",
      ].join("\n");
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        original,
      );

      await configRm("mcp", "team.server", { cwd: tmpDir });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("# keep top comment");
      expect(content).toContain(
        'tools   =   [ "claude" ] # keep inline comment',
      );
      expect(content).toContain('[mcp."team.server"]\n"""');
      expect(content).toContain("# keep server comment");
      expect(content).toContain('command   =   "keep" # keep spacing');
      expect(parseToml(content).mcp).toEqual({ kept: { command: "keep" } });
    });

    it.each([
      'mcp.foo = { command = "npx" }\n',
      'mcp.foo.command = "npx"\n',
    ])("removes a server encoded with dotted keys: %s", async (encoded) => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(
        configPath,
        `tools = ["claude"]\n${encoded}mcp.kept.command = "keep"\n`,
      );

      const result = await configRm("mcp", "foo", { cwd: tmpDir });

      expect(result.action).toBe("removed");
      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).mcp).toEqual({ kept: { command: "keep" } });
    });

    it("removes an inline server beneath an explicit mcp table", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(
        configPath,
        '[mcp]\nfoo = { command = "remove" }\nkept = { command = "keep" }\n',
      );

      const result = await configRm("mcp", "foo", { cwd: tmpDir });

      expect(result.action).toBe("removed");
      expect(parseToml(await readFile(configPath, "utf-8")).mcp).toEqual({
        kept: { command: "keep" },
      });
    });

    it("rejects an immutable root inline mcp table without claiming removal", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original =
        'mcp = { foo = { command = "remove" }, kept = { command = "keep" } }\n';
      await outputFile(configPath, original);

      await expect(configRm("mcp", "foo", { cwd: tmpDir })).rejects.toThrow(
        "inline root-level mcp table",
      );
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("rm preset", () => {
    it("removes preset from extends array", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base", "github:org/extra"]\n',
      );

      const result = await configRm("preset", "github:org/base", {
        cwd: tmpDir,
      });
      expect(result.action).toBe("removed");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).not.toContain('"github:org/base"');
      expect(content).toContain('"github:org/extra"');
    });

    it("returns not_found when preset not present", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      const result = await configRm("preset", "github:org/other", {
        cwd: tmpDir,
      });
      expect(result.action).toBe("not_found");
    });

    it("removes escaped values from a commented multiline CRLF array", async () => {
      const source = 'fs:./preset,with"quote\\slash';
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const suffix =
        ']\r\n\r\n[mcp.kept]\r\ncommand   = "node" # exact suffix\r\n';
      const original =
        `# exact prefix\r\nextends = [\r\n  'fs:./base', # keep item\r\n  '${source}', # target item\r\n` +
        suffix;
      await outputFile(configPath, original);

      await configRm("preset", source, { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).extends).toEqual(["fs:./base"]);
      expect(content.startsWith("# exact prefix\r\nextends = [\r\n")).toBe(
        true,
      );
      expect(content).toContain("# keep item\r\n");
      expect(content).toContain("# target item\r\n");
      expect(content.endsWith(suffix)).toBe(true);
      expect(content.replaceAll("\r\n", "")).not.toContain("\n");
    });

    it("rejects an unsupported extends shape without changing it", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original = 'extends = { base = "github:org/base" }\n';
      await outputFile(configPath, original);

      await expect(
        configRm("preset", "github:org/base", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("rm skill", () => {
    it("rejects path traversal and separators before deleting", async () => {
      const outsideName = `${path.basename(tmpDir)}-outside-skill`;
      const outsidePath = path.join(path.dirname(tmpDir), outsideName);
      await ensureDir(path.join(outsidePath, "nested"));
      const sentinel = path.join(outsidePath, "nested", "SKILL.md");
      await outputFile(sentinel, "keep me");

      const invalidNames = [
        `../../../${outsideName}`,
        "../nested",
        "nested/skill",
        "nested\\skill",
        ".",
        "..",
        ...PORTABILITY_INVALID_NAMES,
      ];
      for (const name of invalidNames) {
        await expect(
          configRm("skill", name, { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ValidationError);
      }

      expect(await pathExists(sentinel)).toBe(true);
    });

    it("removes skill directory", async () => {
      const skillDir = path.join(tmpDir, ".agents", "skills", "typescript");
      await ensureDir(skillDir);
      await outputFile(
        path.join(skillDir, "SKILL.md"),
        "---\ndescription: TypeScript\n---\n\n# typescript\n",
      );

      const result = await configRm("skill", "typescript", { cwd: tmpDir });
      expect(result.action).toBe("removed");
      expect(await pathExists(skillDir)).toBe(false);
    });

    it.runIf(process.platform !== "win32")(
      "rejects a skills directory symlinked outside the project",
      async () => {
        const outside = await mkdtemp(path.join(tmpdir(), "agentsync-rm-out-"));
        try {
          await outputFile(path.join(outside, "keep", "SKILL.md"), "keep");
          await ensureDir(path.join(tmpDir, ".agents"));
          await symlink(outside, path.join(tmpDir, ".agents", "skills"));

          await expect(
            configRm("skill", "keep", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "keep", "SKILL.md"))).toBe(
            true,
          );
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it("returns not_found when skill does not exist", async () => {
      const result = await configRm("skill", "missing", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });
  });

  describe("rm command", () => {
    it("rejects path traversal and separators before deleting", async () => {
      const outsideName = `${path.basename(tmpDir)}-outside-command`;
      const outsidePath = path.join(path.dirname(tmpDir), `${outsideName}.md`);
      await outputFile(outsidePath, "keep me");

      const invalidNames = [
        `../../../${outsideName}`,
        "../nested",
        "nested/command",
        "nested\\command",
        ".",
        "..",
        ...PORTABILITY_INVALID_NAMES,
      ];
      for (const name of invalidNames) {
        await expect(
          configRm("command", name, { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ValidationError);
      }

      expect(await pathExists(outsidePath)).toBe(true);
    });

    it("removes command file", async () => {
      const cmdPath = path.join(tmpDir, ".agents", "commands", "deploy.md");
      await ensureDir(path.dirname(cmdPath));
      await outputFile(cmdPath, "---\ndescription: Deploy\n---\n\n# deploy\n");

      const result = await configRm("command", "deploy", { cwd: tmpDir });
      expect(result.action).toBe("removed");
      expect(await pathExists(cmdPath)).toBe(false);
    });

    it.runIf(process.platform !== "win32")(
      "rejects a commands directory symlinked outside the project",
      async () => {
        const outside = await mkdtemp(path.join(tmpdir(), "agentsync-rm-out-"));
        try {
          await outputFile(path.join(outside, "keep.md"), "keep");
          await ensureDir(path.join(tmpDir, ".agents"));
          await symlink(outside, path.join(tmpDir, ".agents", "commands"));

          await expect(
            configRm("command", "keep", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "keep.md"))).toBe(true);
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it("returns not_found when command does not exist", async () => {
      const result = await configRm("command", "missing", { cwd: tmpDir });
      expect(result.action).toBe("not_found");
    });
  });
});
