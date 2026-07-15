/**
 * Doctor Command Tests
 * Verifies the diagnostic logic for config, tools, skills, MCP, presets, and content drift.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDiagnostics } from "../../../src/commands/doctor/index.js";
import { writeManifest } from "../../../src/sync/manifest.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Doctor Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-doctor-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Write a minimal TOML config to .agents/agentsync.toml
   */
  async function writeTomlConfig(content: string): Promise<void> {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(path.join(tmpDir, ".agents", "agentsync.toml"), content);
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
  });

  describe("MCP check", () => {
    it("reports env vars as resolved when they exist in the environment", async () => {
      // Set env var for this test
      const originalEnv = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token";

      try {
        await writeTomlConfig(`
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp_servers.github.env]
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
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp_servers.github.env]
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

    it("reports no env vars needed for servers without token references", async () => {
      await writeTomlConfig(`
[mcp_servers.filesystem]
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
[mcp_servers.multi]
command = "node"
args = ["server.js"]

[mcp_servers.multi.env]
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
    it("reports filesystem preset as valid when directory exists", async () => {
      const presetDir = path.join(tmpDir, "local-presets");
      await ensureDir(presetDir);

      await writeTomlConfig(`
[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "fs:./local-presets"
namespace = "local"
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
[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "fs:./nonexistent-presets"
namespace = "local"
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
      await writeManifest(tmpDir, [skillFile]);

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
      await writeManifest(tmpDir, [skillFile]);

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
      await writeManifest(tmpDir, [skillFile]);

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

      await writeManifest(tmpDir, [cursorFile, claudeFile]);

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

  describe("Worker hints compatibility", () => {
    it("keeps the reserved result field empty", async () => {
      await writeTomlConfig(`tools = ["opencode"]\n`);

      const result = await runDiagnostics(tmpDir);

      expect(result.workerHints).toEqual([]);
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

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp_servers.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"

[mcp_servers.filesystem]
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
