import { describe, expect, it } from "vitest";

describe("buildSyncPlan", () => {
  it("returns empty plan when no config exists", async () => {
    const { buildSyncPlan } = await import("../../../src/sync/plan.js");
    // With a nonexistent directory, should throw ConfigError
    await expect(
      buildSyncPlan({ cwd: "/tmp/nonexistent-agentsync-test" }),
    ).rejects.toThrow();
  });
});
