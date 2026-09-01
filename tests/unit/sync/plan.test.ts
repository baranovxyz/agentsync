import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { outputFile } from "../../../src/utils/fs.js";

describe("buildSyncPlan", () => {
  let project: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (project) await rm(project, { recursive: true, force: true });
  });

  it("returns empty plan when no config exists", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-plan-missing-"));
    await expect(buildSyncPlan({ cwd: project })).rejects.toThrow();
  });

  it("auto-selects a profile from its env flag", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-plan-profile-"));
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n\n[profiles.release]\ntools = ["claude"]\nenv = "AGENTSYNC_RELEASE_TEST"\n',
    );
    vi.stubEnv("AGENTSYNC_RELEASE_TEST", "1");
    vi.stubEnv("AGENTSYNC_PROFILE", "");

    const plan = await buildSyncPlan({ cwd: project });

    expect(plan.tools).toEqual(["claude"]);
  });

  it("rejects an explicit profile when the config defines none", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-plan-profile-"));
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    vi.stubEnv("AGENTSYNC_PROFILE", "");

    await expect(
      buildSyncPlan({ cwd: project, profile: "missing" }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("matches profile paths from the git root across config gaps", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-plan-profile-"));
    const cwd = path.join(project, "packages", "api", "src");
    await outputFile(path.join(project, ".git", "keep"), "");
    await outputFile(
      path.join(project, "packages", "api", ".agents", "agentsync.toml"),
      `tools = ["cursor"]

[profiles.api]
tools = ["claude"]
paths = ["packages/api/**"]
`,
    );
    await outputFile(path.join(cwd, ".keep"), "");
    vi.stubEnv("AGENTSYNC_PROFILE", "");

    const plan = await buildSyncPlan({ cwd });

    expect(plan.tools).toEqual(["claude"]);
  });
});
