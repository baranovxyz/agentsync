/**
 * Doctor Command Tests
 * Verifies the diagnostic logic for config, tools, skills, MCP, presets, and content drift.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDiagnostics } from "../../../src/commands/doctor/index.js";
import { writeOwnedManifest } from "../../../src/sync/manifest.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Doctor Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-doctor-"));
    const home = path.join(tmpDir, "home");
    await ensureDir(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("AGENTSYNC_PROFILE", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Write a minimal TOML config to .agents/agentsync.toml
   */
  async function writeTomlConfig(content: string): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(path.join(tmpDir, ".agents", "agentsync.toml"), content);
  }

  async function writeDriftIndex(filePaths: string[]): Promise<void> {
    await writeOwnedManifest(tmpDir, new Map([["diagnostic", filePaths]]), {
      preserveUnselected: false,
    });
  }

  describe("Config check", () => {
    it("reports config missing when no config file exists", async () => {
      const result = await runDiagnostics(tmpDir);

      expect(result.config.found).toBe(false);
      expect(result.config.valid).toBe(false);
      expect(result.config.error).toContain("No configuration file found");
    });

    it("reports config found and valid for a correct TOML config", async () => {
      await writeTomlConfig(`
tools = ["cursor", "claude"]
`);

      const result = await runDiagnostics(tmpDir);

      expect(result.config.found).toBe(true);
      expect(result.config.valid).toBe(true);
      expect(result.config.error).toBeUndefined();
    });

    it("reports config found but invalid for malformed TOML", async () => {
      await ensureDir(path.join(tmpDir, ".agents"));
      await outputFile(
        path.join(tmpDir, ".agents", "agentsync.toml"),
        "this is not valid toml ][][",
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.config.found).toBe(true);
      expect(result.config.valid).toBe(false);
      expect(result.config.error).toBeDefined();
    });

    it("reports current-format recovery for an invalid config", async () => {
      await writeTomlConfig('tools = ["claude"]\nunexpected = true\n');

      const result = await runDiagnostics(tmpDir);

      expect(result.config.valid).toBe(false);
      expect(result.config.error).toContain("Unrecognized key");
      expect(result.config.error).toContain(
        "Recovery: Use current top-level tools, extends (string array), mcp",
      );
    });

    it("reports a strict global-config failure from the sync hierarchy", async () => {
      await writeTomlConfig('tools = ["claude"]\n');
      await outputFile(
        path.join(tmpDir, "home", ".agents", "config.toml"),
        'tools = ["claude"]\nunexpected = true\n',
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.config.valid).toBe(false);
      expect(result.config.error).toContain("Unrecognized key");
    });

    it("reports invalid local-only fields from the sync hierarchy", async () => {
      await writeTomlConfig('tools = ["claude"]\n');
      await outputFile(
        path.join(tmpDir, "agentsync.local.toml"),
        'tools = ["cursor"]\n',
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.config.valid).toBe(false);
      expect(result.config.error).toContain("Unrecognized key");
    });

    it("reports config found and valid for a minimal TOML config", async () => {
      await writeTomlConfig('tools = ["cursor"]\n');

      const result = await runDiagnostics(tmpDir);

      expect(result.config.found).toBe(true);
      expect(result.config.valid).toBe(true);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("cursor");
    });
  });

  describe("Tools check", () => {
    it("lists configured tools", async () => {
      await writeTomlConfig(`
tools = ["cursor"]
`);

      const result = await runDiagnostics(tmpDir);

      const cursorTool = result.tools.find((t) => t.name === "cursor");
      expect(cursorTool).toBeDefined();
    });

    it("lists native tools", async () => {
      await writeTomlConfig(`
tools = ["opencode"]
`);

      const result = await runDiagnostics(tmpDir);

      const opencodeTool = result.tools.find((t) => t.name === "opencode");
      expect(opencodeTool).toBeDefined();
    });
  });

  describe("Skills check", () => {
    it("counts <name>/SKILL.md directories (the layout sync actually consumes)", async () => {
      await writeTomlConfig(`
tools = ["cursor"]
`);

      for (const name of ["typescript", "testing", "security"]) {
        await outputFile(
          path.join(tmpDir, ".agents", "skills", name, "SKILL.md"),
          `---\ndescription: ${name} rules\n---\n# ${name}`,
        );
      }

      const result = await runDiagnostics(tmpDir);

      expect(result.skills.count).toBe(3);
    });

    it("does NOT count flat .md files at the top level of .agents/skills/ (sync ignores them)", async () => {
      await writeTomlConfig(`
tools = ["cursor"]
`);

      await ensureDir(path.join(tmpDir, ".agents", "skills"));
      await outputFile(
        path.join(tmpDir, ".agents", "skills", "typescript.md"),
        "# flat skill — wrong layout",
      );
      await outputFile(
        path.join(tmpDir, ".agents", "skills", "README.md"),
        "# stray readme",
      );

      const result = await runDiagnostics(tmpDir);

      // Flat files are not consumed by `agentsync sync` (it globs
      // `*/SKILL.md`). Doctor must not over-count them — otherwise
      // users see "count: N, synced: false" and assume sync is broken
      // when the real issue is the source layout.
      expect(result.skills.count).toBe(0);
    });

    it("returns zero count when no skills directory exists", async () => {
      await writeTomlConfig(`
tools = ["cursor"]
`);

      const result = await runDiagnostics(tmpDir);

      expect(result.skills.count).toBe(0);
    });

    it("reports skills synced once they are copied to a holdout tool's skills directory", async () => {
      await writeTomlConfig(`tools = ["claude"]\n`);

      await outputFile(
        path.join(tmpDir, ".agents", "skills", "typescript", "SKILL.md"),
        "---\ndescription: TS rules\n---\n# TS",
      );
      await outputFile(
        path.join(tmpDir, ".claude", "skills", "typescript", "SKILL.md"),
        "---\ndescription: TS rules\n---\n# TS",
      );

      const result = await runDiagnostics(tmpDir);

      // Regression: this used to be derived from a rules-only holdout map
      // (`.claude/rules`), so a skills-only sync was reported unsynced even
      // though `.claude/skills/` was freshly written.
      expect(result.skills.synced).toBe(true);
    });

    it("reports skills not synced before any sync has copied them", async () => {
      await writeTomlConfig(`tools = ["claude"]\n`);

      await outputFile(
        path.join(tmpDir, ".agents", "skills", "typescript", "SKILL.md"),
        "---\ndescription: TS rules\n---\n# TS",
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.skills.synced).toBe(false);
    });

    it("treats a native-only tool set as synced once canonical skills exist (native readers get no copy)", async () => {
      await writeTomlConfig(`tools = ["opencode"]\n`);

      await outputFile(
        path.join(tmpDir, ".agents", "skills", "typescript", "SKILL.md"),
        "---\ndescription: TS rules\n---\n# TS",
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.skills.synced).toBe(true);
    });

    it("reports a native-only tool set as not synced when no skills exist yet", async () => {
      await writeTomlConfig(`tools = ["opencode"]\n`);

      const result = await runDiagnostics(tmpDir);

      expect(result.skills.synced).toBe(false);
    });
  });

  describe("Drift check (rules holdout)", () => {
    it("never reports RooCode or Copilot — neither has a rules writer to check", async () => {
      await writeTomlConfig(`tools = ["roocode", "copilot"]\n`);

      const result = await runDiagnostics(tmpDir);

      expect(result.drift).toEqual([]);
    });

    it("reports claude and cursor rules directories once they exist", async () => {
      await writeTomlConfig(`tools = ["claude", "cursor"]\n`);
      await ensureDir(path.join(tmpDir, ".claude", "rules"));
      await ensureDir(path.join(tmpDir, ".cursor", "rules"));

      const result = await runDiagnostics(tmpDir);

      expect(result.drift.map((d) => d.tool).sort()).toEqual([
        "claude",
        "cursor",
      ]);
      expect(result.drift.every((d) => d.status !== "missing")).toBe(true);
    });

    it("reports claude rules as missing before any sync has produced them", async () => {
      await writeTomlConfig(`tools = ["claude"]\n`);

      const result = await runDiagnostics(tmpDir);

      expect(result.drift).toEqual([{ tool: "claude", status: "missing" }]);
    });
  });

  describe("MCP check", () => {
    it("reports env vars as resolved when they exist in the environment", async () => {
      // Set env var for this test
      const originalEnv = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token";

      try {
        await writeTomlConfig(`
[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
`);

        const result = await runDiagnostics(tmpDir);

        const githubMcp = result.mcp.find((m) => m.name === "github");
        expect(githubMcp).toBeDefined();
        expect(githubMcp!.configured).toBe(true);
        expect(githubMcp!.envResolved).toBe(true);
        expect(githubMcp!.missingEnvVars).toHaveLength(0);
        expect(githubMcp!.severity).toBe("ok");
      } finally {
        // Restore original env
        if (originalEnv === undefined) {
          Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
        } else {
          process.env.GITHUB_TOKEN = originalEnv;
        }
      }
    });

    it("reports missing env vars when they are not set", async () => {
      // Ensure env var is not set
      const originalEnv = process.env.GITHUB_TOKEN;
      Reflect.deleteProperty(process.env, "GITHUB_TOKEN");

      try {
        await writeTomlConfig(`
[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
`);

        const result = await runDiagnostics(tmpDir);

        const githubMcp = result.mcp.find((m) => m.name === "github");
        expect(githubMcp).toBeDefined();
        expect(githubMcp!.configured).toBe(true);
        expect(githubMcp!.envResolved).toBe(false);
        expect(githubMcp!.missingEnvVars).toContain("GITHUB_TOKEN");
        expect(githubMcp!.severity).toBe("critical");
      } finally {
        if (originalEnv !== undefined) {
          process.env.GITHUB_TOKEN = originalEnv;
        }
      }
    });

    it("checks token references in URL-based MCP servers", async () => {
      const originalEnv = process.env.MCP_URL;
      Reflect.deleteProperty(process.env, "MCP_URL");

      try {
        await writeTomlConfig(`
[mcp.remote]
url = "{MCP_URL}/mcp"
`);

        const result = await runDiagnostics(tmpDir);
        const remote = result.mcp.find((server) => server.name === "remote");

        expect(remote).toMatchObject({
          envResolved: false,
          hasEnvRefs: true,
          missingEnvVars: ["MCP_URL"],
          severity: "critical",
        });
      } finally {
        if (originalEnv !== undefined) process.env.MCP_URL = originalEnv;
      }
    });

    it("uses the project .env file like sync", async () => {
      const originalEnv = process.env.MCP_URL;
      Reflect.deleteProperty(process.env, "MCP_URL");

      try {
        await writeTomlConfig(`
[mcp.remote]
url = "{MCP_URL}/mcp"
`);
        await outputFile(
          path.join(tmpDir, ".env"),
          "MCP_URL=https://mcp.example\n",
        );

        const result = await runDiagnostics(tmpDir);
        const remote = result.mcp.find((server) => server.name === "remote");

        expect(remote).toMatchObject({
          envResolved: true,
          hasEnvRefs: true,
          missingEnvVars: [],
          severity: "ok",
        });
      } finally {
        if (originalEnv !== undefined) process.env.MCP_URL = originalEnv;
      }
    });

    it("reports no env vars needed for servers without token references", async () => {
      await writeTomlConfig(`
[mcp.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]
`);

      const result = await runDiagnostics(tmpDir);

      const fsMcp = result.mcp.find((m) => m.name === "filesystem");
      expect(fsMcp).toBeDefined();
      expect(fsMcp!.configured).toBe(true);
      expect(fsMcp!.envResolved).toBe(true);
      expect(fsMcp!.missingEnvVars).toHaveLength(0);
      expect(fsMcp!.severity).toBe("ok");
    });

    it("detects multiple missing env vars", async () => {
      const origToken = process.env.GITHUB_TOKEN;
      const origUrl = process.env.DATABASE_URL;
      Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
      Reflect.deleteProperty(process.env, "DATABASE_URL");

      try {
        await writeTomlConfig(`
[mcp.multi]
command = "node"
args = ["server.js"]

[mcp.multi.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
DATABASE_URL = "{DATABASE_URL}"
`);

        const result = await runDiagnostics(tmpDir);

        const multiMcp = result.mcp.find((m) => m.name === "multi");
        expect(multiMcp).toBeDefined();
        expect(multiMcp!.envResolved).toBe(false);
        expect(multiMcp!.missingEnvVars).toContain("GITHUB_TOKEN");
        expect(multiMcp!.missingEnvVars).toContain("DATABASE_URL");
      } finally {
        if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
        if (origUrl !== undefined) process.env.DATABASE_URL = origUrl;
      }
    });
  });

  describe("Presets check", () => {
    it("reports a GitHub preset with the supported main ref as valid", async () => {
      await writeTomlConfig('extends = ["github:company/standards@main"]\n');

      const result = await runDiagnostics(tmpDir);

      expect(result.presets).toEqual([
        { source: "github:company/standards@main", valid: true },
      ]);
    });

    it("reports a GitHub preset with a named ref as valid", async () => {
      await writeTomlConfig('extends = ["github:company/standards@v2"]\n');

      const result = await runDiagnostics(tmpDir);

      expect(result.presets).toEqual([
        { source: "github:company/standards@v2", valid: true },
      ]);
    });

    it("reports filesystem preset as valid when directory exists", async () => {
      const presetDir = path.join(tmpDir, "local-presets");
      await ensureDir(presetDir);

      await writeTomlConfig(`
extends = ["fs:./local-presets"]
`);

      const result = await runDiagnostics(tmpDir);

      const preset = result.presets.find((p) =>
        p.source.includes("local-presets"),
      );
      expect(preset).toBeDefined();
      expect(preset!.valid).toBe(true);
    });

    it("reports filesystem preset as not valid when directory is missing", async () => {
      await writeTomlConfig(`
extends = ["fs:./nonexistent-presets"]
`);

      const result = await runDiagnostics(tmpDir);

      const preset = result.presets.find((p) =>
        p.source.includes("nonexistent"),
      );
      expect(preset).toBeDefined();
      expect(preset!.valid).toBe(false);
    });
  });

  describe("Content drift check", () => {
    it("reports ok when files are unchanged since last sync", async () => {
      await writeTomlConfig('tools = ["cursor"]\n');

      // Simulate synced files
      const skillFile = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "foo",
        "SKILL.md",
      );
      await ensureDir(path.dirname(skillFile));
      await outputFile(skillFile, "# Foo skill content");

      // Write manifest as if sync just ran
      await writeDriftIndex([skillFile]);

      const result = await runDiagnostics(tmpDir);

      expect(result.contentDrift).toHaveLength(1);
      expect(result.contentDrift[0].status).toBe("ok");
      expect(result.contentDrift[0].file).toBe(".cursor/skills/foo/SKILL.md");
    });

    it("detects modified files (content drift)", async () => {
      await writeTomlConfig('tools = ["cursor"]\n');

      // Simulate synced file
      const skillFile = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "foo",
        "SKILL.md",
      );
      await ensureDir(path.dirname(skillFile));
      await outputFile(skillFile, "# Original content");

      // Write manifest with the original content hash
      await writeDriftIndex([skillFile]);

      // Now modify the file directly (simulating user editing the copy)
      await outputFile(skillFile, "# Modified content by user");

      const result = await runDiagnostics(tmpDir);

      expect(result.contentDrift).toHaveLength(1);
      expect(result.contentDrift[0].status).toBe("modified");
      expect(result.contentDrift[0].file).toBe(".cursor/skills/foo/SKILL.md");
    });

    it("detects missing files (deleted since sync)", async () => {
      await writeTomlConfig('tools = ["cursor"]\n');

      // Simulate synced file
      const skillFile = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "foo",
        "SKILL.md",
      );
      await ensureDir(path.dirname(skillFile));
      await outputFile(skillFile, "# Content");

      // Write manifest
      await writeDriftIndex([skillFile]);

      // Delete the file
      await rm(skillFile);

      const result = await runDiagnostics(tmpDir);

      expect(result.contentDrift).toHaveLength(1);
      expect(result.contentDrift[0].status).toBe("missing");
    });

    it("handles missing manifest gracefully (first sync not run)", async () => {
      await writeTomlConfig('tools = ["cursor"]\n');

      const result = await runDiagnostics(tmpDir);

      expect(result.contentDrift).toEqual([]);
    });

    it("tracks multiple files across tools", async () => {
      await writeTomlConfig('tools = ["cursor", "claude"]\n');

      const cursorFile = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "bar",
        "SKILL.md",
      );
      const claudeFile = path.join(
        tmpDir,
        ".claude",
        "skills",
        "bar",
        "SKILL.md",
      );
      await ensureDir(path.dirname(cursorFile));
      await ensureDir(path.dirname(claudeFile));
      await outputFile(cursorFile, "# Cursor copy");
      await outputFile(claudeFile, "# Claude copy");

      await writeDriftIndex([cursorFile, claudeFile]);

      // Modify only the cursor copy
      await outputFile(cursorFile, "# User changed cursor copy");

      const result = await runDiagnostics(tmpDir);

      expect(result.contentDrift).toHaveLength(2);

      const cursorDrift = result.contentDrift.find((d) =>
        d.file.includes(".cursor"),
      );
      const claudeDrift = result.contentDrift.find((d) =>
        d.file.includes(".claude"),
      );

      expect(cursorDrift?.status).toBe("modified");
      expect(claudeDrift?.status).toBe("ok");
    });
  });

  describe("Global skills gap", () => {
    it("is empty for the four release targets", async () => {
      await writeTomlConfig(
        'tools = ["claude", "codex", "opencode", "cursor"]\n',
      );

      const result = await runDiagnostics(tmpDir);

      expect(result.globalSkillsGap).toEqual([]);
    });
  });

  describe("Full diagnostic flow", () => {
    it("returns complete result for a fully configured project", async () => {
      // Set up env
      const origToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token";

      try {
        await writeTomlConfig(`
tools = ["cursor", "claude", "opencode"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"

[mcp.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]
`);

        // Create skills — `<name>/SKILL.md` directory layout (the
        // layout sync actually consumes; flat .md files are ignored).
        await outputFile(
          path.join(tmpDir, ".agents", "skills", "typescript", "SKILL.md"),
          "---\ndescription: TS rules\n---\n# TS",
        );

        // Create holdout tool output dirs (for drift check)
        await ensureDir(path.join(tmpDir, ".cursor", "rules"));
        await ensureDir(path.join(tmpDir, ".claude"));

        const result = await runDiagnostics(tmpDir);

        // Config
        expect(result.config.found).toBe(true);
        expect(result.config.valid).toBe(true);

        // Tools
        expect(result.tools).toHaveLength(3);

        // Skills
        expect(result.skills.count).toBe(1);

        // MCP
        expect(result.mcp).toHaveLength(2);
        const github = result.mcp.find((m) => m.name === "github");
        expect(github!.envResolved).toBe(true);
        const fs = result.mcp.find((m) => m.name === "filesystem");
        expect(fs!.envResolved).toBe(true);
      } finally {
        if (origToken === undefined) {
          Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
        } else {
          process.env.GITHUB_TOKEN = origToken;
        }
      }
    });
  });
});
