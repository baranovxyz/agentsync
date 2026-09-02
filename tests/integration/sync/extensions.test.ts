/**
 * Sync extensions (hooks, permissions, statusline, output_style) — verify
 * canonical declarations land correctly per CLI.
 */

import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ExtensionsInput,
  previewExtensions as previewExtensionArtifacts,
  syncExtensions as syncExtensionArtifacts,
} from "../../../src/sync/extensions.js";
import {
  readManifest,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import { applyStructuredLifecyclePlan } from "../../../src/sync/structured-lifecycle.js";
import {
  planToolStructuredLifecycle,
  refreshToolStructuredLifecycle,
} from "../../../src/sync/structured-providers.js";
import { getToolProvider } from "../../../src/tools/index.js";
import type { ToolProvider } from "../../../src/tools/types.js";
import { HOOK_EVENTS, ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  ensureDir,
  outputFile,
  pathExists,
  readJsonValidated,
} from "../../../src/utils/fs.js";

const OpenCodePermissionActionSchema = z.enum(["allow", "ask", "deny"]);
const OpenCodeGranularPermissionSchema = z.union([
  OpenCodePermissionActionSchema,
  z.record(z.string(), OpenCodePermissionActionSchema),
]);
const OpenCodePermissionSchema = z
  .object({
    read: OpenCodeGranularPermissionSchema.optional(),
    edit: OpenCodeGranularPermissionSchema.optional(),
    glob: OpenCodeGranularPermissionSchema.optional(),
    grep: OpenCodeGranularPermissionSchema.optional(),
    list: OpenCodeGranularPermissionSchema.optional(),
    bash: OpenCodeGranularPermissionSchema.optional(),
    task: OpenCodeGranularPermissionSchema.optional(),
    external_directory: OpenCodeGranularPermissionSchema.optional(),
    lsp: OpenCodeGranularPermissionSchema.optional(),
    skill: OpenCodeGranularPermissionSchema.optional(),
    todowrite: OpenCodePermissionActionSchema.optional(),
    webfetch: OpenCodePermissionActionSchema.optional(),
    websearch: OpenCodePermissionActionSchema.optional(),
    question: OpenCodePermissionActionSchema.optional(),
    doom_loop: OpenCodePermissionActionSchema.optional(),
  })
  .catchall(OpenCodeGranularPermissionSchema);

const ClaudeHookSettingsSchema = z.object({
  hooks: z.record(
    z.string(),
    z.array(
      z.object({
        matcher: z.string().optional(),
        hooks: z.array(
          z.object({
            type: z.literal("command"),
            command: z.string(),
            timeout: z.number().optional(),
          }),
        ),
      }),
    ),
  ),
});

const CursorHookSettingsSchema = z.object({
  version: z.literal(1).optional(),
  hooks: z.record(
    z.string(),
    z.array(
      z.object({
        command: z.string(),
        matcher: z.string().optional(),
        timeout: z.number().optional(),
      }),
    ),
  ),
});

const CursorPermissionSettingsSchema = z.object({
  permissions: z.object({
    allow: z.array(z.string()),
    deny: z.array(z.string()),
  }),
});

const ClaudePermissionSettingsSchema = z.object({
  permissions: z.object({
    allow: z.array(z.string()),
    ask: z.array(z.string()),
    deny: z.array(z.string()),
    defaultMode: z.string().optional(),
  }),
});

const StatusLineSettingsSchema = z.object({
  statusLine: z.object({ type: z.string(), command: z.string() }),
});

type ExtensionTool = "claude" | "codex" | "cursor" | "opencode";
type OutputTone = NonNullable<ExtensionsInput["outputStyle"]>["tone"];

const UNMAPPED_CLAUDE_TONES = [
  "friendly",
  "pragmatic",
  "none",
] satisfies OutputTone[];

function providersFor(...tools: ExtensionTool[]): ToolProvider[] {
  return tools.map(getToolProvider);
}

async function readText(cwd: string, relativePath: string): Promise<string> {
  return readFile(path.join(cwd, relativePath), "utf-8");
}

async function readJsonConfig<T>(
  cwd: string,
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return readJsonValidated(path.join(cwd, relativePath), schema);
}

async function readCodexConfig(cwd: string) {
  return ToolSettingsSchema.parse(
    parseToml(await readText(cwd, ".codex/config.toml")),
  );
}

async function previewExtensions(
  providers: ToolProvider[],
  input: ExtensionsInput,
  cwd: string,
) {
  const lifecycle = await planToolStructuredLifecycle({
    cwd,
    providers,
    previousReceipts: (await readManifest(cwd))?.structured_owners,
    desired: { extensions: input, rules: [] },
    preserveUnselected: true,
  });
  return previewExtensionArtifacts(providers, input, cwd, {
    protectedDependencies: lifecycle.protectedDependencies,
  });
}

async function syncExtensions(
  providers: ToolProvider[],
  input: ExtensionsInput,
  cwd: string,
) {
  const request = {
    cwd,
    providers,
    previousReceipts: (await readManifest(cwd))?.structured_owners,
    desired: { extensions: input, rules: [] },
    preserveUnselected: true,
  };
  const lifecycle = await planToolStructuredLifecycle(request);
  const results = await syncExtensionArtifacts(providers, input, cwd, {
    protectedDependencies: lifecycle.protectedDependencies,
  });
  const refreshed = await refreshToolStructuredLifecycle(request, lifecycle);
  const applied = await applyStructuredLifecyclePlan(refreshed);
  await writeOwnedManifest(cwd, new Map(), {
    preserveUnselected: true,
    replaceTools: providers.map((provider) => provider.name),
    structuredOwners: applied.plan.nextReceipts,
  });
  return results;
}

async function previewToolExtensions(
  tool: ExtensionTool,
  input: ExtensionsInput,
  cwd: string,
) {
  const [result] = await previewExtensions(providersFor(tool), input, cwd);
  return result;
}

async function syncToolExtensions(
  tool: ExtensionTool,
  input: ExtensionsInput,
  cwd: string,
) {
  const [result] = await syncExtensions(providersFor(tool), input, cwd);
  return result;
}

async function previewAndSyncToolExtensions(
  tool: ExtensionTool,
  input: ExtensionsInput,
  cwd: string,
) {
  return {
    preview: await previewToolExtensions(tool, input, cwd),
    written: await syncToolExtensions(tool, input, cwd),
  };
}

async function writeHookScript(cwd: string, name: string): Promise<void> {
  const script = path.join(cwd, ".agents", "hooks", "scripts", name);
  await outputFile(script, "#!/bin/sh\necho hi\n");
  await chmod(script, 0o755);
}

describe("syncExtensions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-extensions-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("hooks", () => {
    it("writes cc hooks into .claude/settings.json and copies scripts", async () => {
      await writeHookScript(tmpDir, "log.sh");

      await syncToolExtensions(
        "claude",
        {
          hooks: {
            PreToolUse: [
              {
                id: "log-writes",
                matcher: "Bash|Edit|Write",
                command: ".agents/hooks/scripts/log.sh",
                timeout: 5000,
              },
            ],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        ClaudeHookSettingsSchema,
      );
      const [hookGroup] = settings.hooks.PreToolUse;
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(hookGroup.matcher).toBe("Bash|Edit|Write");
      expect(hookGroup.hooks[0]).toMatchObject({
        type: "command",
        timeout: 5,
      });
      expect(hookGroup.hooks[0].command).toContain(
        ".claude/hooks/scripts/log.sh",
      );
    });

    it("maps supported Cursor events, scripts, and timeout units", async () => {
      await writeHookScript(tmpDir, "log.sh");

      const result = await syncToolExtensions(
        "cursor",
        {
          hooks: {
            PreToolUse: [
              {
                id: "log-writes",
                matcher: "Bash|Edit|Write",
                command: ".agents/hooks/scripts/log.sh",
                timeout: 1501,
              },
            ],
            PostCompact: [
              { id: "unsupported", command: ".agents/hooks/scripts/log.sh" },
            ],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/hooks.json",
        CursorHookSettingsSchema,
      );
      expect(settings.version).toBe(1);
      expect(settings.hooks.preToolUse).toEqual([
        {
          command: ".cursor/hooks/log.sh",
          matcher: "Shell|Write",
          timeout: 2,
        },
      ]);
      expect(result.hooksWritten).toBe(1);
      expect(result.droppedHooks).toEqual([
        expect.objectContaining({ event: "PostCompact", id: "unsupported" }),
      ]);
      expect(
        await pathExists(path.join(tmpDir, ".cursor", "hooks", "log.sh")),
      ).toBe(true);
    });

    it("projects Cursor PostToolUseFailure with a tool matcher", async () => {
      expect(HOOK_EVENTS).toContain("PostToolUseFailure");
      const script = path.join(
        tmpDir,
        ".agents",
        "hooks",
        "scripts",
        "audit.sh",
      );
      await outputFile(script, "#!/bin/sh\necho hi\n");
      const input: ExtensionsInput = {
        hooks: {
          PostToolUseFailure: [
            {
              id: "audit-failure",
              matcher: "Bash",
              command: ".agents/hooks/scripts/audit.sh",
              timeout: 1500,
            },
          ],
        },
      };

      const { preview, written } = await previewAndSyncToolExtensions(
        "cursor",
        input,
        tmpDir,
      );

      expect(written).toMatchObject({
        hooksWritten: 1,
        droppedHooks: [],
        warnings: [],
      });
      expect(written).toMatchObject({
        hooksWritten: preview.hooksWritten,
        droppedHooks: preview.droppedHooks,
        warnings: preview.warnings,
      });
      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/hooks.json",
        CursorHookSettingsSchema,
      );
      expect(settings.version).toBe(1);
      expect(settings.hooks.postToolUseFailure).toEqual([
        {
          command: ".cursor/hooks/audit.sh",
          matcher: "Shell",
          timeout: 2,
        },
      ]);
    });

    it("filters unsupported Cursor tool matchers and preserves preview counts", async () => {
      const input: ExtensionsInput = {
        hooks: {
          PreToolUse: [
            {
              id: "mixed-tools",
              matcher: "Bash|Glob|UnknownTool|Edit",
              command: "audit-tools",
            },
          ],
        },
      };

      const preview = await previewToolExtensions("cursor", input, tmpDir);
      expect(preview.hooksWritten).toBe(1);
      expect(preview.droppedHooks).toEqual([]);
      expect(preview.warnings).toEqual([
        expect.stringContaining("matcher token 'Glob' dropped"),
        expect.stringContaining("matcher token 'UnknownTool' dropped"),
      ]);
      expect(await pathExists(path.join(tmpDir, ".cursor", "hooks.json"))).toBe(
        false,
      );

      const result = await syncToolExtensions("cursor", input, tmpDir);
      expect(result).toMatchObject({
        hooksWritten: preview.hooksWritten,
        droppedHooks: preview.droppedHooks,
        warnings: preview.warnings,
      });

      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/hooks.json",
        CursorHookSettingsSchema,
      );
      expect(settings.hooks.preToolUse).toEqual([
        { command: "audit-tools", matcher: "Shell|Write" },
      ]);
    });

    it("omits lifecycle matchers Cursor does not use as tool filters", async () => {
      const result = await syncToolExtensions(
        "cursor",
        {
          hooks: {
            SessionStart: [
              { id: "start", matcher: "startup", command: "audit-start" },
            ],
            UserPromptSubmit: [
              { id: "prompt", matcher: "Bash", command: "audit-prompt" },
            ],
            SubagentStart: [
              {
                id: "subagent",
                matcher: "explore|shell",
                command: "audit-subagent",
              },
            ],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/hooks.json",
        CursorHookSettingsSchema,
      );
      expect(settings.hooks.sessionStart).toEqual([{ command: "audit-start" }]);
      expect(settings.hooks.beforeSubmitPrompt).toEqual([
        { command: "audit-prompt" },
      ]);
      expect(settings.hooks.subagentStart).toEqual([
        { command: "audit-subagent", matcher: "explore|shell" },
      ]);
      expect(result.hooksWritten).toBe(3);
      expect(result.warnings).toEqual([
        expect.stringContaining("hook 'start' for SessionStart"),
        expect.stringContaining("hook 'prompt' for UserPromptSubmit"),
      ]);
    });

    it("translates Claude-style MCP hook matchers to Cursor tool names", async () => {
      const result = await syncToolExtensions(
        "cursor",
        {
          hooks: {
            PreToolUse: [
              {
                id: "mcp-audit",
                matcher: "mcp__github__create_issue",
                command: "audit-mcp",
              },
            ],
          },
        },
        tmpDir,
      );

      expect(result.hooksWritten).toBe(1);
      expect(result.droppedHooks).toEqual([]);
      expect(result.warnings).toEqual([
        expect.stringContaining("translated to 'MCP:create_issue' on cursor"),
      ]);
      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/hooks.json",
        CursorHookSettingsSchema,
      );
      expect(settings.hooks.preToolUse).toEqual([
        { command: "audit-mcp", matcher: "MCP:create_issue" },
      ]);
    });

    it("drops a Cursor hook when every tool matcher token is unsupported", async () => {
      const result = await syncToolExtensions(
        "cursor",
        {
          hooks: {
            PreToolUse: [
              {
                id: "unsupported-tools",
                matcher: "Glob|WebFetch|UnknownTool",
                command: "audit-tools",
              },
            ],
          },
        },
        tmpDir,
      );

      expect(result.hooksWritten).toBe(0);
      expect(result.droppedHooks).toEqual([
        expect.objectContaining({
          event: "PreToolUse",
          id: "unsupported-tools",
          reason: expect.stringContaining("no Cursor-supported tool tokens"),
        }),
      ]);
      expect(await pathExists(path.join(tmpDir, ".cursor", "hooks.json"))).toBe(
        false,
      );
    });

    it("drops all hooks for cx and surfaces a reason per declaration", async () => {
      await writeHookScript(tmpDir, "ctx.sh");

      const result = await syncToolExtensions(
        "codex",
        {
          hooks: {
            SessionStart: [
              { id: "inject-ctx", command: ".agents/hooks/scripts/ctx.sh" },
            ],
            PreToolUse: [
              {
                id: "log-bash",
                matcher: "Bash",
                command: ".agents/hooks/scripts/ctx.sh",
              },
            ],
          },
        },
        tmpDir,
      );

      const cfg = path.join(tmpDir, ".codex", "config.toml");
      if (await pathExists(cfg)) {
        const config = ToolSettingsSchema.parse(
          parseToml(await readText(tmpDir, ".codex/config.toml")),
        );
        expect(config.hooks).toBeUndefined();
      }

      expect(result.hooksWritten).toBe(0);
      expect(result.droppedHooks).toHaveLength(2);
      for (const dropped of result.droppedHooks) {
        expect(dropped.reason).toContain("does not support hooks");
      }
    });
  });

  describe("permissions", () => {
    it("writes Cursor CLI allow/deny tokens and warns on lossy defaults", async () => {
      const input: ExtensionsInput = {
        permissions: {
          default: "deny",
          rules: [
            {
              id: "git",
              tool: "Bash",
              pattern: "git *",
              decision: "allow",
            },
            {
              id: "secrets",
              tool: "Read",
              pattern: ".env*",
              decision: "deny",
            },
            { id: "review", tool: "Edit", decision: "ask" },
            { id: "all-mcp", tool: "MCP", decision: "deny" },
            {
              id: "bad-mcp",
              tool: "MCP",
              pattern: "github",
              decision: "allow",
            },
            {
              id: "empty-server",
              tool: "MCP",
              pattern: ":tool",
              decision: "allow",
            },
            {
              id: "empty-tool",
              tool: "MCP",
              pattern: "server:",
              decision: "allow",
            },
            {
              id: "too-many-parts",
              tool: "MCP",
              pattern: "one:two:three",
              decision: "allow",
            },
            {
              id: "exact-mcp",
              tool: "MCP",
              pattern: "github:search",
              decision: "allow",
            },
            {
              id: "unsupported-search",
              tool: "WebSearch",
              decision: "allow",
            },
          ],
        },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "cursor",
        input,
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".cursor/cli.json",
        CursorPermissionSettingsSchema,
      );
      expect(settings.permissions.allow).toEqual([
        "Shell(git:*)",
        "Mcp(github:search)",
      ]);
      expect(settings.permissions.deny).toEqual(["Read(.env*)", "Mcp(*:*)"]);
      expect(written.warnings).toEqual([
        expect.stringContaining("explicit ask rule dropped"),
        expect.stringContaining("MCP pattern 'github'"),
        expect.stringContaining("MCP pattern ':tool'"),
        expect.stringContaining("MCP pattern 'server:'"),
        expect.stringContaining("MCP pattern 'one:two:three'"),
        expect.stringContaining(
          "tool 'WebSearch' has no Cursor CLI permission token",
        ),
        expect.stringContaining('permissions.default="deny" dropped'),
      ]);
      expect(written.warnings).toEqual(preview.warnings);
    });

    it("maps canonical rules to cc Tool(pattern) arrays losslessly", async () => {
      const input: ExtensionsInput = {
        permissions: {
          default: "ask",
          rules: [
            {
              id: "npm",
              tool: "Bash",
              pattern: "npm run *",
              decision: "allow",
            },
            { id: "env", tool: "Read", pattern: "./.env", decision: "deny" },
          ],
        },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "claude",
        input,
        tmpDir,
      );

      expect(written.warnings).toEqual([]);
      expect(written.warnings).toEqual(preview.warnings);

      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        ClaudePermissionSettingsSchema,
      );
      expect(settings.permissions.allow).toContain("Bash(npm run *)");
      expect(settings.permissions.deny).toContain("Read(./.env)");
      // canonical default="ask" must map to cc's vocabulary
      // ({default|acceptEdits|bypassPermissions|plan}). Passing "ask" through
      // verbatim would make Claude Code reject the generated mode.
      expect(settings.permissions.defaultMode).toBe("default");
    });

    it("projects Claude permission identities in native grammar", async () => {
      const input: ExtensionsInput = {
        permissions: {
          default: "ask",
          rules: [
            { id: "all-bash", tool: "Bash", decision: "allow" },
            {
              id: "fetch-domain",
              tool: "WebFetch",
              pattern: "example.com",
              decision: "allow",
            },
            { id: "fetch-all", tool: "WebFetch", decision: "ask" },
            {
              id: "write-docs",
              tool: "Write",
              pattern: "docs/**",
              decision: "allow",
            },
            {
              id: "glob-docs",
              tool: "Glob",
              pattern: "docs/**",
              decision: "deny",
            },
            {
              id: "exact-mcp",
              tool: "MCP",
              pattern: "github:list_issues",
              decision: "allow",
            },
            {
              id: "github-mcp",
              tool: "MCP",
              pattern: "github:*",
              decision: "allow",
            },
            { id: "deny-all-mcp", tool: "MCP", decision: "deny" },
            {
              id: "ask-all-mcp",
              tool: "MCP",
              pattern: "*:*",
              decision: "ask",
            },
            { id: "allow-all-mcp", tool: "MCP", decision: "allow" },
            {
              id: "wild-server-allow",
              tool: "MCP",
              pattern: "git*:search",
              decision: "allow",
            },
            {
              id: "malformed-mcp",
              tool: "MCP",
              pattern: "github",
              decision: "deny",
            },
          ],
        },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "claude",
        input,
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        ClaudePermissionSettingsSchema,
      );
      expect(settings.permissions).toEqual({
        allow: [
          "Bash",
          "WebFetch(domain:example.com)",
          "Edit(docs/**)",
          "mcp__github__list_issues",
          "mcp__github__*",
        ],
        ask: ["WebFetch", "mcp__*"],
        deny: ["Read(docs/**)", "mcp__*"],
        defaultMode: "default",
      });
      expect(written.warnings).toEqual([
        "permissions.rule write-docs: Write(docs/**) translated to Edit(docs/**) on claude — " +
          "Claude Code consults path rules only on Edit and Read.",
        "permissions.rule glob-docs: Glob(docs/**) translated to Read(docs/**) on claude — " +
          "Claude Code consults path rules only on Edit and Read.",
        "permissions.rule allow-all-mcp dropped on claude — MCP allow pattern '*' has no safe " +
          "Claude equivalent; Claude Code skips allow globs without a literal mcp__<server>__ prefix.",
        "permissions.rule wild-server-allow dropped on claude — MCP allow pattern 'git*:search' " +
          "has no safe Claude equivalent; Claude Code requires a literal server prefix for allow globs.",
        "permissions.rule malformed-mcp dropped on claude — MCP pattern 'github' is invalid; " +
          "expected server:tool (or *:* for all MCP tools).",
      ]);
      expect(written.warnings).toEqual(preview.warnings);
    });

    it("does not broaden canonical default=allow through a Claude mode", async () => {
      const cwd = path.join(tmpDir, "allow");
      await ensureDir(cwd);
      const input: ExtensionsInput = {
        permissions: { default: "allow" },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "claude",
        input,
        cwd,
      );

      const settings = await readJsonConfig(
        cwd,
        ".claude/settings.json",
        ClaudePermissionSettingsSchema,
      );
      expect(settings.permissions.defaultMode).toBeUndefined();
      expect(written.warnings).toEqual(preview.warnings);
      expect(written.warnings).toEqual([
        expect.stringContaining(
          'permissions.default="allow" dropped on claude',
        ),
      ]);
      expect(written.warnings[0]).toContain("add explicit allow rules");
    });

    it("maps canonical default=deny to Claude dontAsk with a loss warning", async () => {
      const input: ExtensionsInput = {
        permissions: { default: "deny" },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "claude",
        input,
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        ClaudePermissionSettingsSchema,
      );
      expect(settings.permissions.defaultMode).toBe("dontAsk");
      expect(written.warnings).toEqual([
        'permissions.default="deny" mapped to Claude Code defaultMode="dontAsk" — ' +
          "unmatched and explicit ask rules are denied, but built-in read-only Bash commands " +
          "and PreToolUse-hook-approved calls may still run.",
      ]);
      expect(written.warnings).toEqual(preview.warnings);
    });

    it("preserves ordered granular permission patterns on opencode", async () => {
      const result = await syncToolExtensions(
        "opencode",
        {
          permissions: {
            default: "ask",
            rules: [
              { id: "a", tool: "Bash", pattern: "*", decision: "allow" },
              { id: "b", tool: "Bash", pattern: "curl *", decision: "deny" },
              { id: "c", tool: "Bash", pattern: "*", decision: "ask" },
              { id: "d", tool: "Edit", decision: "ask" },
            ],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        "opencode.json",
        z.object({
          permission: z.object({
            "*": z.literal("ask"),
            bash: z.record(z.string(), z.enum(["allow", "ask", "deny"])),
            edit: z.object({ "*": z.literal("ask") }),
          }),
        }),
      );
      expect(settings.permission.bash).toEqual({
        "curl *": "deny",
        "*": "ask",
      });
      expect(Object.keys(settings.permission.bash)).toEqual(["curl *", "*"]);
      expect(result.warnings).toEqual([]);
    });

    it("maps canonical Write permission rules to OpenCode edit", async () => {
      const result = await syncToolExtensions(
        "opencode",
        {
          permissions: {
            rules: [{ id: "only", tool: "Write", decision: "allow" }],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        "opencode.json",
        z.object({
          permission: z.object({
            edit: z.object({ "*": z.literal("allow") }),
          }),
        }),
      );
      expect(settings.permission.edit).toEqual({ "*": "allow" });
      expect(result.warnings).toEqual([]);
    });

    it("uses scalar decisions for OpenCode action-only permissions", async () => {
      const input: ExtensionsInput = {
        permissions: {
          rules: [
            { id: "fetch-all", tool: "WebFetch", decision: "deny" },
            {
              id: "fetch-domain",
              tool: "WebFetch",
              pattern: "example.com",
              decision: "allow",
            },
            {
              id: "search",
              tool: "WebSearch",
              pattern: "*",
              decision: "ask",
            },
            { id: "todos", tool: "TodoWrite", decision: "deny" },
            { id: "question", tool: "Question", decision: "ask" },
            { id: "loop", tool: "DoomLoop", decision: "allow" },
            {
              id: "outside",
              tool: "ExternalDirectory",
              pattern: "/tmp/**",
              decision: "deny",
            },
          ],
        },
      };
      const { preview, written } = await previewAndSyncToolExtensions(
        "opencode",
        input,
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        "opencode.json",
        z.object({ permission: OpenCodePermissionSchema }),
      );
      expect(settings.permission).toMatchObject({
        webfetch: "deny",
        websearch: "ask",
        todowrite: "deny",
        question: "ask",
        doom_loop: "allow",
        external_directory: { "/tmp/**": "deny" },
      });
      expect(written.warnings).toEqual([
        "permissions.rule fetch-domain dropped on opencode — pattern 'example.com' cannot be " +
          "represented because OpenCode webfetch accepts only a tool-level decision.",
      ]);
      expect(written.warnings).toEqual(preview.warnings);
    });

    it("maps safe MCP identities to ordered OpenCode runtime tool keys", async () => {
      const result = await syncToolExtensions(
        "opencode",
        {
          permissions: {
            rules: [
              {
                id: "issue",
                tool: "MCP",
                pattern: "acme.github:create-issue.v2",
                decision: "allow",
              },
              {
                id: "server",
                tool: "MCP",
                pattern: "acme.github:*",
                decision: "deny",
              },
              {
                id: "wild-server",
                tool: "MCP",
                pattern: "*:create-issue",
                decision: "ask",
              },
              {
                id: "all-mcp",
                tool: "MCP",
                pattern: "*:*",
                decision: "deny",
              },
            ],
          },
        },
        tmpDir,
      );

      const settings = await readJsonConfig(
        tmpDir,
        "opencode.json",
        z.object({ permission: OpenCodePermissionSchema }),
      );
      expect(settings.permission["acme_github_create-issue_v2"]).toBe("allow");
      expect(settings.permission["acme_github_*"]).toBe("deny");
      expect(Object.keys(settings.permission)).toEqual([
        "acme_github_create-issue_v2",
        "acme_github_*",
      ]);
      expect(settings.permission).not.toHaveProperty("mcp");
      expect(result.warnings).toEqual([
        "permissions.rule wild-server: MCP pattern '*:create-issue' dropped on opencode — " +
          "a wildcard server segment is not safely MCP-only in OpenCode's flat tool namespace.",
        "permissions.rule all-mcp: MCP pattern '*:*' dropped on opencode — an all-MCP wildcard " +
          "has no safe OpenCode equivalent because '*_*' also matches built-in and custom tools.",
      ]);
    });

    it("emits warnings for cx per-rule mappings (only default maps cleanly)", async () => {
      const result = await syncToolExtensions(
        "codex",
        {
          permissions: {
            default: "ask",
            rules: [
              {
                id: "no-curl",
                tool: "Bash",
                pattern: "curl *",
                decision: "deny",
              },
            ],
          },
        },
        tmpDir,
      );

      const config = await readCodexConfig(tmpDir);
      expect(config.default_permissions).toBe(":workspace");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("not translatable"))).toBe(
        true,
      );
    });
  });

  describe("statusline", () => {
    it("generates render.sh and points cc settings.json#statusLine at it", async () => {
      await syncToolExtensions(
        "claude",
        { statusline: { items: ["model", "cwd", "branch"] } },
        tmpDir,
      );
      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        StatusLineSettingsSchema,
      );
      expect(settings.statusLine).toMatchObject({
        type: "command",
        command: ".claude/statusline/render.sh",
      });
      const script = await readText(tmpDir, ".claude/statusline/render.sh");
      expect(script).toContain("model.display_name model.id");
      expect(script).toContain("workspace.current_dir cwd");
      expect(script).toContain("branch --show-current");
    });

    it("maps only supported Codex status items with preview parity", async () => {
      const input: ExtensionsInput = {
        statusline: {
          items: [
            "model",
            "cwd",
            "branch",
            "tokens",
            "cost",
            "agent",
            "session",
            "time",
          ],
          custom_items: [
            { id: "deploy", command: ".agents/statusline/deploy.sh" },
          ],
        },
      };
      const preview = await previewToolExtensions("codex", input, tmpDir);
      expect(preview.statuslineWritten).toBe(true);
      expect(await pathExists(path.join(tmpDir, ".codex", "config.toml"))).toBe(
        false,
      );

      const result = await syncToolExtensions("codex", input, tmpDir);
      const config = await readCodexConfig(tmpDir);
      const tui = z
        .object({ status_line: z.array(z.string()) })
        .parse(config.tui);
      expect(tui.status_line).toEqual([
        "model",
        "current-dir",
        "git-branch",
        "context-used",
        "thread-id",
      ]);
      expect(result.warnings).toEqual(preview.warnings);
      expect(result.warnings).toEqual([
        expect.stringContaining("item cost dropped"),
        expect.stringContaining("item agent dropped"),
        expect.stringContaining("item time dropped"),
        expect.stringContaining("custom_items dropped"),
      ]);
    });

    it("translates canonical tokens to cx context-used and dedupes", async () => {
      await syncToolExtensions(
        "codex",
        { statusline: { items: ["model", "tokens"] } },
        tmpDir,
      );
      const config = await readCodexConfig(tmpDir);
      const tui = z
        .object({ status_line: z.array(z.string()) })
        .parse(config.tui);
      expect(tui.status_line).toEqual(["model", "context-used"]);
    });

    it("does not add context usage when canonical tokens are absent", async () => {
      await syncToolExtensions(
        "codex",
        { statusline: { items: ["model"] } },
        tmpDir,
      );
      const config = await readCodexConfig(tmpDir);
      const tui = z
        .object({ status_line: z.array(z.string()) })
        .parse(config.tui);
      expect(tui.status_line).toEqual(["model"]);
    });

    it("emits agentsync sentinel JSON in cc render.sh", async () => {
      await syncToolExtensions(
        "claude",
        { statusline: { items: ["model"] } },
        tmpDir,
      );
      const script = await readText(tmpDir, ".claude/statusline/render.sh");
      expect(script).toContain("<<ctx>>");
      expect(script).toContain("context_window");
    });
  });

  describe("output_style", () => {
    it("maps canonical tone to cc outputStyle name", async () => {
      await syncToolExtensions(
        "claude",
        { outputStyle: { tone: "explanatory" } },
        tmpDir,
      );
      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        z.object({ outputStyle: z.string() }),
      );
      expect(settings.outputStyle).toBe("Explanatory");
    });

    it("maps canonical tone to the active cx personality", async () => {
      await syncToolExtensions(
        "codex",
        { outputStyle: { tone: "pragmatic" } },
        tmpDir,
      );
      const config = await readCodexConfig(tmpDir);
      expect(config.personality).toBe("pragmatic");
    });

    it.each(UNMAPPED_CLAUDE_TONES)(
      "warns when cc tone='%s' has no built-in mapping",
      async (tone) => {
        const result = await syncToolExtensions(
          "claude",
          { outputStyle: { tone } },
          tmpDir,
        );
        expect(result.warnings).toEqual([
          expect.stringContaining(`tone="${tone}"`),
        ]);
      },
    );

    it("warns once for unsupported extension surfaces and stays quiet when unconfigured", async () => {
      const input: ExtensionsInput = {
        permissions: { default: "ask" },
        statusline: { items: ["model"] },
        outputStyle: { tone: "terse" },
      };
      const results = await syncExtensions(
        providersFor("claude", "codex", "opencode", "cursor"),
        input,
        tmpDir,
      );

      expect(results[0].warnings).not.toContain(
        "claude does not support permissions; configuration skipped",
      );
      expect(results[1].warnings).not.toContain(
        "codex does not support output style; configuration skipped",
      );
      expect(results[2].warnings).toEqual(
        expect.arrayContaining([
          "opencode does not support statusline; configuration skipped",
          "opencode does not support output style; configuration skipped",
        ]),
      );
      expect(results[3].warnings).toEqual(
        expect.arrayContaining([
          "cursor does not support statusline; configuration skipped",
          "cursor does not support output style; configuration skipped",
        ]),
      );

      const unconfigured = await syncExtensions(
        providersFor("opencode", "cursor"),
        {},
        tmpDir,
      );
      expect(unconfigured.every((result) => result.warnings.length === 0)).toBe(
        true,
      );
    });

    it("preflights malformed shared JSON only for configured writers", async () => {
      const cases: Array<{
        tool: "claude" | "cursor" | "opencode";
        input: ExtensionsInput;
        relativePath: string;
      }> = [
        {
          tool: "claude",
          input: {
            hooks: {
              SessionStart: [{ id: "start", command: "./start.sh" }],
            },
          },
          relativePath: ".claude/settings.json",
        },
        {
          tool: "cursor",
          input: { permissions: { default: "ask" } },
          relativePath: ".cursor/cli.json",
        },
        {
          tool: "opencode",
          input: { permissions: { default: "ask" } },
          relativePath: "opencode.json",
        },
      ];

      for (const testCase of cases) {
        const configPath = path.join(tmpDir, testCase.relativePath);
        const malformed = `{not ${testCase.tool} json`;
        await outputFile(configPath, malformed);

        await expect(
          previewExtensions(
            providersFor(testCase.tool),
            testCase.input,
            tmpDir,
          ),
        ).rejects.toMatchObject({
          code: "CONFIG_ERROR",
          context: { configPath },
        });
        expect(await readText(tmpDir, testCase.relativePath)).toBe(malformed);
      }

      await expect(
        previewExtensions(
          providersFor("claude", "cursor", "opencode"),
          {},
          tmpDir,
        ),
      ).resolves.toHaveLength(3);
    });

    it("preserves user-set wire_api in .codex/config.toml across all extension writers", async () => {
      const codexDir = path.join(tmpDir, ".codex");
      await ensureDir(codexDir);
      await outputFile(
        path.join(codexDir, "config.toml"),
        `model = "gpt-5"

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
`,
      );
      await writeHookScript(tmpDir, "ctx.sh");

      await syncToolExtensions(
        "codex",
        {
          hooks: {
            SessionStart: [
              { id: "inject-ctx", command: ".agents/hooks/scripts/ctx.sh" },
            ],
          },
          permissions: { default: "ask" },
          statusline: { items: ["model", "branch"] },
          outputStyle: { tone: "pragmatic" },
        },
        tmpDir,
      );

      const config = await readCodexConfig(tmpDir);
      const modelProviders = z
        .object({
          openai: z.object({
            wire_api: z.literal("responses"),
            name: z.literal("OpenAI"),
          }),
        })
        .parse(config.model_providers);
      expect(modelProviders.openai.wire_api).toBe("responses");
      expect(modelProviders.openai.name).toBe("OpenAI");
      expect(config.model).toBe("gpt-5");
      expect(config.default_permissions).toBeDefined();
      expect(config.tui).toBeDefined();
      expect(config.personality).toBe("pragmatic");
    });

    it("withdraws prior Codex extension keys and preserves sibling settings", async () => {
      const configPath = path.join(tmpDir, ".codex", "config.toml");
      await outputFile(
        configPath,
        [
          'model = "gpt-5"',
          "",
          "[tui]",
          'theme = "dark"',
          "",
          "[agents.manual]",
          'config_file = "agents/manual.toml"',
          'description = "Manual role"',
        ].join("\n"),
      );
      await syncToolExtensions(
        "codex",
        {
          permissions: { default: "ask" },
          statusline: { items: ["model", "branch"] },
          outputStyle: { tone: "pragmatic" },
        },
        tmpDir,
      );

      const result = await syncToolExtensions("codex", {}, tmpDir);

      const config = ToolSettingsSchema.parse(
        parseToml(await readText(tmpDir, ".codex/config.toml")),
      );
      expect(config.default_permissions).toBeUndefined();
      expect(config.personality).toBeUndefined();
      expect(config.tui).toEqual({ theme: "dark" });
      expect(config.agents).toMatchObject({
        manual: {
          config_file: "agents/manual.toml",
          description: "Manual role",
        },
      });
      expect(config.model).toBe("gpt-5");
      expect(
        await pathExists(
          path.join(tmpDir, ".codex", ".agentsync-ownership.json"),
        ),
      ).toBe(false);
      expect(result.warnings).toEqual([]);
    });

    it("preserves a user-modified Codex extension value on withdrawal", async () => {
      const configPath = path.join(tmpDir, ".codex", "config.toml");
      await syncToolExtensions(
        "codex",
        { outputStyle: { tone: "pragmatic" } },
        tmpDir,
      );
      await outputFile(configPath, 'personality = "friendly"\n');

      const result = await syncToolExtensions("codex", {}, tmpDir);

      const config = ToolSettingsSchema.parse(
        parseToml(await readText(tmpDir, ".codex/config.toml")),
      );
      expect(config.personality).toBe("friendly");
      expect(
        await pathExists(
          path.join(tmpDir, ".codex", ".agentsync-ownership.json"),
        ),
      ).toBe(false);
      expect(result.warnings).toEqual([
        expect.stringContaining("ownership was relinquished"),
      ]);
    });

    it("does not warn when tone resolves via a custom style of the same name", async () => {
      const stylesDir = path.join(tmpDir, ".agents", "output-styles");
      await outputFile(
        path.join(stylesDir, "pragmatic.md"),
        "# Pragmatic\nBe pragmatic.\n",
      );
      const result = await syncToolExtensions(
        "claude",
        {
          outputStyle: {
            tone: "pragmatic",
            custom: [
              {
                name: "pragmatic",
                file: ".agents/output-styles/pragmatic.md",
              },
            ],
          },
        },
        tmpDir,
      );
      expect(result.warnings.some((w) => w.includes('tone="pragmatic"'))).toBe(
        false,
      );
      const settings = await readJsonConfig(
        tmpDir,
        ".claude/settings.json",
        z.object({ outputStyle: z.string() }),
      );
      expect(settings.outputStyle).toBe("pragmatic");
    });

    it("withdraws a custom outputStyle claim when its source disappears", async () => {
      const source = path.join(tmpDir, ".agents/output-styles/pragmatic.md");
      await outputFile(source, "# Pragmatic\n");
      const input: ExtensionsInput = {
        outputStyle: {
          tone: "pragmatic",
          custom: [
            {
              name: "pragmatic",
              file: ".agents/output-styles/pragmatic.md",
            },
          ],
        },
      };
      await syncToolExtensions("claude", input, tmpDir);
      await rm(source);

      const result = await syncToolExtensions("claude", input, tmpDir);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "source .agents/output-styles/pragmatic.md not found",
          ),
        ]),
      );
      expect(await pathExists(path.join(tmpDir, ".claude/settings.json"))).toBe(
        false,
      );
      expect(
        (await readManifest(tmpDir))?.structured_owners?.claude,
      ).toBeUndefined();
    });
  });
});
