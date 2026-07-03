import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../src/sync/agents.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

/** Parse the YAML frontmatter block of a synced agent file. */
function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  return (yaml.load(match[1]) as Record<string, unknown>) ?? {};
}

describe("Agents Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-agents-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies agents to Claude agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\nname: reviewer\n---\n# Code Reviewer Agent",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].agentCount).toBe(1);

    const agentFile = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(await pathExists(agentFile)).toBe(true);
    const content = await readFile(agentFile, "utf-8");
    expect(content).toContain("# Code Reviewer Agent");
  });

  it("copies agents to Copilot agents directory with .agent.md extension", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "tester.md"), "# Test Agent");

    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".github", "agents", "tester.agent.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("copies agents to OpenCode agents directory", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "planner.md"), "# Planner");

    const providers = [getToolProvider("opencode")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(1);
    const agentFile = path.join(tmpDir, ".opencode", "agents", "planner.md");
    expect(await pathExists(agentFile)).toBe(true);
  });

  it("skips tools that do not support agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "test.md"), "# Agent");

    // Cursor, RooCode, Gemini don't support agents (Codex now does — see codex-agents tests)
    const providers = [
      getToolProvider("cursor"),
      getToolProvider("roocode"),
      getToolProvider("gemini"),
    ];
    const results = await syncAgents(providers, tmpDir);

    for (const result of results) {
      expect(result.agentCount).toBe(0);
    }
  });

  it("handles multiple agents", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "reviewer.md"), "# Reviewer");
    await outputFile(path.join(agentsDir, "tester.md"), "# Tester");
    await outputFile(path.join(agentsDir, "planner.md"), "# Planner");

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(3);
  });

  it("copies agents with namespace prefix for presets", async () => {
    const presetDir = path.join(tmpDir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "auditor.md"), "# Auditor");

    const presetAgents = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir, presetAgents);

    expect(results[0].agentCount).toBe(1);
    expect(results[0].agents).toContain(path.join("company", "auditor.md"));
  });

  it("handles empty agents directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir);

    expect(results[0].agentCount).toBe(0);
  });
});

describe("OpenCode agent frontmatter translation", () => {
  let tmpDir: string;

  // A canonical agentsync agent file (matches .agents/agents/*.md authored shape):
  // `tools` is a YAML scalar (comma list), `model` is a bare alias, plus the
  // agentsync-internal `capability`/`skill_tags`. OpenCode fatal-boots on the
  // bad-typed `tools` field; the rest is opencode-meaningless noise.
  const CANONICAL_AGENT = [
    "---",
    "name: researcher",
    "description: A generic research role.",
    "capability: research",
    "skill_tags: [research]",
    "tools: Read, Write, WebSearch, WebFetch, Bash",
    "model: sonnet",
    "---",
    "# Researcher",
    "You research things.",
  ].join("\n");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-oc-agents-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function syncOne(content: string): Promise<{
    fm: Record<string, unknown>;
    body: string;
    warnings: string[];
  }> {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "researcher.md"), content);

    const results = await syncAgents([getToolProvider("opencode")], tmpDir);
    const raw = await readFile(
      path.join(tmpDir, ".opencode", "agents", "researcher.md"),
      "utf-8",
    );
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return {
      fm: frontmatterOf(raw),
      body: bodyMatch ? bodyMatch[1] : raw,
      warnings: results[0].warnings,
    };
  }

  it("drops the agentsync `tools` allowlist so OpenCode boots", async () => {
    const { fm, warnings } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("tools");
    expect(warnings.join("\n")).toMatch(/tools/i);
  });

  it("drops a bare (unqualified) `model` alias and warns", async () => {
    const { fm, warnings } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("model");
    expect(warnings.join("\n")).toMatch(/model/i);
  });

  it("keeps a provider-qualified `model` untouched", async () => {
    const content = CANONICAL_AGENT.replace(
      "model: sonnet",
      "model: anthropic/claude-sonnet-4-20250514",
    );
    const { fm } = await syncOne(content);

    expect(fm.model).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("drops agentsync-internal `capability` and `skill_tags`", async () => {
    const { fm } = await syncOne(CANONICAL_AGENT);

    expect(fm).not.toHaveProperty("capability");
    expect(fm).not.toHaveProperty("skill_tags");
  });

  it("defaults `mode` to subagent when absent", async () => {
    const { fm } = await syncOne(CANONICAL_AGENT);

    expect(fm.mode).toBe("subagent");
  });

  it("preserves an explicit opencode `mode`", async () => {
    const content = CANONICAL_AGENT.replace(
      "name: researcher",
      "name: researcher\nmode: primary",
    );
    const { fm } = await syncOne(content);

    expect(fm.mode).toBe("primary");
  });

  it("preserves description and body", async () => {
    const { fm, body } = await syncOne(CANONICAL_AGENT);

    expect(fm.description).toBe("A generic research role.");
    expect(body).toContain("# Researcher");
    expect(body).toContain("You research things.");
  });

  it("leaves an already-valid opencode `tools` record untouched", async () => {
    const content = [
      "---",
      "description: native opencode agent",
      "mode: subagent",
      "tools:",
      "  read: true",
      "  edit: false",
      "---",
      "# Native",
    ].join("\n");
    const { fm } = await syncOne(content);

    expect(fm.tools).toEqual({ read: true, edit: false });
  });

  it("does not translate frontmatter for Claude (verbatim copy)", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(path.join(agentsDir, "researcher.md"), CANONICAL_AGENT);

    await syncAgents([getToolProvider("claude")], tmpDir);
    const raw = await readFile(
      path.join(tmpDir, ".claude", "agents", "researcher.md"),
      "utf-8",
    );

    expect(raw).toContain("tools: Read, Write, WebSearch, WebFetch, Bash");
    expect(raw).toContain("capability: research");
  });
});
