import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfigHierarchy } from "../../../../src/core/config/hierarchy.js";

describe("loadConfigHierarchy — monorepo", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agentsync-hierarchy-"));
    await mkdir(join(root, ".git"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("single root config behaves identically to current behavior", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor"]\n`,
    );

    const config = await loadConfigHierarchy(root);
    expect(config.tools).toEqual(expect.arrayContaining(["cursor"]));
    expect(config._sources.project).toBe(
      join(root, ".agents", "agentsync.toml"),
    );
    expect(config._sources.chain).toEqual([
      join(root, ".agents", "agentsync.toml"),
    ]);
  });

  it("merges org + team configs", async () => {
    // Org root
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor", "claude"]\n\n[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "gh-mcp"]\n`,
    );

    // Team
    const teamDir = join(root, "frontend");
    await mkdir(join(teamDir, ".agents"), { recursive: true });
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      `[mcp_servers.storybook]\ncommand = "npx"\nargs = ["-y", "sb-mcp"]\n`,
    );

    const config = await loadConfigHierarchy(teamDir);
    // Tools from org (team didn't override)
    expect(config.tools).toEqual(expect.arrayContaining(["cursor", "claude"]));
    // MCP servers from both levels (defined = enabled)
    expect(config.mcp?.github).toBeDefined();
    expect(config.mcp?.storybook).toBeDefined();
    // Chain tracked
    expect(config._sources.chain).toHaveLength(2);
  });

  it("team tools override org tools", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor", "claude", "opencode"]\n`,
    );

    const teamDir = join(root, "frontend");
    await mkdir(join(teamDir, ".agents"), { recursive: true });
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      `tools = ["cursor", "copilot"]\n`,
    );

    const config = await loadConfigHierarchy(teamDir);
    expect(config.tools).toEqual(expect.arrayContaining(["cursor", "copilot"]));
    expect(config.tools).not.toContain("opencode");
  });

  it("three-level chain (org > team > app)", async () => {
    // Org root
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor"]\n\n[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "gh-mcp"]\n`,
    );

    // Team
    const teamDir = join(root, "packages");
    await mkdir(join(teamDir, ".agents"), { recursive: true });
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      `[mcp_servers.db]\ncommand = "npx"\nargs = ["-y", "db-mcp"]\n`,
    );

    // App (most specific)
    const appDir = join(teamDir, "web-app");
    await mkdir(join(appDir, ".agents"), { recursive: true });
    await writeFile(
      join(appDir, ".agents", "agentsync.toml"),
      `tools = ["claude"]\n`,
    );

    const config = await loadConfigHierarchy(appDir);
    // Most-specific tools win
    expect(config.tools).toEqual(expect.arrayContaining(["claude"]));
    expect(config.tools).not.toContain("cursor");
    // MCP servers from all levels (defined = enabled)
    expect(config.mcp?.github).toBeDefined();
    expect(config.mcp?.db).toBeDefined();
    // Full chain
    expect(config._sources.chain).toHaveLength(3);
    expect(config._sources.project).toBe(
      join(appDir, ".agents", "agentsync.toml"),
    );
  });

  it("local overrides only apply at CWD level", async () => {
    // Org root with local override (should NOT be loaded)
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor"]\n`,
    );
    await writeFile(
      join(root, "agentsync.local.toml"),
      `[mcp.rootLocal]\ncommand = "echo"\nargs = ["root"]\n`,
    );

    // App dir with its own local override (should be loaded)
    const appDir = join(root, "app");
    await mkdir(join(appDir, ".agents"), { recursive: true });
    await writeFile(join(appDir, ".agents", "agentsync.toml"), `tools = []\n`);
    await writeFile(
      join(appDir, "agentsync.local.toml"),
      `[mcp.appLocal]\ncommand = "echo"\nargs = ["app"]\n`,
    );

    const config = await loadConfigHierarchy(appDir);
    // Local from app dir should be loaded
    expect(config.mcp?.appLocal).toBeDefined();
    // Local from root should NOT be loaded
    expect(config.mcp?.rootLocal).toBeUndefined();
  });

  it("gaps in chain are fine (some dirs have no config)", async () => {
    // Org root
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      `tools = ["cursor"]\n`,
    );

    // packages/ dir has NO config (gap)
    const teamDir = join(root, "packages");
    await mkdir(teamDir, { recursive: true });

    // packages/app has config
    const appDir = join(teamDir, "app");
    await mkdir(join(appDir, ".agents"), { recursive: true });
    await writeFile(
      join(appDir, ".agents", "agentsync.toml"),
      `tools = ["claude"]\n`,
    );

    const config = await loadConfigHierarchy(appDir);
    // Should only have 2 entries in chain (skipping the gap)
    expect(config._sources.chain).toHaveLength(2);
    expect(config.tools).toEqual(expect.arrayContaining(["claude"]));
  });
});
