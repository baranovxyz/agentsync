import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configShow } from "../../../../src/commands/config/show.js";
import { ensureDir, outputFile } from "../../../../src/utils/fs.js";

describe("config show", () => {
  let root: string;
  let project: string;
  let home: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "agentsync-config-show-"));
    project = path.join(root, "project");
    home = path.join(root, "home");
    await Promise.all([
      ensureDir(path.join(project, ".git")),
      ensureDir(path.join(home, ".agents")),
    ]);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("AGENTSYNC_PROFILE", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it("returns the merged hierarchy with the selected global profile", async () => {
    await outputFile(
      path.join(home, ".agents", "config.toml"),
      `tools = ["claude"]

[mcp.global]
command = "global"

[profiles.ci]
tools = ["codex"]

[output_style]
tone = "friendly"
`,
    );
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      `tools = ["cursor"]

[mcp.project]
command = "project"
`,
    );
    await outputFile(
      path.join(project, "agentsync.local.toml"),
      'mcp_disabled = ["global"]\n',
    );

    const config = await configShow({ cwd: project, profile: "ci" });

    expect(config.tools).toEqual(["codex"]);
    expect(config.mcp).toEqual({
      project: { command: "project", args: [] },
    });
    expect(config.output_style).toEqual({ tone: "friendly" });
    expect(config.profiles).toHaveProperty("ci");
    expect(config._sources).toMatchObject({
      global: path.join(home, ".agents", "config.toml"),
      local: path.join(project, "agentsync.local.toml"),
    });
  });
});
