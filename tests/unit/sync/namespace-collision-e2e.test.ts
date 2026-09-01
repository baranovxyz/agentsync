import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { outputFile } from "../../../src/utils/fs.js";

describe("preset namespace collision", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "agentsync-namespace-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  async function writeConfig(extendsSources: readonly string[]): Promise<void> {
    const quoted = extendsSources
      .map((source) => JSON.stringify(source))
      .join(", ");
    await outputFile(
      path.join(cwd, ".agents", "agentsync.toml"),
      `tools = ["claude"]\nextends = [${quoted}]\n`,
    );
  }

  async function collisionError(): Promise<ConfigError> {
    try {
      await buildSyncPlan({ cwd });
    } catch (error) {
      if (error instanceof ConfigError) return error;
      throw error;
    }
    throw new Error("expected namespace collision");
  }

  it("tells users to keep one version when two refs derive one namespace", async () => {
    await writeConfig(["github:acme/standards@v1", "github:acme/standards@v2"]);

    const error = await collisionError();

    expect(error.message).toBe('Namespace collision: "acme-standards"');
    expect(error.suggestion).toContain("Keep exactly one version");
    expect(error.suggestion).not.toContain("object form");
  });

  it("offers only current-format recovery for different colliding sources", async () => {
    await writeConfig(["github:alpha/shared", "fs:./alpha-shared"]);

    const error = await collisionError();

    expect(error.message).toBe('Namespace collision: "alpha-shared"');
    expect(error.suggestion).toContain("Remove one source");
    expect(error.suggestion).toContain("unique final path or repository name");
    expect(error.suggestion).not.toContain("namespace:");
  });
});
