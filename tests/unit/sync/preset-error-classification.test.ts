/**
 * Preset Error Classification
 *
 * `buildSyncPlan` must not report a missing preset ref (the remote answered,
 * the ref just doesn't exist) with the same retryable "check your network"
 * shape as a genuinely unreachable remote. Classification comes from the
 * caught error's structural code, never from parsing message text.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetRefNotFoundError } from "../../../src/core/errors.js";
import { outputFile } from "../../../src/utils/fs.js";

const resolveMock = vi.fn();

vi.mock("../../../src/core/registry/source-resolver.js", () => ({
  SourceResolver: vi.fn().mockImplementation(() => ({ resolve: resolveMock })),
}));

describe("preset error classification", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "agentsync-preset-errors-"));
    resolveMock.mockReset();
    await outputFile(
      path.join(cwd, ".agents", "agentsync.toml"),
      'tools = ["claude"]\nextends = ["github:acme/standards@does-not-exist"]\n',
    );
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  // buildSyncPlan walks the full config hierarchy for a real tmpdir cwd, which
  // is comfortably fast in isolation but can exceed vitest's default 5s under
  // a loaded shared host — give it room rather than risk a contention flake.
  it("reports a missing ref as PRESET_REF_NOT_FOUND, not retryable", async () => {
    resolveMock.mockRejectedValue(
      new PresetRefNotFoundError("github:acme/standards", "does-not-exist"),
    );
    const { buildSyncPlan } = await import("../../../src/sync/plan.js");

    const plan = await buildSyncPlan({ cwd });

    expect(plan.presetErrors).toHaveLength(1);
    expect(plan.presetErrors[0]).toMatchObject({
      code: "PRESET_REF_NOT_FOUND",
      retryable: false,
    });
    expect(plan.presetErrors[0].suggestion).toContain("config rm preset");
  }, 20000);

  it("keeps an unreachable remote as PRESET_UNREACHABLE, retryable", async () => {
    resolveMock.mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND github.com"),
    );
    const { buildSyncPlan } = await import("../../../src/sync/plan.js");

    const plan = await buildSyncPlan({ cwd });

    expect(plan.presetErrors).toHaveLength(1);
    expect(plan.presetErrors[0]).toMatchObject({
      code: "PRESET_UNREACHABLE",
      retryable: true,
    });
  }, 20000);
});
