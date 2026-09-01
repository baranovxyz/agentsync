import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSyncPlan } from "../../../src/sync/execute.js";
import {
  getManifestPath,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

describe("sync cross-surface preflight atomicity", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-preflight-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function writeCanonicalCommand(): Promise<void> {
    await outputFile(
      path.join(project, ".agents", "commands", "review.md"),
      "---\ndescription: Review changes\n---\n# Review\n",
    );
  }

  it("rejects a blocked docs leaf before shared writes and succeeds on retry", async () => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["claude", "cursor"]\n',
    );
    await outputFile(path.join(project, "AGENTS.md"), "# Instructions\n");
    await writeCanonicalCommand();
    const blocker = path.join(project, "CLAUDE.md");
    await ensureDir(blocker);
    const plan = await buildSyncPlan({ cwd: project });

    await expect(executeSyncPlan(plan, { cwd: project })).rejects.toMatchObject(
      { code: "CONFIG_ERROR" },
    );

    expect(
      await pathExists(path.join(project, ".claude", "commands", "review.md")),
    ).toBe(false);
    expect(
      await pathExists(path.join(project, ".cursor", "commands", "review.md")),
    ).toBe(false);
    expect(await pathExists(getManifestPath(project))).toBe(false);

    await rm(blocker, { recursive: true });
    await expect(
      executeSyncPlan(plan, { cwd: project }),
    ).resolves.toMatchObject({ totalCommands: 2 });
    expect(await pathExists(path.join(project, "CLAUDE.md"))).toBe(true);
    expect(await pathExists(getManifestPath(project))).toBe(true);
  });

  it("rejects a blocked hook-script leaf before shared writes and succeeds on retry", async () => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor"]',
        "",
        "[[hooks.PreToolUse]]",
        'id = "audit"',
        'matcher = "Bash"',
        'command = ".agents/hooks/scripts/audit.sh"',
        "",
      ].join("\n"),
    );
    await writeCanonicalCommand();
    await outputFile(
      path.join(project, ".agents", "hooks", "scripts", "audit.sh"),
      "#!/bin/sh\nexit 0\n",
    );
    const blocker = path.join(project, ".cursor", "hooks", "audit.sh");
    await ensureDir(blocker);
    const plan = await buildSyncPlan({ cwd: project });

    await expect(executeSyncPlan(plan, { cwd: project })).rejects.toMatchObject(
      { code: "CONFIG_ERROR" },
    );

    expect(
      await pathExists(path.join(project, ".cursor", "commands", "review.md")),
    ).toBe(false);
    expect(await pathExists(path.join(project, ".cursor", "hooks.json"))).toBe(
      false,
    );
    expect(await pathExists(getManifestPath(project))).toBe(false);

    await rm(blocker, { recursive: true });
    await expect(
      executeSyncPlan(plan, { cwd: project }),
    ).resolves.toMatchObject({ totalCommands: 1 });
    expect(await pathExists(blocker)).toBe(true);
    expect(await pathExists(path.join(project, ".cursor", "hooks.json"))).toBe(
      true,
    );
    expect(await pathExists(getManifestPath(project))).toBe(true);
  });

  it.each([
    "opencode",
    "codex",
  ] as const)("rejects malformed %s shared config before any content surface write", async (malformedTool) => {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      [
        `tools = ["claude", "cursor", "${malformedTool}"]`,
        "",
        "[mcp.tracker]",
        'command = "node"',
        'args = ["tracker.js"]',
        "",
        "[[hooks.PreToolUse]]",
        'id = "audit"',
        'matcher = "Bash"',
        'command = ".agents/hooks/scripts/audit.sh"',
        "",
        "[permissions]",
        'default = "ask"',
        "",
        "[statusline]",
        'items = ["model"]',
        "",
      ].join("\n"),
    );
    await outputFile(path.join(project, "AGENTS.md"), "# Instructions\n");
    await outputFile(
      path.join(project, ".agents", "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review\n---\n# Review\n",
    );
    await writeCanonicalCommand();
    await outputFile(
      path.join(project, ".agents", "agents", "reviewer.md"),
      "---\ndescription: Review agent\n---\n# Reviewer\n",
    );
    await outputFile(
      path.join(project, ".agents", "rules", "safety.md"),
      "Keep changes safe.\n",
    );
    await outputFile(
      path.join(project, ".agents", "hooks", "scripts", "audit.sh"),
      "#!/bin/sh\nexit 0\n",
    );
    const malformedPath =
      malformedTool === "opencode"
        ? path.join(project, "opencode.json")
        : path.join(project, ".codex", "config.toml");
    await outputFile(
      malformedPath,
      malformedTool === "opencode" ? "{invalid json" : "[mcp_servers\n",
    );
    await writeOwnedManifest(project, new Map(), {
      preserveUnselected: false,
    });
    const manifestBefore = await readFile(getManifestPath(project), "utf-8");
    const plan = await buildSyncPlan({ cwd: project });

    await expect(executeSyncPlan(plan, { cwd: project })).rejects.toMatchObject(
      { code: "CONFIG_ERROR" },
    );

    for (const output of [
      ".claude/skills/review/SKILL.md",
      ".claude/commands/review.md",
      ".claude/agents/reviewer.md",
      ".claude/rules/safety.md",
      ".claude/settings.json",
      ".cursor/commands/review.md",
      ".cursor/agents/reviewer.md",
      ".cursor/rules/safety.mdc",
      ".cursor/hooks.json",
      "CLAUDE.md",
    ]) {
      expect(await pathExists(path.join(project, output)), output).toBe(false);
    }
    expect(await readFile(getManifestPath(project), "utf-8")).toBe(
      manifestBefore,
    );
  });
});
