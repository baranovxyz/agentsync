/**
 * Sync extensions (hooks, permissions, statusline, output_style) — verify
 * canonical declarations land correctly per CLI.
 */

import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncExtensions } from "../../../src/sync/extensions.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

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
      // Make a fake hook script
      const scriptsDir = path.join(tmpDir, ".agents", "hooks", "scripts");
      await ensureDir(scriptsDir);
      await outputFile(path.join(scriptsDir, "log.sh"), "#!/bin/sh\necho hi\n");
      await chmod(path.join(scriptsDir, "log.sh"), 0o755);

      await syncExtensions(
        [getToolProvider("claude")],
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

      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
      );
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash|Edit|Write");
      expect(settings.hooks.PreToolUse[0].hooks[0]).toMatchObject({
        type: "command",
        timeout: 5000,
      });
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain(
        ".claude/hooks/scripts/log.sh",
      );
    });

    it("drops all hooks for cx and surfaces a reason per declaration", async () => {
      // cx 0.130 has no hooks system — `strings /usr/bin/codex | grep -iE
      // "hook|matcher"` returns zero matches. Writing `[[hooks.*]]` to
      // .codex/config.toml is silently ignored at runtime, so the writer
      // was removed. Sync now drops every hook declaration with a reason
      // pointing at the audit doc.
      const scriptsDir = path.join(tmpDir, ".agents", "hooks", "scripts");
      await ensureDir(scriptsDir);
      await outputFile(path.join(scriptsDir, "ctx.sh"), "#!/bin/sh\necho hi\n");

      const results = await syncExtensions(
        [getToolProvider("codex")],
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

      // No .codex/config.toml hooks block written; ideally no file at all
      // unless another writer created it.
      const cfg = path.join(tmpDir, ".codex", "config.toml");
      if (await pathExists(cfg)) {
        const config = parseToml(await readFile(cfg, "utf-8")) as Record<
          string,
          unknown
        >;
        expect(config.hooks).toBeUndefined();
      }

      expect(results[0].hooksWritten).toBe(0);
      expect(results[0].droppedHooks).toHaveLength(2);
      for (const dropped of results[0].droppedHooks) {
        expect(dropped.reason).toContain("does not support hooks");
      }
    });
  });

  describe("permissions", () => {
    it("maps canonical rules to cc Tool(pattern) arrays losslessly", async () => {
      await syncExtensions(
        [getToolProvider("claude")],
        {
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
        },
        tmpDir,
      );

      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
      );
      expect(settings.permissions.allow).toContain("Bash(npm run *)");
      expect(settings.permissions.deny).toContain("Read(./.env)");
      // canonical default="ask" must map to cc's vocabulary
      // ({default|acceptEdits|bypassPermissions|plan}). Passing "ask" through
      // verbatim made cc emit "Found 1 settings issue · /doctor for details"
      // and disable the permissions system on a live host.
      expect(settings.permissions.defaultMode).toBe("default");
    });

    it("collapses rules to strictest-wins per tool on opencode", async () => {
      const results = await syncExtensions(
        [getToolProvider("opencode")],
        {
          permissions: {
            rules: [
              { id: "a", tool: "Bash", pattern: "*", decision: "allow" },
              { id: "b", tool: "Bash", pattern: "curl *", decision: "deny" },
              { id: "c", tool: "Edit", decision: "ask" },
            ],
          },
        },
        tmpDir,
      );

      const settings = JSON.parse(
        await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
      );
      expect(settings.permission.bash).toBe("deny"); // strictest wins
      expect(settings.permission.edit).toBe("ask");
      // pattern-drop warning surfaced
      expect(
        results[0].warnings.some((w) => w.includes('pattern "curl *" dropped')),
      ).toBe(true);
      // allow-loss warning surfaced — rule "a" was an allow that got
      // collapsed away by deny rule "b" on the same tool
      expect(
        results[0].warnings.some(
          (w) =>
            w.includes("permissions.rule a") &&
            w.includes("allow rule") &&
            w.includes('"bash"'),
        ),
      ).toBe(true);
    });

    it("does not warn allow-loss when allow is the strictest decision", async () => {
      const results = await syncExtensions(
        [getToolProvider("opencode")],
        {
          permissions: {
            rules: [{ id: "only", tool: "Bash", decision: "allow" }],
          },
        },
        tmpDir,
      );
      expect(results[0].warnings.some((w) => w.includes("allow rule"))).toBe(
        false,
      );
    });

    it("emits warnings for cx per-rule mappings (only default maps cleanly)", async () => {
      const results = await syncExtensions(
        [getToolProvider("codex")],
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

      const config = parseToml(
        await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
      ) as Record<string, unknown>;
      expect(config.default_permissions).toBe(":workspace");
      expect(results[0].warnings.length).toBeGreaterThan(0);
      expect(
        results[0].warnings.some((w) => w.includes("not translatable")),
      ).toBe(true);
    });
  });

  describe("statusline", () => {
    it("generates render.sh and points cc settings.json#statusLine at it", async () => {
      await syncExtensions(
        [getToolProvider("claude")],
        { statusline: { items: ["model", "cwd", "branch"] } },
        tmpDir,
      );
      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
      );
      expect(settings.statusLine).toMatchObject({
        type: "command",
        command: ".claude/statusline/render.sh",
      });
      const script = await readFile(
        path.join(tmpDir, ".claude", "statusline", "render.sh"),
        "utf-8",
      );
      expect(script).toContain("model_id");
      expect(script).toContain("branch --show-current");
    });

    it("writes cx tui.status_line and warns on custom_items", async () => {
      const results = await syncExtensions(
        [getToolProvider("codex")],
        {
          statusline: {
            items: ["model", "cost"],
            custom_items: [
              { id: "deploy", command: ".agents/statusline/deploy.sh" },
            ],
          },
        },
        tmpDir,
      );
      const config = parseToml(
        await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
      ) as Record<string, unknown>;
      const tui = config.tui as Record<string, unknown>;
      // context-used is always appended so an external supervisor can read
      // current usage from the status line.
      expect(tui.status_line).toEqual(["model", "cost", "context-used"]);
      expect(
        results[0].warnings.some((w) => w.includes("custom_items dropped")),
      ).toBe(true);
    });

    it("translates canonical tokens to cx context-used and dedupes", async () => {
      await syncExtensions(
        [getToolProvider("codex")],
        { statusline: { items: ["model", "tokens"] } },
        tmpDir,
      );
      const config = parseToml(
        await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
      ) as Record<string, unknown>;
      const tui = config.tui as Record<string, unknown>;
      expect(tui.status_line).toEqual(["model", "context-used"]);
    });

    it("emits agentsync sentinel JSON in cc render.sh", async () => {
      await syncExtensions(
        [getToolProvider("claude")],
        { statusline: { items: ["model"] } },
        tmpDir,
      );
      const script = await readFile(
        path.join(tmpDir, ".claude", "statusline", "render.sh"),
        "utf-8",
      );
      expect(script).toContain("<<ctx>>");
      expect(script).toContain("context_window");
    });
  });

  describe("output_style", () => {
    it("maps canonical tone to cc outputStyle name", async () => {
      await syncExtensions(
        [getToolProvider("claude")],
        { outputStyle: { tone: "explanatory" } },
        tmpDir,
      );
      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
      );
      expect(settings.outputStyle).toBe("Explanatory");
    });

    it("maps canonical tone to cx profiles.default.personality", async () => {
      await syncExtensions(
        [getToolProvider("codex")],
        { outputStyle: { tone: "pragmatic" } },
        tmpDir,
      );
      const config = parseToml(
        await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
      ) as Record<string, unknown>;
      const profiles = config.profiles as Record<
        string,
        Record<string, unknown>
      >;
      expect(profiles.default.personality).toBe("pragmatic");
    });

    it("warns when cc tone has no built-in mapping (friendly)", async () => {
      const results = await syncExtensions(
        [getToolProvider("claude")],
        { outputStyle: { tone: "friendly" } },
        tmpDir,
      );
      expect(
        results[0].warnings.some((w) => w.includes('tone="friendly"')),
      ).toBe(true);
    });

    it("warns when cc tone='pragmatic' has no built-in mapping", async () => {
      const results = await syncExtensions(
        [getToolProvider("claude")],
        { outputStyle: { tone: "pragmatic" } },
        tmpDir,
      );
      expect(
        results[0].warnings.some((w) => w.includes('tone="pragmatic"')),
      ).toBe(true);
    });

    it("warns when cc tone='none' has no built-in mapping", async () => {
      const results = await syncExtensions(
        [getToolProvider("claude")],
        { outputStyle: { tone: "none" } },
        tmpDir,
      );
      expect(results[0].warnings.some((w) => w.includes('tone="none"'))).toBe(
        true,
      );
    });

    it("preserves user-set wire_api in .codex/config.toml across all extension writers", async () => {
      // The 6-writer .codex/config.toml invariant: every writer must read
      // the existing file and spread it before writing back. Pre-seed a
      // user-managed `[model_providers.openai]` block with `wire_api =
      // "responses"`, then drive every extension surface through
      // syncExtensions and assert the user field survives untouched.
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
      const scriptsDir = path.join(tmpDir, ".agents", "hooks", "scripts");
      await ensureDir(scriptsDir);
      await outputFile(path.join(scriptsDir, "ctx.sh"), "#!/bin/sh\necho hi\n");

      await syncExtensions(
        [getToolProvider("codex")],
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

      const config = parseToml(
        await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
      ) as Record<string, unknown>;
      const providers = config.model_providers as Record<
        string,
        Record<string, unknown>
      >;
      expect(providers?.openai?.wire_api).toBe("responses");
      expect(providers?.openai?.name).toBe("OpenAI");
      expect(config.model).toBe("gpt-5");
      // and the extension writers all landed.
      // Note: hooks NOT expected — cx 0.130 has no hooks system, so the
      // codex provider stopped writing `[[hooks.*]]`. hooksWritten will be 0 and the
      // dropped reason explains it.
      expect(config.default_permissions).toBeDefined();
      expect(config.tui).toBeDefined();
      expect(config.profiles).toBeDefined();
    });

    it("does not warn when tone resolves via a custom style of the same name", async () => {
      // pragmatic has no cc built-in, but a custom style named "pragmatic"
      // should be picked up and silence the warning
      const stylesDir = path.join(tmpDir, ".agents", "output-styles");
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(stylesDir, { recursive: true });
      await writeFile(
        path.join(stylesDir, "pragmatic.md"),
        "# Pragmatic\nBe pragmatic.\n",
        "utf-8",
      );
      const results = await syncExtensions(
        [getToolProvider("claude")],
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
      expect(
        results[0].warnings.some((w) => w.includes('tone="pragmatic"')),
      ).toBe(false);
      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
      );
      expect(settings.outputStyle).toBe("pragmatic");
    });
  });
});
