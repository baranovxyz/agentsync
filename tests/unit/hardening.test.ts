/**
 * Hardening Tests
 * Covers edge cases for TOML loader, skills sync, docs sync, restore, and config hierarchy
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseTomlConfig,
  tomlToInternalConfig,
} from "../../src/config/toml-loader.js";
import { ConfigError } from "../../src/core/errors.js";
import { syncDocs } from "../../src/sync/docs.js";
import { syncSkills } from "../../src/sync/skills.js";
import { getToolProvider } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

describe("TOML loader edge cases", () => {
  it("throws ConfigError for empty TOML string", () => {
    expect(() => parseTomlConfig("")).toThrow(/is empty/);
  });

  it("throws ParseError for malformed TOML with file path in message", () => {
    expect(() =>
      parseTomlConfig("not valid {{{{", "/path/to/config.toml"),
    ).toThrow(/\/path\/to\/config\.toml/);
  });

  it("rejects unknown tool names in the current tools array", () => {
    expect(() =>
      parseTomlConfig(`
tools = ["claude", "not_a_real_tool", "cursor"]
`),
    ).toThrow(ConfigError);
  });

  it("maps URL-based MCP server from TOML", () => {
    const toml = parseTomlConfig(`
[mcp.remote-api]
url = "https://mcp.example.com/v1"
[mcp.remote-api.headers]
Authorization = "Bearer test-token"
`);
    const internal = tomlToInternalConfig(toml);
    expect(internal.mcp).toBeDefined();
    const remoteApi = internal.mcp!["remote-api"] as {
      url: string;
      headers?: Record<string, string>;
    };
    expect(remoteApi.url).toBe("https://mcp.example.com/v1");
    expect(remoteApi.headers?.Authorization).toBe("Bearer test-token");
  });

  it("rejects MCP server entries with neither command nor url", () => {
    expect(() =>
      parseTomlConfig(`
[mcp.broken]
args = ["should-be-ignored"]
`),
    ).toThrow(ConfigError);
  });

  it("returns undefined tools when no tools field", () => {
    const toml = parseTomlConfig(`[mcp.test]\ncommand = "echo"\nargs = ["hi"]`);
    const internal = tomlToInternalConfig(toml);
    expect(internal.tools).toBeUndefined();
  });
});

describe("Skills sync - rewriteSkillName", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-skill-rewrite-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("injects name field when SKILL.md frontmatter has no name", async () => {
    // Create a skill with frontmatter but no name field
    const skillDir = path.join(tmpDir, "preset-skills", "tdd");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\ndescription: TDD workflow\n---\n# TDD Skill\nDo TDD.",
    );

    const presetSkills = new Map([
      ["company", [path.join(tmpDir, "preset-skills")]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(1);
    expect(results[0].skills).toContain("company--tdd");

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "company--tdd",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);

    const content = await readFile(outputPath, "utf-8");
    // The name field should be injected after the opening ---
    expect(content).toContain("name: company--tdd");
    expect(content).toContain("description: TDD workflow");
  });

  it("replaces existing name field with namespaced name", async () => {
    // Create a skill with an existing name field
    const skillDir = path.join(tmpDir, "preset-skills", "review");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: review\ndescription: Code review\n---\n# Code Review",
    );

    const presetSkills = new Map([
      ["org", [path.join(tmpDir, "preset-skills")]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skills).toContain("org--review");

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "org--review",
      "SKILL.md",
    );
    const content = await readFile(outputPath, "utf-8");
    // The name field should be replaced with the namespaced name
    expect(content).toContain("name: org--review");
    // The original unnamespaced name should not appear as a standalone field
    expect(content).not.toMatch(/^name: review$/m);
  });

  it.each([
    {
      label: "replaces an existing name",
      source:
        "---\r\nname: review\r\ndescription: Code review\r\n---\r\n# Review\r\n",
    },
    {
      label: "injects a missing name",
      source: "---\r\ndescription: Code review\r\n---\r\n# Review\r\n",
    },
  ])("preserves CRLF when it $label", async ({ source }) => {
    const skillDir = path.join(tmpDir, "preset-skills", "review");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), source);

    await syncSkills(
      [getToolProvider("claude")],
      tmpDir,
      new Map([["org", [path.join(tmpDir, "preset-skills")]]]),
    );

    const content = await readFile(
      path.join(tmpDir, ".claude", "skills", "org--review", "SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("name: org--review\r\n");
    expect(content.replaceAll("\r\n", "")).not.toContain("\n");
  });
});

describe("Docs sync edge cases", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-docs-edge-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips all tools when no AGENTS.md exists anywhere", async () => {
    const providers = [
      getToolProvider("claude"),
      getToolProvider("cursor"),
      getToolProvider("gemini"),
    ];

    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(3);

    // Claude (docsFormat non-null) should report created=false
    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult?.created).toBe(false);

    // No CLAUDE.md should be created
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    expect(await pathExists(claudeMd)).toBe(false);

    // No GEMINI.md should be created
    const geminiMd = path.join(tmpDir, "GEMINI.md");
    expect(await pathExists(geminiMd)).toBe(false);
  });

  it("creates CLAUDE.md when only root AGENTS.md exists", async () => {
    // Create only root AGENTS.md (not in .agents/ dir)
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Root Project Docs");

    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(true);

    // CLAUDE.md should be created with @AGENTS.md directive
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    expect(await pathExists(claudeMd)).toBe(true);
    const content = await readFile(claudeMd, "utf-8");
    expect(content).toBe("@AGENTS.md\n");
  });

  it("uses root AGENTS.md and ignores a nested duplicate", async () => {
    // Create both
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Root");
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# From .agents dir",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].created).toBe(true);
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    expect(await readFile(claudeMd, "utf-8")).toBe("@AGENTS.md\n");
  });
});

describe("Config hierarchy - TOML loading", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-hierarchy-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads TOML config when .agents/agentsync.toml exists", async () => {
    // We test the TOML loading path of loadConfigHierarchy
    // by creating the TOML config and loading it
    const agentsDir = path.join(tmpDir, ".agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "agentsync.toml"),
      `tools = ["claude", "cursor"]\n`,
    );

    // Import loadConfigHierarchy (it needs to find the TOML file)
    const { loadConfigHierarchy } = await import(
      "../../src/core/config/hierarchy.js"
    );

    const config = await loadConfigHierarchy(tmpDir);
    expect(config.tools).toContain("claude");
    expect(config.tools).toContain("cursor");
    expect(config._sources.chain[0]).toContain("agentsync.toml");
  });

  it("loads TOML config with MCP servers", async () => {
    const agentsDir = path.join(tmpDir, ".agents");
    await ensureDir(agentsDir);

    await outputFile(
      path.join(agentsDir, "agentsync.toml"),
      `tools = ["claude"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
`,
    );

    const { loadConfigHierarchy } = await import(
      "../../src/core/config/hierarchy.js"
    );

    const config = await loadConfigHierarchy(tmpDir);
    expect(config.tools).toContain("claude");
    expect(config._sources.chain[0]).toContain("agentsync.toml");
  });
});

describe("Config TOML-only loading", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-compat-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads from .agents/agentsync.toml", async () => {
    const agentsDir = path.join(tmpDir, ".agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["cursor", "roocode"]\n',
    );

    const { loadConfigHierarchy } = await import(
      "../../src/core/config/hierarchy.js"
    );

    const config = await loadConfigHierarchy(tmpDir);
    expect(config.tools).toContain("cursor");
    expect(config.tools).toContain("roocode");
    expect(config._sources.chain[0]).toContain("agentsync.toml");
  });

  it("loads TOML config with multiple tools", async () => {
    const agentsDir = path.join(tmpDir, ".agents");
    await ensureDir(agentsDir);

    await outputFile(
      path.join(agentsDir, "agentsync.toml"),
      'tools = ["gemini", "cursor"]\n',
    );

    const { loadConfigHierarchy } = await import(
      "../../src/core/config/hierarchy.js"
    );

    const config = await loadConfigHierarchy(tmpDir);
    expect(config.tools).toContain("gemini");
    expect(config.tools).toContain("cursor");
    expect(config._sources.chain[0]).toContain("agentsync.toml");
  });
});
