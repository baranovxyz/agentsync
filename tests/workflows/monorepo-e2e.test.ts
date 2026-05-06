/**
 * Monorepo E2E Workflow Tests
 * Tests hierarchy merging, profile selection, and multi-layer sync
 */

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../src/commands/sync.js";

describe("monorepo e2e workflow", () => {
  let root: string;

  beforeEach(async () => {
    // Create a unique temp dir for each test
    const base = join(tmpdir(), "agentsync-e2e-mono-");
    root = join(base + Date.now() + Math.random().toString(36).slice(2));
    await mkdir(root, { recursive: true });
    // Place .git at root so discoverConfigChain stops here
    await mkdir(join(root, ".git"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("full monorepo: org + team layers sync correctly", async () => {
    // Org layer at root: defines cursor tool and a skill
    await mkdir(join(root, ".agents", "skills", "security"), {
      recursive: true,
    });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor"]',
        "",
        "[mcp_servers.github]",
        'command = "npx"',
        'args = ["-y", "gh-mcp"]',
      ].join("\n"),
    );
    await writeFile(
      join(root, ".agents", "skills", "security", "SKILL.md"),
      "---\nname: security\ndescription: Security rules\n---\n# Security\nValidate all input.",
    );

    // Frontend team layer: adds storybook MCP and a react skill
    const frontendDir = join(root, "frontend");
    await mkdir(join(frontendDir, ".agents", "skills", "react"), {
      recursive: true,
    });
    await writeFile(
      join(frontendDir, ".agents", "agentsync.toml"),
      [
        "[mcp_servers.storybook]",
        'command = "npx"',
        'args = ["-y", "sb-mcp"]',
      ].join("\n"),
    );
    await writeFile(
      join(frontendDir, ".agents", "skills", "react", "SKILL.md"),
      "---\nname: react\ndescription: React patterns\n---\n# React\nUse hooks.",
    );

    // Sync from frontend dir — should inherit cursor tool from org
    await sync({ cwd: frontendDir, json: true });

    // Cursor skills dir should exist (cursor inherited from org config)
    await expect(
      access(join(frontendDir, ".cursor", "skills")),
    ).resolves.toBeUndefined();

    // The react skill should be synced (from frontend's own .agents/skills/)
    await expect(
      access(join(frontendDir, ".cursor", "skills", "react", "SKILL.md")),
    ).resolves.toBeUndefined();

    // The MCP config should have both github (from org) and storybook (from frontend)
    const mcpContent = JSON.parse(
      await readFile(join(frontendDir, ".cursor", "mcp.json"), "utf-8"),
    );
    expect(mcpContent.mcpServers.github).toBeDefined();
    expect(mcpContent.mcpServers.storybook).toBeDefined();
  });

  it("profile limits tools to subset", async () => {
    await mkdir(join(root, ".agents", "skills", "test-skill"), {
      recursive: true,
    });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor", "claude"]',
        "",
        "[profiles.cursor-only]",
        'tools = ["cursor"]',
      ].join("\n"),
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test-skill\ndescription: Test skill\n---\n# Test",
    );

    await sync({ cwd: root, profile: "cursor-only", json: true });

    // Cursor should be synced (profile includes it)
    await expect(access(join(root, ".cursor"))).resolves.toBeUndefined();
    // Claude should NOT be synced (profile limits to cursor only)
    await expect(access(join(root, ".claude"))).rejects.toThrow();
  });

  it("backward compat: single-root project works unchanged", async () => {
    await mkdir(join(root, ".agents", "skills", "test"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    await writeFile(
      join(root, ".agents", "skills", "test", "SKILL.md"),
      "---\nname: test\ndescription: Test skill\n---\n# Test",
    );

    await sync({ cwd: root, json: true });

    // Cursor skills should be created
    await expect(
      access(join(root, ".cursor", "skills")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(root, ".cursor", "skills", "test", "SKILL.md")),
    ).resolves.toBeUndefined();
  });

  it("three-level hierarchy merges correctly", async () => {
    // Org level: defines cursor + github MCP
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor"]',
        "",
        "[mcp_servers.github]",
        'command = "npx"',
        'args = ["-y", "gh-mcp"]',
      ].join("\n"),
    );

    // Team level: adds storybook MCP
    const teamDir = join(root, "frontend");
    await mkdir(join(teamDir, ".agents"), { recursive: true });
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      [
        "[mcp_servers.storybook]",
        'command = "npx"',
        'args = ["-y", "sb-mcp"]',
      ].join("\n"),
    );

    // Service level: adds stripe MCP
    const serviceDir = join(root, "frontend", "packages", "checkout");
    await mkdir(join(serviceDir, ".agents"), { recursive: true });
    await writeFile(
      join(serviceDir, ".agents", "agentsync.toml"),
      [
        "[mcp_servers.stripe]",
        'command = "npx"',
        'args = ["-y", "stripe-mcp"]',
      ].join("\n"),
    );

    // Sync from service level — should merge all three layers
    await sync({ cwd: serviceDir, json: true });

    // Cursor should exist (inherited from org)
    await expect(access(join(serviceDir, ".cursor"))).resolves.toBeUndefined();

    // MCP config should have all three servers
    const mcpContent = JSON.parse(
      await readFile(join(serviceDir, ".cursor", "mcp.json"), "utf-8"),
    );
    expect(mcpContent.mcpServers.github).toBeDefined();
    expect(mcpContent.mcpServers.storybook).toBeDefined();
    expect(mcpContent.mcpServers.stripe).toBeDefined();
  });
});
