/**
 * Codex agents post-sync hook — emits .codex/agents/<n>.toml role wrapper +
 * merges [agents.<n>] table into .codex/config.toml, preserving every other
 * key already in the config.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../../src/sync/agents.js";
import { getToolProvider } from "../../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../../src/utils/fs.js";

describe("Codex agentsPostHook", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-codex-agents-"));
    // Pre-seed a config.toml with unrelated keys to verify merge-preserve
    await ensureDir(path.join(tmpDir, ".codex"));
    await outputFile(
      path.join(tmpDir, ".codex", "config.toml"),
      'model = "gpt-5"\nsandbox_mode = "workspace-write"\n',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes role-config TOML wrapper alongside the md body", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      "---\ndescription: Careful code reviewer\n---\n# Reviewer\n\nReview the code carefully.",
    );

    await syncAgents([getToolProvider("codex")], tmpDir);

    expect(
      await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.md")),
    ).toBe(true);

    const tomlPath = path.join(tmpDir, ".codex", "agents", "reviewer.toml");
    expect(await pathExists(tomlPath)).toBe(true);
    const roleConfig = parse(await readFile(tomlPath, "utf-8")) as Record<
      string,
      unknown
    >;
    // Path is relative to `.codex/` — codex resolves it from the config.toml
    // directory, so emitting `.codex/agents/...` would double-prefix.
    expect(roleConfig.model_instructions_file).toBe("agents/reviewer.md");
  });

  it("merges [agents.<n>] into .codex/config.toml and preserves unrelated keys", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "reviewer.md"),
      [
        "---",
        "description: Careful code reviewer",
        "codex:",
        '  nickname_candidates: ["nit", "Iris"]',
        "  max_depth: 2",
        "---",
        "# Reviewer",
      ].join("\n"),
    );

    await syncAgents([getToolProvider("codex")], tmpDir);

    const config = parse(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    ) as Record<string, unknown>;

    // Unrelated keys preserved
    expect(config.model).toBe("gpt-5");
    expect(config.sandbox_mode).toBe("workspace-write");

    // [agents.reviewer] table emitted with lifted metadata
    const agents = config.agents as Record<string, Record<string, unknown>>;
    expect(agents.reviewer).toBeDefined();
    expect(agents.reviewer.config_file).toBe("agents/reviewer.toml");
    expect(agents.reviewer.description).toBe("Careful code reviewer");
    expect(agents.reviewer.nickname_candidates).toEqual(["nit", "Iris"]);
    expect(agents.reviewer.max_depth).toBe(2);
  });

  it("passes through unknown codex.* frontmatter fields into the role TOML", async () => {
    const agentsDir = path.join(tmpDir, ".agents", "agents");
    await ensureDir(agentsDir);
    await outputFile(
      path.join(agentsDir, "sandbox-bound.md"),
      [
        "---",
        "description: Sandbox-bound worker",
        "codex:",
        '  sandbox_mode: "read-only"',
        "  model_reasoning_effort: high",
        "---",
        "# Sandbox-bound",
      ].join("\n"),
    );

    await syncAgents([getToolProvider("codex")], tmpDir);

    const roleConfig = parse(
      await readFile(
        path.join(tmpDir, ".codex", "agents", "sandbox-bound.toml"),
        "utf-8",
      ),
    ) as Record<string, unknown>;
    expect(roleConfig.sandbox_mode).toBe("read-only");
    expect(roleConfig.model_reasoning_effort).toBe("high");
    // metadata that belongs in [agents.<n>] should NOT leak into the role TOML
    expect(roleConfig.description).toBeUndefined();
    expect(roleConfig.nickname_candidates).toBeUndefined();
  });
});
