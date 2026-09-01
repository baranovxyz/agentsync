/**
 * Config Add Command Tests
 * Verifies that agentsync config add correctly adds tools, MCP servers,
 * presets, skills, and commands to the configuration.
 */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configAdd } from "../../../../src/commands/config/add.js";
import {
  ConfigError,
  ParseError,
  ValidationError,
} from "../../../../src/core/errors.js";
import { splitFrontmatter } from "../../../../src/utils/frontmatter.js";
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

describe("Config Add Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-add-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("invalid type", () => {
    it("throws on invalid type", async () => {
      await expect(
        configAdd("invalid", "foo", { cwd: tmpDir }),
      ).rejects.toThrow("Unknown config type");
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
        configAdd("tool", "cursor", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("refuses to add MCP state to a foreign config", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original =
        'default_agents = ["claude"]\n\n[mcp_servers.github]\ncommand = "npx"\n';
      await outputFile(configPath, original);

      await expect(
        configAdd("mcp", "linear", {
          cwd: tmpDir,
          mcpConfig: '{"command":"npx","args":["-y","@org/linear"]}',
        }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it.each([
      "skill",
      "command",
    ] as const)("refuses to add a %s beside a foreign config", async (type) => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original = 'default_agents = ["claude"]\n';
      await outputFile(configPath, original);

      await expect(
        configAdd(type, "audit", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
      expect(
        await pathExists(
          type === "skill"
            ? path.join(tmpDir, ".agents", "skills", "audit", "SKILL.md")
            : path.join(tmpDir, ".agents", "commands", "audit.md"),
        ),
      ).toBe(false);
    });
  });

  describe.runIf(process.platform !== "win32")("config path safety", () => {
    it("does not follow the .agents directory outside the project", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "agentsync-add-out-"));
      const externalConfig = path.join(outside, "agentsync.toml");
      const original = 'tools = ["claude"]\n# external bytes stay unchanged\n';
      try {
        await outputFile(externalConfig, original);
        await symlink(outside, path.join(tmpDir, ".agents"));

        await expect(
          configAdd("tool", "cursor", { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ConfigError);
        expect(await readFile(externalConfig, "utf-8")).toBe(original);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("does not create the target of a dangling config symlink", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "agentsync-add-out-"));
      const externalConfig = path.join(outside, "missing.toml");
      const sentinel = path.join(outside, "sentinel.txt");
      try {
        await outputFile(sentinel, "keep me");
        await ensureDir(path.join(tmpDir, ".agents"));
        await symlink(
          externalConfig,
          path.join(tmpDir, ".agents", "agentsync.toml"),
        );

        await expect(
          configAdd("preset", "github:org/base", { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ConfigError);
        expect(await pathExists(externalConfig)).toBe(false);
        expect(await readFile(sentinel, "utf-8")).toBe("keep me");
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe("add tool", () => {
    it("validates tool name against SUPPORTED_TOOLS", async () => {
      await expect(
        configAdd("tool", "unknown-tool", { cwd: tmpDir }),
      ).rejects.toThrow("Unknown tool");
    });

    it("adds tool to new config file", async () => {
      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("added");
      expect(result.type).toBe("tool");
      expect(result.name).toBe("cursor");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"cursor"');
    });

    it("adds tool to existing config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"claude"');
      expect(content).toContain('"cursor"');
    });

    it("is idempotent (no duplicate)", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original = "tools = ['cursor'] # keep bytes\n";
      await outputFile(configPath, original);

      const result = await configAdd("tool", "cursor", { cwd: tmpDir });

      expect(result.action).toBe("already_exists");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("adds a root tools array before existing tables", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[mcp.existing]\ncommand = "node"\n',
      );

      const result = await configAdd("tool", "claude", { cwd: tmpDir });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(parseToml(content)).toEqual({
        tools: ["claude"],
        mcp: { existing: { command: "node" } },
      });
      expect(content.indexOf("tools =")).toBeLessThan(
        content.indexOf("[mcp.existing]"),
      );
    });

    it("edits decoded single-quoted values without touching inline comments", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const suffix =
        ' # keep array comment\n\n[mcp.kept]\ncommand   = "node" # exact suffix\n';
      const original = `# exact prefix\ntools = ['claude']${suffix}`;
      await outputFile(configPath, original);

      await configAdd("tool", "cursor", { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).tools).toEqual(["claude", "cursor"]);
      expect(content.startsWith("# exact prefix\ntools = ['claude'")).toBe(
        true,
      );
      expect(content.endsWith(suffix)).toBe(true);
    });

    it("adds the first item to an empty inline array", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(configPath, "tools = [] # keep comment\n");

      await configAdd("tool", "cursor", { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).tools).toEqual(["cursor"]);
      expect(content).toBe('tools = ["cursor"] # keep comment\n');
    });

    it("adds to a multiline array without a trailing comma", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(configPath, "tools = [\n  'claude' # keep comment\n]\n");

      await configAdd("tool", "cursor", { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).tools).toEqual(["claude", "cursor"]);
      expect(content).toContain("'claude', # keep comment\n");
      expect(content).toContain('  "cursor"\n]\n');
    });

    it.each([
      ["inline table", 'tools = { selected = "claude" }\n'],
      ["table", '[tools]\nselected = "claude"\n'],
    ])("rejects an unsupported %s without changing it", async (_shape, original) => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      await outputFile(configPath, original);

      await expect(
        configAdd("tool", "cursor", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("rejects a duplicate key without changing it", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original = 'tools = ["claude"]\ntools = ["cursor"]\n';
      await outputFile(configPath, original);

      await expect(
        configAdd("tool", "cursor", { cwd: tmpDir }),
      ).rejects.toBeInstanceOf(ParseError);
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("add mcp", () => {
    it("requires --mcp-config flag", async () => {
      await expect(configAdd("mcp", "github", { cwd: tmpDir })).rejects.toThrow(
        "--mcp-config flag",
      );
    });

    it("validates JSON structure with Zod", async () => {
      await expect(
        configAdd("mcp", "github", {
          cwd: tmpDir,
          mcpConfig: '{"invalid": true}',
        }),
      ).rejects.toThrow("Invalid MCP server config");
    });

    it.each([
      ["empty command", '{"command":""}'],
      ["empty URL", '{"url":""}'],
      ["mixed transports", '{"command":"npx","url":"https://mcp.example"}'],
    ])("rejects %s without writing config", async (_, mcpConfig) => {
      await expect(
        configAdd("mcp", "invalid", { cwd: tmpDir, mcpConfig }),
      ).rejects.toThrow("Invalid MCP server config");
      expect(
        await pathExists(path.join(tmpDir, ".agents", "agentsync.toml")),
      ).toBe(false);
    });

    it("rejects malformed JSON", async () => {
      await expect(
        configAdd("mcp", "github", { cwd: tmpDir, mcpConfig: "{not json}" }),
      ).rejects.toThrow("Invalid JSON");
    });

    it("adds command-based MCP server to new config", async () => {
      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":["-y","@org/server"]}',
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("mcp");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.github]");
      expect(content).toContain('command = "npx"');
      expect(content).toContain('"-y", "@org/server"');
    });

    it("adds URL-based MCP server", async () => {
      const result = await configAdd("mcp", "remote", {
        cwd: tmpDir,
        mcpConfig: '{"url":"https://mcp.example.com"}',
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.remote]");
      expect(content).toContain('url = "https://mcp.example.com"');
    });

    it("adds MCP with env vars", async () => {
      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":[],"env":{"TOKEN":"abc"}}',
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain("[mcp.github.env]");
      expect(content).toContain('TOKEN = "abc"');
    });

    it("serializes quotes, backslashes, and newlines as valid TOML", async () => {
      const mcpConfig = {
        command: 'node "server"\\worker\n--label',
        args: ["--path", "C:\\Program Files\\tool", 'say "hello"\nnext'],
        env: {
          MULTILINE: "line one\nline two",
          QUOTED: 'backslash\\and"quote',
        },
      };

      await configAdd("mcp", "special", {
        cwd: tmpDir,
        mcpConfig: JSON.stringify(mcpConfig),
      });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      const parsed = parseToml(content);
      expect(parsed.mcp.special).toEqual(mcpConfig);
    });

    it("writes to existing config", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":["-y","@org/server"]}',
      });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(parseToml(content)).toMatchObject({
        tools: ["claude"],
        mcp: { github: { command: "npx", args: ["-y", "@org/server"] } },
      });
    });

    it("preserves existing comments and formatting byte-for-byte", async () => {
      const original = [
        "# keep the operator note",
        'tools   =   [ "claude" ] # keep spacing',
        "[[hooks.Stop]]",
        'id = "keep-header-like-command"',
        'command = """',
        "[mcp.not-a-table]",
        '"""',
        "",
      ].join("\n");
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        original,
      );

      await configAdd("mcp", "team.server", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx"}',
      });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content.startsWith(original)).toBe(true);
      expect(content).toContain('[mcp."team.server"]');
      expect(parseToml(content).mcp["team.server"]).toEqual({ command: "npx" });
    });

    it("preserves a CRLF prefix and appends the MCP section with CRLF", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original =
        '# keep the operator note\r\ntools   =   [ "claude" ]\r\n';
      await outputFile(configPath, original);

      await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx"}',
      });

      const content = await readFile(configPath, "utf-8");
      expect(content.slice(0, original.length)).toBe(original);
      expect(content).toContain("\r\n\r\n[mcp.github]\r\n");
      expect(content.replaceAll("\r\n", "")).not.toContain("\n");
      expect(parseToml(content).mcp.github).toEqual({ command: "npx" });
    });

    it("rejects an immutable root inline mcp table without changing it", async () => {
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const original =
        'tools = ["claude"]\nmcp = { existing = { command = "npx" } }\n';
      await outputFile(configPath, original);

      await expect(
        configAdd("mcp", "added", {
          cwd: tmpDir,
          mcpConfig: '{"command":"node"}',
        }),
      ).rejects.toThrow("inline root-level mcp table");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("is idempotent (no duplicate MCP section)", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        '[mcp.github]\ncommand = "npx"\n',
      );

      const result = await configAdd("mcp", "github", {
        cwd: tmpDir,
        mcpConfig: '{"command":"npx","args":[]}',
      });

      expect(result.action).toBe("already_exists");
    });

    it("recognizes a quoted dotted MCP key as an existing server", async () => {
      const name = "team.server";
      const existingConfig = {
        tools: ["claude"],
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
            command: 'node "existing"\\worker',
            args: ["C:\\Program Files\\tool", "line one\nline two"],
            env: { "TOKEN.VALUE": 'keep\\this"value' },
          },
        },
      };
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        stringifyToml(existingConfig),
      );

      const result = await configAdd("mcp", name, {
        cwd: tmpDir,
        mcpConfig: '{"command":"replacement"}',
      });

      expect(result.action).toBe("already_exists");
      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(parseToml(content)).toEqual(existingConfig);
    });
  });

  describe("add preset", () => {
    it("validates preset source format", async () => {
      await expect(
        configAdd("preset", "http://bad-source", { cwd: tmpDir }),
      ).rejects.toThrow("Invalid preset source");
    });

    it("adds github preset to new config", async () => {
      const result = await configAdd("preset", "github:company/standards", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("preset");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"github:company/standards"');
    });

    it("adds filesystem preset", async () => {
      const result = await configAdd("preset", "fs:./local-rules", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("added");

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"fs:./local-rules"');
    });

    it("adds preset to existing extends array", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      await configAdd("preset", "github:org/extra", { cwd: tmpDir });

      const content = await readFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "utf-8",
      );
      expect(content).toContain('"github:org/base"');
      expect(content).toContain('"github:org/extra"');
    });

    it("preserves multiline CRLF arrays while safely adding escaped values", async () => {
      const source = 'fs:./preset,with"quote\\slash';
      const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
      const suffix =
        ']\r\n\r\n[mcp.kept]\r\ncommand   = "node" # exact suffix\r\n';
      const original =
        "# exact prefix\r\nextends = [\r\n  'fs:./base', # keep item comment\r\n" +
        suffix;
      await outputFile(configPath, original);

      await configAdd("preset", source, { cwd: tmpDir });

      const content = await readFile(configPath, "utf-8");
      expect(parseToml(content).extends).toEqual(["fs:./base", source]);
      expect(content.startsWith("# exact prefix\r\nextends = [\r\n")).toBe(
        true,
      );
      expect(content).toContain("'fs:./base', # keep item comment\r\n");
      expect(content.endsWith(suffix)).toBe(true);
      expect(content.replaceAll("\r\n", "")).not.toContain("\n");
    });

    it("is idempotent", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        'extends = ["github:org/base"]\n',
      );

      const result = await configAdd("preset", "github:org/base", {
        cwd: tmpDir,
      });

      expect(result.action).toBe("already_exists");
    });
  });

  describe("add skill", () => {
    it("rejects path traversal and separators before writing", async () => {
      const outsideName = `${path.basename(tmpDir)}-outside-skill`;
      const outsidePath = path.join(path.dirname(tmpDir), outsideName);
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
          configAdd("skill", name, { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ValidationError);
      }

      expect(await pathExists(outsidePath)).toBe(false);
      expect(await pathExists(path.join(tmpDir, ".agents"))).toBe(false);
    });

    it.runIf(process.platform !== "win32")(
      "rejects a skills directory symlinked outside the project",
      async () => {
        const outside = await mkdtemp(
          path.join(tmpdir(), "agentsync-add-out-"),
        );
        try {
          await ensureDir(path.join(tmpDir, ".agents"));
          await symlink(outside, path.join(tmpDir, ".agents", "skills"));

          await expect(
            configAdd("skill", "escape", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "escape"))).toBe(false);
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it.runIf(process.platform !== "win32")(
      "rejects a dangling SKILL.md symlink that targets outside the project",
      async () => {
        const outside = await mkdtemp(
          path.join(tmpdir(), "agentsync-add-out-"),
        );
        const skillDir = path.join(tmpDir, ".agents", "skills", "escape");
        await ensureDir(skillDir);
        await symlink(
          path.join(outside, "created.md"),
          path.join(skillDir, "SKILL.md"),
        );

        try {
          await expect(
            configAdd("skill", "escape", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "created.md"))).toBe(
            false,
          );
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it("creates skill directory and SKILL.md", async () => {
      const result = await configAdd("skill", "typescript", {
        cwd: tmpDir,
        description: "TypeScript coding standards",
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("skill");

      const skillPath = path.join(
        tmpDir,
        ".agents",
        "skills",
        "typescript",
        "SKILL.md",
      );
      expect(await pathExists(skillPath)).toBe(true);

      const content = await readFile(skillPath, "utf-8");
      expect(content).toContain("description: TypeScript coding standards");
      expect(content).toContain("# typescript");
    });

    it("uses default description when not provided", async () => {
      await configAdd("skill", "testing", { cwd: tmpDir });

      const skillPath = path.join(
        tmpDir,
        ".agents",
        "skills",
        "testing",
        "SKILL.md",
      );
      const content = await readFile(skillPath, "utf-8");
      expect(content).toContain("description: testing skill");
    });

    it("is idempotent", async () => {
      await configAdd("skill", "typescript", { cwd: tmpDir });
      const result = await configAdd("skill", "typescript", { cwd: tmpDir });
      expect(result.action).toBe("already_exists");
    });
  });

  describe("add command", () => {
    it("rejects path traversal and separators before writing", async () => {
      const outsideName = `${path.basename(tmpDir)}-outside-command`;
      const outsidePath = path.join(path.dirname(tmpDir), `${outsideName}.md`);
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
          configAdd("command", name, { cwd: tmpDir }),
        ).rejects.toBeInstanceOf(ValidationError);
      }

      expect(await pathExists(outsidePath)).toBe(false);
      expect(await pathExists(path.join(tmpDir, ".agents"))).toBe(false);
    });

    it.runIf(process.platform !== "win32")(
      "rejects a commands directory symlinked outside the project",
      async () => {
        const outside = await mkdtemp(
          path.join(tmpdir(), "agentsync-add-out-"),
        );
        try {
          await ensureDir(path.join(tmpDir, ".agents"));
          await symlink(outside, path.join(tmpDir, ".agents", "commands"));

          await expect(
            configAdd("command", "escape", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "escape.md"))).toBe(false);
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it.runIf(process.platform !== "win32")(
      "rejects a dangling command symlink that targets outside the project",
      async () => {
        const outside = await mkdtemp(
          path.join(tmpdir(), "agentsync-add-out-"),
        );
        const commandPath = path.join(
          tmpDir,
          ".agents",
          "commands",
          "escape.md",
        );
        await ensureDir(path.dirname(commandPath));
        await symlink(path.join(outside, "created.md"), commandPath);

        try {
          await expect(
            configAdd("command", "escape", { cwd: tmpDir }),
          ).rejects.toBeInstanceOf(ValidationError);
          expect(await pathExists(path.join(outside, "created.md"))).toBe(
            false,
          );
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );

    it("creates command markdown file", async () => {
      const result = await configAdd("command", "deploy", {
        cwd: tmpDir,
        description: "Deploy to production",
      });

      expect(result.action).toBe("added");
      expect(result.type).toBe("command");

      const cmdPath = path.join(tmpDir, ".agents", "commands", "deploy.md");
      expect(await pathExists(cmdPath)).toBe(true);

      const content = await readFile(cmdPath, "utf-8");
      expect(content).toContain("description: Deploy to production");
      expect(content).toContain("# deploy");
    });

    it("serializes YAML-sensitive descriptions as one value", async () => {
      const description = "Deploy: #production\n---\nstill one description";
      await configAdd("command", "deploy", {
        cwd: tmpDir,
        description,
      });

      const content = await readFile(
        path.join(tmpDir, ".agents", "commands", "deploy.md"),
        "utf-8",
      );
      expect(splitFrontmatter(content).fm).toEqual({ description });
    });

    it("uses default description when not provided", async () => {
      await configAdd("command", "test-all", { cwd: tmpDir });

      const cmdPath = path.join(tmpDir, ".agents", "commands", "test-all.md");
      const content = await readFile(cmdPath, "utf-8");
      expect(content).toContain("description: test-all command");
    });

    it("is idempotent", async () => {
      await configAdd("command", "deploy", { cwd: tmpDir });
      const result = await configAdd("command", "deploy", { cwd: tmpDir });
      expect(result.action).toBe("already_exists");
    });
  });
});
