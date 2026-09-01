import { describe, expect, it } from "vitest";
import {
  applyProfile,
  selectProfile,
} from "../../../../src/core/config/profiles.js";
import type {
  AgentSyncConfig,
  ProfileConfig,
} from "../../../../src/types/schemas.js";

describe("selectProfile", () => {
  const profiles: Record<string, ProfileConfig> = {
    frontend: {
      tools: ["cursor", "copilot"],
      mcp: ["storybook"],
      paths: ["frontend/**"],
    },
    backend: {
      tools: ["claude", "cursor"],
      mcp: ["postgres"],
      paths: ["backend/**"],
    },
    ci: {
      tools: ["codex", "claude"],
      mcp: ["github"],
      env: "CI",
    },
  };

  it("selects profile from explicit name", () => {
    expect(selectProfile(profiles, { explicit: "frontend" })).toBe("frontend");
  });

  it("selects profile from env var", () => {
    expect(selectProfile(profiles, { envVar: "backend" })).toBe("backend");
  });

  it("selects profile from path match", () => {
    expect(
      selectProfile(profiles, { repoRelativePath: "frontend/packages/design" }),
    ).toBe("frontend");
  });

  it("selects profile from env=CI auto-detect", () => {
    expect(selectProfile(profiles, { envFlags: { CI: "true" } })).toBe("ci");
  });

  it("treats an empty environment variable as set", () => {
    expect(selectProfile(profiles, { envFlags: { CI: "" } })).toBe("ci");
  });

  it("falls through from env auto-detection to a path match", () => {
    expect(
      selectProfile(profiles, {
        envFlags: {},
        repoRelativePath: "backend/services/api",
      }),
    ).toBe("backend");
  });

  it("explicit beats env var", () => {
    expect(
      selectProfile(profiles, { explicit: "frontend", envVar: "backend" }),
    ).toBe("frontend");
  });

  it.each([
    ["--profile", { explicit: "missing" }],
    ["AGENTSYNC_PROFILE", { envVar: "missing" }],
  ])("rejects an unknown profile from %s", (source, context) => {
    expect(() => selectProfile(profiles, context)).toThrow(
      `Unknown profile "missing" from ${source}`,
    );
  });

  it("returns undefined when nothing matches", () => {
    expect(
      selectProfile(profiles, { repoRelativePath: "data/pipeline" }),
    ).toBeUndefined();
  });

  it("first path match wins when multiple match", () => {
    const overlapping: Record<string, ProfileConfig> = {
      first: { tools: ["cursor"], paths: ["shared/**"] },
      second: { tools: ["claude"], paths: ["shared/**"] },
    };
    expect(
      selectProfile(overlapping, { repoRelativePath: "shared/utils" }),
    ).toBe("first");
  });

  it("supports path globs beyond fixed prefixes", () => {
    const globProfiles: Record<string, ProfileConfig> = {
      package: { paths: ["packages/*/src/**"] },
    };

    expect(
      selectProfile(globProfiles, {
        repoRelativePath: "packages/api/src/routes/users",
      }),
    ).toBe("package");
    expect(
      selectProfile(globProfiles, {
        repoRelativePath: "packages/api/test/routes/users",
      }),
    ).toBeUndefined();
  });
});

describe("applyProfile", () => {
  it("replaces tools", () => {
    const base: AgentSyncConfig = {
      tools: ["cursor", "claude", "opencode"],
    };
    const profile: ProfileConfig = { tools: ["cursor", "copilot"] };
    const result = applyProfile(base, profile);
    expect(result.tools).toEqual(["cursor", "copilot"]);
  });

  it("filters mcp with the profile allowlist", () => {
    const base: AgentSyncConfig = {
      mcp: {
        github: { command: "npx", args: ["gh-mcp"] },
        postgres: { command: "npx", args: ["pg-mcp"] },
        storybook: { command: "npx", args: ["sb-mcp"] },
      },
    };
    const profile: ProfileConfig = { mcp: ["github", "storybook"] };
    const result = applyProfile(base, profile);
    expect(result.mcp).toHaveProperty("github");
    expect(result.mcp).toHaveProperty("storybook");
    expect(result.mcp).not.toHaveProperty("postgres");
  });

  it("replaces mcp to empty when profile.mcp has no matches", () => {
    const base: AgentSyncConfig = {
      mcp: {
        github: { command: "npx", args: ["gh-mcp"] },
      },
    };
    const profile: ProfileConfig = { mcp: ["nonexistent"] };
    const result = applyProfile(base, profile);
    expect(result.mcp).toBeUndefined();
  });

  it("filters extends without introducing new preset sources", () => {
    const base: AgentSyncConfig = {
      extends: ["github:acme/base", "github:acme/frontend"],
    };
    const profile: ProfileConfig = {
      extends: ["github:acme/frontend", "github:other/not-in-base"],
    };

    expect(applyProfile(base, profile).extends).toEqual([
      "github:acme/frontend",
    ]);
  });

  it("allows a profile to disable every preset", () => {
    const base: AgentSyncConfig = { extends: ["github:acme/base"] };

    expect(applyProfile(base, { extends: [] }).extends).toEqual([]);
  });

  it("returns base unchanged when no profile", () => {
    const base: AgentSyncConfig = { tools: ["cursor"] };
    expect(applyProfile(base, undefined)).toEqual(base);
  });
});
