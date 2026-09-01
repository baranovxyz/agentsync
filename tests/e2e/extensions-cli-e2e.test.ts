/**
 * Built CLI release matrix.
 *
 * Every case runs the immutable prebuilt artifact exactly as a consumer does:
 * `node dist/cli.js sync --json`. Each provider gets an isolated project and
 * home directory seeded from the same canonical `.agents/` fixture.
 */

import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CliResultSchema, SyncDataSchema } from "../../src/types/output.js";
import { splitFrontmatter } from "../../src/utils/frontmatter.js";
import {
  parseJsonValidated,
  pathExists,
  readJsonValidated,
} from "../../src/utils/fs.js";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const CLI_PATH = path.join(PACKAGE_ROOT, "dist", "cli.js");
const CLI_TIMEOUT_MS = 15_000;

const ReleaseToolSchema = z.enum(["claude", "codex", "opencode", "cursor"]);
type ReleaseTool = z.infer<typeof ReleaseToolSchema>;

const SyncCliResultSchema = CliResultSchema.extend({
  command: z.literal("sync"),
  data: SyncDataSchema,
});

const NonEmptyStringSchema = z.string().min(1);
const StringOrStringListSchema = z.union([
  NonEmptyStringSchema,
  z.array(NonEmptyStringSchema),
]);
const PermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "auto",
  "dontAsk",
  "bypassPermissions",
  "plan",
  "manual",
]);

const StandardMcpFileSchema = z
  .object({
    mcpServers: z
      .object({
        release: z
          .object({
            command: z.literal("node"),
            args: z.tuple([z.literal("server.js")]),
            env: z.object({ RELEASE_MODE: z.literal("test") }).strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const ClaudeSettingsSchema = z
  .object({
    hooks: z
      .object({
        PreToolUse: z.array(
          z
            .object({
              matcher: z.literal("Bash"),
              hooks: z.array(
                z
                  .object({
                    type: z.literal("command"),
                    command: z.string(),
                    timeout: z.literal(2),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
        PostCompact: z.array(
          z
            .object({
              hooks: z.array(
                z
                  .object({
                    type: z.literal("command"),
                    command: z.string(),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict(),
    permissions: z
      .object({
        allow: z.array(z.string()),
        ask: z.array(z.string()),
        deny: z.array(z.string()),
        defaultMode: PermissionModeSchema.optional(),
      })
      .strict(),
    statusLine: z
      .object({ type: z.literal("command"), command: z.string() })
      .strict(),
    outputStyle: z.string(),
  })
  .strict();

const ClaudeAgentSchema = z
  .object({
    name: z.string().regex(/^[a-z](?:[a-z-]*[a-z])?$/u),
    description: NonEmptyStringSchema,
    tools: StringOrStringListSchema.optional(),
    disallowedTools: StringOrStringListSchema.optional(),
    model: z
      .union([
        z.enum(["sonnet", "opus", "haiku", "fable", "inherit"]),
        z.string().regex(/^claude-[a-z0-9][a-z0-9._-]*$/u),
      ])
      .optional(),
    permissionMode: PermissionModeSchema.optional(),
    maxTurns: z.number().int().positive().optional(),
    skills: z.array(NonEmptyStringSchema).optional(),
    mcpServers: z
      .array(z.union([NonEmptyStringSchema, z.record(z.string(), z.unknown())]))
      .optional(),
    hooks: z.record(z.string(), z.unknown()).optional(),
    memory: z.enum(["user", "project", "local"]).optional(),
    background: z.boolean().optional(),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    isolation: z.literal("worktree").optional(),
    color: z
      .enum([
        "red",
        "blue",
        "green",
        "yellow",
        "purple",
        "orange",
        "pink",
        "cyan",
      ])
      .optional(),
    initialPrompt: z.string().optional(),
    experimental: z
      .object({ cacheTtl: z.enum(["5m", "1h"]).optional() })
      .strict()
      .optional(),
  })
  .strict();

const CursorAgentSchema = z
  .object({
    name: z.string().regex(/^[a-z](?:[a-z-]*[a-z])?$/u),
    description: NonEmptyStringSchema.optional(),
    model: NonEmptyStringSchema.optional(),
    readonly: z.boolean().optional(),
    is_background: z.boolean().optional(),
  })
  .strict();

const ClaudeContextSentinelSchema = z
  .object({
    pct: z.literal(8),
    in: z.literal(15_500),
    max: z.literal(200_000),
    cost: z.literal(0.01234),
  })
  .strict();

const CodexRoleSchema = (
  configFile: string,
  description: string,
  nickname?: string,
) =>
  z
    .object({
      config_file: z.literal(configFile),
      description: z.literal(description),
      nickname_candidates: nickname
        ? z.tuple([z.literal(nickname)])
        : z.never().optional(),
    })
    .strict();

const CodexConfigSchema = z
  .object({
    default_permissions: z.literal(":read-only"),
    mcp_servers: z
      .object({
        release: z
          .object({
            command: z.literal("node"),
            args: z.tuple([z.literal("server.js")]),
            env: z.object({ RELEASE_MODE: z.literal("test") }).strict(),
          })
          .strict(),
      })
      .strict(),
    agents: z
      .object({
        "release-preset--preset-reviewer": CodexRoleSchema(
          "agents/release-preset--preset-reviewer.toml",
          "Reviews preset release changes",
        ),
        reviewer: CodexRoleSchema(
          "agents/reviewer.toml",
          "Reviews release changes",
          "Scout",
        ),
      })
      .strict(),
    tui: z
      .object({
        status_line: z.tuple([
          z.literal("model"),
          z.literal("current-dir"),
          z.literal("git-branch"),
          z.literal("context-used"),
          z.literal("thread-id"),
        ]),
      })
      .strict(),
    personality: z.literal("none"),
  })
  .strict();

const CodexAgentConfigSchema = (instructionsFile: string) =>
  z.object({ model_instructions_file: z.literal(instructionsFile) }).strict();

const OpenCodeConfigSchema = z
  .object({
    mcp: z
      .object({
        release: z
          .object({
            type: z.literal("local"),
            command: z.tuple([z.literal("node"), z.literal("server.js")]),
            enabled: z.literal(true),
            environment: z.object({ RELEASE_MODE: z.literal("test") }).strict(),
          })
          .strict(),
      })
      .strict(),
    permission: z
      .object({
        "*": z.literal("deny"),
        bash: z.object({ "git *": z.literal("allow") }).strict(),
        edit: z.object({ "*": z.literal("ask") }).strict(),
        read: z.object({ ".env*": z.literal("deny") }).strict(),
      })
      .strict(),
    instructions: z.tuple([z.literal(".agents/rules/always.md")]),
  })
  .strict();

const OpenCodeCommandSchema = z
  .object({
    description: z.literal("Prepare a release"),
    agent: z.literal("reviewer"),
    model: z.literal("anthropic/claude-sonnet-4-20250514"),
    variant: z.literal("high"),
    subtask: z.literal(true),
  })
  .strict();

const CursorHooksSchema = z
  .object({
    version: z.literal(1),
    hooks: z
      .object({
        preToolUse: z.array(
          z
            .object({
              command: z.string(),
              matcher: z.literal("Shell"),
              timeout: z.literal(2),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

const CursorPermissionsSchema = z
  .object({
    permissions: z
      .object({
        allow: z.array(z.string()),
        deny: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

const CONFIG_TEMPLATE = (tool: ReleaseTool) => `tools = ["${tool}"]
extends = ["fs:./release-preset"]

[mcp.release]
command = "node"
args = ["server.js"]

[mcp.release.env]
RELEASE_MODE = "test"

[[hooks.PreToolUse]]
id = "audit"
matcher = "Bash"
command = ".agents/hooks/scripts/audit.sh"
timeout = 1501

[[hooks.PostCompact]]
id = "compact-audit"
command = ".agents/hooks/scripts/audit.sh"

[permissions]
default = "deny"

[[permissions.rules]]
id = "git"
tool = "Bash"
pattern = "git *"
decision = "allow"

[[permissions.rules]]
id = "review"
tool = "Edit"
decision = "ask"

[[permissions.rules]]
id = "secrets"
tool = "Read"
pattern = ".env*"
decision = "deny"

[statusline]
items = ["model", "cwd", "branch", "tokens", "cost", "agent", "session", "time"]

[output_style]
tone = "terse"
`;

const SKILL = `---
name: release-check
description: Check a release
---

# Release check
`;

const PRESET_SKILL = `---
name: preset-review
description: Review a release preset
---

# Preset review
`;

const COMMAND = `---
description: Prepare a release
---

# Prepare release
`;

const OPEN_CODE_COMMAND = `---
description: Prepare a release
agent: reviewer
model: anthropic/claude-sonnet-4-20250514
variant: high
subtask: true
argument-hint: <version>
allowed-tools: [Read, Bash]
---

# Prepare release
`;

const PRESET_COMMAND = `---
description: Prepare a preset release
---

# Prepare preset release
`;

const AGENT = `---
description: Reviews release changes
tools: Bash
model: fast
codex:
  nickname_candidates:
    - Scout
  max_depth: 2
---

# Release reviewer
`;

const PRESET_AGENT = `---
description: Reviews preset release changes
---

# Preset release reviewer
`;

const ALWAYS_RULE = `---
description: Always review release changes
---

# Always review
`;

const SCOPED_RULE = `---
description: Review TypeScript changes
paths:
  - "src/**"
---

# Review TypeScript
`;

async function seedCanonicalFixture(
  projectRoot: string,
  tool: ReleaseTool,
): Promise<void> {
  const files = [
    [".agents/agentsync.toml", CONFIG_TEMPLATE(tool)],
    [".agents/skills/release-check/SKILL.md", SKILL],
    ["release-preset/skills/preset-review/SKILL.md", PRESET_SKILL],
    ["release-preset/commands/preset-release.md", PRESET_COMMAND],
    ["release-preset/agents/preset-reviewer.md", PRESET_AGENT],
    [
      ".agents/commands/release-check.md",
      tool === "opencode" ? OPEN_CODE_COMMAND : COMMAND,
    ],
    [".agents/agents/reviewer.md", AGENT],
    [".agents/rules/always.md", ALWAYS_RULE],
    [".agents/rules/scoped.md", SCOPED_RULE],
    [".agents/hooks/scripts/audit.sh", "#!/bin/sh\nexit 0\n"],
    ["AGENTS.md", "# Project instructions\n"],
    ["server.js", "process.exit(0);\n"],
  ] satisfies Array<[string, string]>;

  await Promise.all(
    [".git", ...files.map(([relativePath]) => path.dirname(relativePath))].map(
      (directory) =>
        mkdir(path.join(projectRoot, directory), { recursive: true }),
    ),
  );
  await Promise.all(
    files.map(([relativePath, content]) =>
      writeFile(path.join(projectRoot, relativePath), content),
    ),
  );
  await chmod(path.join(projectRoot, ".agents/hooks/scripts/audit.sh"), 0o755);
}

function runBuiltSync(projectRoot: string, homeRoot: string) {
  const env = {
    ...process.env,
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    XDG_CONFIG_HOME: path.join(homeRoot, ".config"),
    NO_COLOR: "1",
    AGENTSYNC_CODEX_HOME_MCP: undefined,
    AGENTSYNC_PROFILE: undefined,
  };

  const child = spawnSync(process.execPath, [CLI_PATH, "sync", "--json"], {
    cwd: projectRoot,
    env,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 5 * 1024 * 1024,
  });

  if (child.error) {
    throw new Error(`agentsync sync failed to start: ${child.error.message}`);
  }
  if (child.status !== 0) {
    throw new Error(
      `agentsync sync failed (exit ${child.status ?? "unknown"}): ` +
        `stdout=${child.stdout} stderr=${child.stderr}`,
    );
  }

  return parseJsonValidated(child.stdout, SyncCliResultSchema);
}

function runClaudeStatusline(projectRoot: string, command: string) {
  const scriptPath = path.join(projectRoot, command);
  const child = spawnSync(
    process.platform === "win32" ? "bash" : scriptPath,
    process.platform === "win32" ? [command] : [],
    {
      cwd: projectRoot,
      encoding: "utf-8",
      input: JSON.stringify({
        cwd: "/unused/fallback",
        session_id: "test-session-abc",
        model: { id: "claude-opus-4-7", display_name: "Opus" },
        workspace: { current_dir: projectRoot, project_dir: projectRoot },
        cost: { total_cost_usd: 0.01234 },
        context_window: {
          total_input_tokens: 15_500,
          total_output_tokens: 1_200,
          context_window_size: 200_000,
          used_percentage: 8,
        },
        agent: { name: "security-reviewer" },
      }),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: CLI_TIMEOUT_MS,
    },
  );

  if (child.error || child.status !== 0) {
    throw new Error(
      `Claude statusline failed: ${child.error?.message ?? `exit ${child.status}`} ` +
        `stdout=${child.stdout} stderr=${child.stderr}`,
    );
  }

  const [humanLine, sentinelLine] = child.stdout.trimEnd().split("\n");
  if (!(humanLine && sentinelLine?.startsWith("<<ctx>>"))) {
    throw new Error(
      `Claude statusline emitted an invalid payload: ${child.stdout}`,
    );
  }
  return {
    parts: humanLine.split(" | "),
    context: parseJsonValidated(
      sentinelLine.slice("<<ctx>>".length),
      ClaudeContextSentinelSchema,
    ),
  };
}

function expectWarning(warnings: string[] | undefined, fragment: string): void {
  expect(warnings ?? []).toEqual(
    expect.arrayContaining([expect.stringContaining(fragment)]),
  );
}

async function readProjectFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf-8");
}

async function expectProjectFile(
  projectRoot: string,
  relativePath: string,
  expectedContent: string,
): Promise<void> {
  expect(await readProjectFile(projectRoot, relativePath)).toBe(
    expectedContent,
  );
}

async function expectProjectFileContains(
  projectRoot: string,
  relativePath: string,
  expectedContent: string,
): Promise<void> {
  expect(await readProjectFile(projectRoot, relativePath)).toContain(
    expectedContent,
  );
}

async function readProjectedAgent<T>(
  projectRoot: string,
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<{ frontmatter: T; body: string }> {
  const content = await readProjectFile(projectRoot, relativePath);
  const parsed = splitFrontmatter(content);
  return { frontmatter: schema.parse(parsed.fm), body: parsed.body };
}

async function readProjectToml<T>(
  projectRoot: string,
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return schema.parse(
    parseToml(await readProjectFile(projectRoot, relativePath)),
  );
}

async function readProjectJson<T>(
  projectRoot: string,
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return readJsonValidated(path.join(projectRoot, relativePath), schema);
}

async function expectGeneratedAgentPair<T>(
  projectRoot: string,
  directory: string,
  schema: z.ZodType<T>,
  expected: {
    project: T;
    preset: T;
    absentFields: string[];
  },
): Promise<void> {
  const cases = [
    {
      path: `${directory}/reviewer.md`,
      frontmatter: expected.project,
      body: "# Release reviewer",
    },
    {
      path: `${directory}/release-preset--preset-reviewer.md`,
      frontmatter: expected.preset,
      body: "# Preset release reviewer",
    },
  ];

  for (const testCase of cases) {
    const agent = await readProjectedAgent(projectRoot, testCase.path, schema);
    expect(agent.frontmatter).toEqual(testCase.frontmatter);
    for (const field of expected.absentFields) {
      expect(agent.frontmatter).not.toHaveProperty(field);
    }
    expect(agent.body.trim()).toBe(testCase.body);
  }
}

function expectProjection(
  result: z.infer<typeof SyncCliResultSchema>,
  tool: ReleaseTool,
  expected: {
    skills: string[];
    commands: string[];
    agents: string[];
    rules: string[];
  },
): void {
  expect(result).toMatchObject({
    version: "1.0",
    status: "success",
    command: "sync",
  });
  expect(result.data.tools).toEqual([tool]);
  expect(result.data.skills).toBe(expected.skills.length);
  expect(result.data.commands).toBe(expected.commands.length);
  expect(result.data.agents).toBe(expected.agents.length);
  expect(result.data.mcpServers).toBe(1);
  expect(result.data.details).toEqual([
    {
      tool,
      ...expected,
      mcp: ["release"],
    },
  ]);
}

describe("built CLI release matrix", () => {
  let testRoot: string;
  let projectRoot: string;
  let homeRoot: string;

  beforeAll(async () => {
    const cliStats = await stat(CLI_PATH);
    if (!cliStats.isFile()) {
      throw new Error(`Expected prebuilt CLI file at ${CLI_PATH}`);
    }
  });

  beforeEach(async () => {
    testRoot = await mkdtemp(path.join(tmpdir(), "agentsync-cli-matrix-"));
    projectRoot = path.join(testRoot, "project");
    homeRoot = path.join(testRoot, "home");
    await Promise.all([
      mkdir(projectRoot, { recursive: true }),
      mkdir(homeRoot, { recursive: true }),
    ]);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("projects every canonical surface to Claude Code", async () => {
    await seedCanonicalFixture(projectRoot, "claude");
    const result = runBuiltSync(projectRoot, homeRoot);

    expectProjection(result, "claude", {
      skills: ["release-preset--preset-review", "release-check"],
      commands: ["release-preset--preset-release.md", "release-check.md"],
      agents: ["release-preset--preset-reviewer.md", "reviewer.md"],
      rules: ["always", "scoped"],
    });
    expectWarning(
      result.warnings,
      'permissions.default="deny" mapped to Claude Code defaultMode="dontAsk"',
    );
    expectWarning(
      result.warnings,
      "built-in read-only Bash commands and PreToolUse-hook-approved calls may still run",
    );
    expectWarning(result.warnings, "dropped invalid model 'fast'");
    expectWarning(
      result.warnings,
      "dropped unsupported frontmatter fields: codex",
    );

    await expectProjectFileContains(
      projectRoot,
      ".claude/skills/release-check/SKILL.md",
      "# Release check",
    );
    await expectProjectFileContains(
      projectRoot,
      ".claude/skills/release-preset--preset-review/SKILL.md",
      "name: release-preset--preset-review",
    );
    await expectProjectFileContains(
      projectRoot,
      ".claude/commands/release-check.md",
      "# Prepare release",
    );
    await expectProjectFile(
      projectRoot,
      ".claude/commands/release-preset--preset-release.md",
      PRESET_COMMAND,
    );
    await expectGeneratedAgentPair(
      projectRoot,
      ".claude/agents",
      ClaudeAgentSchema,
      {
        project: {
          name: "reviewer",
          description: "Reviews release changes",
          tools: "Bash",
        },
        preset: {
          name: "release-preset--preset-reviewer",
          description: "Reviews preset release changes",
        },
        absentFields: ["codex", "model"],
      },
    );

    const mcp = await readProjectJson(
      projectRoot,
      ".mcp.json",
      StandardMcpFileSchema,
    );
    expect(mcp.mcpServers.release.env.RELEASE_MODE).toBe("test");

    const settings = await readProjectJson(
      projectRoot,
      ".claude/settings.json",
      ClaudeSettingsSchema,
    );
    expect(settings.hooks.PreToolUse[0].hooks[0]).toMatchObject({
      command: ".claude/hooks/scripts/audit.sh",
      timeout: 2,
    });
    expect(settings.hooks.PostCompact[0].hooks[0].command).toBe(
      ".claude/hooks/scripts/audit.sh",
    );
    expect(settings.permissions).toEqual({
      allow: ["Bash(git *)"],
      ask: ["Edit"],
      deny: ["Read(.env*)"],
      defaultMode: "dontAsk",
    });
    expect(settings.statusLine.command).toBe(".claude/statusline/render.sh");
    expect(settings.outputStyle).toBe("Concise");
    const statusline = runClaudeStatusline(
      projectRoot,
      settings.statusLine.command,
    );
    expect(statusline.parts.slice(0, 7)).toEqual([
      "Opus",
      projectRoot,
      "",
      "15500",
      "0.01234",
      "security-reviewer",
      "test-session-abc",
    ]);
    expect(statusline.parts[7]).toMatch(/^\d{2}:\d{2}$/u);
    expect(statusline.context).toEqual({
      pct: 8,
      in: 15_500,
      max: 200_000,
      cost: 0.01234,
    });
    await expectProjectFile(
      projectRoot,
      ".claude/rules/scoped.md",
      SCOPED_RULE,
    );
    await expectProjectFile(projectRoot, "CLAUDE.md", "@AGENTS.md\n");
  });

  it("keeps Codex skills native and reports unsupported projections", async () => {
    await seedCanonicalFixture(projectRoot, "codex");
    const result = runBuiltSync(projectRoot, homeRoot);

    expectProjection(result, "codex", {
      skills: ["release-preset--preset-review"],
      commands: [],
      agents: ["release-preset--preset-reviewer.md", "reviewer.md"],
      rules: [],
    });
    await expectProjectFileContains(
      projectRoot,
      ".agents/skills/release-check/SKILL.md",
      "# Release check",
    );
    await expectProjectFileContains(
      projectRoot,
      ".codex/skills/release-preset--preset-review/SKILL.md",
      "name: release-preset--preset-review",
    );
    expect(await pathExists(path.join(projectRoot, ".codex", "commands"))).toBe(
      false,
    );

    await expectProjectFileContains(
      projectRoot,
      ".codex/agents/reviewer.md",
      "# Release reviewer",
    );
    await expectProjectFile(
      projectRoot,
      ".codex/agents/release-preset--preset-reviewer.md",
      PRESET_AGENT,
    );
    const agentConfig = await readProjectToml(
      projectRoot,
      ".codex/agents/reviewer.toml",
      CodexAgentConfigSchema("reviewer.md"),
    );
    expect(agentConfig.model_instructions_file).toBe("reviewer.md");
    const presetAgentConfig = await readProjectToml(
      projectRoot,
      ".codex/agents/release-preset--preset-reviewer.toml",
      CodexAgentConfigSchema("release-preset--preset-reviewer.md"),
    );
    expect(presetAgentConfig.model_instructions_file).toBe(
      "release-preset--preset-reviewer.md",
    );

    const rawConfig = await readProjectToml(
      projectRoot,
      ".codex/config.toml",
      z.record(z.string(), z.unknown()),
    );
    expect(rawConfig).not.toHaveProperty("hooks");
    const config = CodexConfigSchema.parse(rawConfig);
    expect(config.mcp_servers.release.env.RELEASE_MODE).toBe("test");
    expect(config.agents.reviewer.config_file).toBe("agents/reviewer.toml");
    expect(config.tui.status_line).toEqual([
      "model",
      "current-dir",
      "git-branch",
      "context-used",
      "thread-id",
    ]);
    expect(config.personality).toBe("none");

    expectWarning(
      result.warnings,
      "codex does not support commands; 2 commands skipped",
    );
    expectWarning(result.warnings, "rules are not synced to Codex CLI");
    expectWarning(result.warnings, "hook audit for PreToolUse dropped");
    expectWarning(
      result.warnings,
      "hook compact-audit for PostCompact dropped",
    );
    for (const rule of ["git", "review", "secrets"]) {
      expectWarning(result.warnings, `permissions.rule ${rule}`);
    }
    for (const item of ["cost", "agent", "time"]) {
      expectWarning(result.warnings, `statusline item ${item} dropped`);
    }
    expectWarning(result.warnings, "codex.max_depth dropped");
  });

  it("projects OpenCode surfaces and reports every lossy channel", async () => {
    await seedCanonicalFixture(projectRoot, "opencode");
    const result = runBuiltSync(projectRoot, homeRoot);

    expectProjection(result, "opencode", {
      skills: [],
      commands: ["release-preset--preset-release.md", "release-check.md"],
      agents: ["release-preset--preset-reviewer.md", "reviewer.md"],
      rules: ["always"],
    });
    expect(
      await pathExists(path.join(projectRoot, ".opencode", "skills")),
    ).toBe(false);
    await expectProjectFileContains(
      projectRoot,
      ".agents/skills/release-check/SKILL.md",
      "# Release check",
    );
    const command = await readProjectedAgent(
      projectRoot,
      ".opencode/commands/release-check.md",
      OpenCodeCommandSchema,
    );
    expect(command.frontmatter).toEqual({
      description: "Prepare a release",
      agent: "reviewer",
      model: "anthropic/claude-sonnet-4-20250514",
      variant: "high",
      subtask: true,
    });
    expect(command.body.trim()).toBe("# Prepare release");
    await expectProjectFile(
      projectRoot,
      ".opencode/commands/release-preset--preset-release.md",
      PRESET_COMMAND,
    );

    const agent = await readProjectFile(
      projectRoot,
      ".opencode/agents/reviewer.md",
    );
    expect(agent).toContain("mode: subagent");
    expect(agent).not.toMatch(/^tools:/m);
    expect(agent).not.toMatch(/^model:/m);
    const presetAgent = await readProjectFile(
      projectRoot,
      ".opencode/agents/release-preset--preset-reviewer.md",
    );
    const presetAgentParts = splitFrontmatter(presetAgent);
    expect(
      z
        .object({
          description: z.literal("Reviews preset release changes"),
          mode: z.literal("subagent"),
        })
        .strict()
        .parse(presetAgentParts.fm),
    ).toEqual({
      description: "Reviews preset release changes",
      mode: "subagent",
    });
    expect(presetAgentParts.body.trim()).toBe("# Preset release reviewer");

    const config = await readProjectJson(
      projectRoot,
      "opencode.json",
      OpenCodeConfigSchema,
    );
    expect(config.mcp.release.command).toEqual(["node", "server.js"]);
    expect(config.permission).toEqual({
      "*": "deny",
      bash: { "git *": "allow" },
      edit: { "*": "ask" },
      read: { ".env*": "deny" },
    });
    expect(config.instructions).toEqual([".agents/rules/always.md"]);
    expect(await pathExists(path.join(projectRoot, ".opencode", "hooks"))).toBe(
      false,
    );

    expectWarning(result.warnings, "dropped 'tools' allowlist");
    expectWarning(result.warnings, "dropped unqualified model 'fast'");
    expectWarning(
      result.warnings,
      "dropped unsupported frontmatter fields: allowed-tools, argument-hint",
    );
    expectWarning(result.warnings, 'rule "scoped" is path-scoped');
    expectWarning(result.warnings, "hook audit for PreToolUse dropped");
    expectWarning(
      result.warnings,
      "hook compact-audit for PostCompact dropped",
    );
    expectWarning(
      result.warnings,
      "opencode does not support statusline; configuration skipped",
    );
    expectWarning(
      result.warnings,
      "opencode does not support output style; configuration skipped",
    );
    expectWarning(result.warnings, "release-preset--preset-review");
  });

  it("uses Cursor's native skills and generated project surfaces", async () => {
    await seedCanonicalFixture(projectRoot, "cursor");
    const result = runBuiltSync(projectRoot, homeRoot);

    expectProjection(result, "cursor", {
      skills: ["release-preset--preset-review"],
      commands: ["release-preset--preset-release.md", "release-check.md"],
      agents: ["release-preset--preset-reviewer.md", "reviewer.md"],
      rules: ["always", "scoped"],
    });
    await expectProjectFileContains(
      projectRoot,
      ".cursor/skills/release-preset--preset-review/SKILL.md",
      "name: release-preset--preset-review",
    );
    await expectProjectFileContains(
      projectRoot,
      ".agents/skills/release-check/SKILL.md",
      "# Release check",
    );
    await expectProjectFileContains(
      projectRoot,
      ".cursor/commands/release-check.md",
      "# Prepare release",
    );
    await expectProjectFile(
      projectRoot,
      ".cursor/commands/release-preset--preset-release.md",
      PRESET_COMMAND,
    );
    await expectGeneratedAgentPair(
      projectRoot,
      ".cursor/agents",
      CursorAgentSchema,
      {
        project: {
          name: "reviewer",
          description: "Reviews release changes",
          model: "fast",
        },
        preset: {
          name: "release-preset--preset-reviewer",
          description: "Reviews preset release changes",
        },
        absentFields: ["codex", "tools"],
      },
    );

    const mcp = await readProjectJson(
      projectRoot,
      ".cursor/mcp.json",
      StandardMcpFileSchema,
    );
    expect(mcp.mcpServers.release.command).toBe("node");

    const hooks = await readProjectJson(
      projectRoot,
      ".cursor/hooks.json",
      CursorHooksSchema,
    );
    expect(hooks.hooks.preToolUse).toEqual([
      {
        command: ".cursor/hooks/audit.sh",
        matcher: "Shell",
        timeout: 2,
      },
    ]);
    expect(hooks.hooks).not.toHaveProperty("postCompact");

    const permissions = await readProjectJson(
      projectRoot,
      ".cursor/cli.json",
      CursorPermissionsSchema,
    );
    expect(permissions.permissions).toEqual({
      allow: ["Shell(git:*)"],
      deny: ["Read(.env*)"],
    });

    const alwaysRule = await readProjectFile(
      projectRoot,
      ".cursor/rules/always.mdc",
    );
    expect(alwaysRule).toContain("alwaysApply: true");
    const scopedRule = await readProjectFile(
      projectRoot,
      ".cursor/rules/scoped.mdc",
    );
    expect(scopedRule).toContain("globs: src/**");
    expect(scopedRule).toContain("alwaysApply: false");

    expectWarning(
      result.warnings,
      "hook compact-audit for PostCompact dropped",
    );
    expectWarning(
      result.warnings,
      "dropped unsupported frontmatter fields: codex, tools",
    );
    expectWarning(result.warnings, "explicit ask rule dropped on cursor");
    expectWarning(
      result.warnings,
      'permissions.default="deny" dropped on cursor',
    );
    expectWarning(
      result.warnings,
      "cursor does not support statusline; configuration skipped",
    );
    expectWarning(
      result.warnings,
      "cursor does not support output style; configuration skipped",
    );
  });
});
