/**
 * Monorepo Sync Integration Tests
 * Tests for hierarchical config discovery, merging, and profile resolution
 * during the sync command.
 */
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "../../src/commands/sync.js";
import { ensureDir } from "../../src/utils/fs.js";

/**
 * Helper to create a temp directory for each test.
 * Creates a .git marker so that discoverConfigChain stops walking at this root.
 */
async function createMonorepoRoot(): Promise<string> {
  const root = join(
    tmpdir(),
    `agentsync-mono-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(root, { recursive: true });
  await mkdir(join(root, ".git"));
  return root;
}

async function addTestCommand(projectRoot: string): Promise<void> {
  const commandsDir = join(projectRoot, ".agents", "commands");
  await ensureDir(commandsDir);
  await writeFile(
    join(commandsDir, "test.md"),
    "---\ndescription: Test command\n---\n# Test",
  );
}

describe("monorepo sync with profiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await createMonorepoRoot();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it("syncs from CWD using resolved hierarchy (team inherits from org)", async () => {
    // Org root with cursor enabled
    await ensureDir(join(root, ".agents", "skills", "org-security"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    await writeFile(
      join(root, ".agents", "skills", "org-security", "SKILL.md"),
      "---\nname: org-security\ndescription: Org security rules\n---\n# Security\nAlways validate input.",
    );

    // Team subdirectory config that inherits cursor from org
    const teamDir = join(root, "frontend");
    await ensureDir(join(teamDir, ".agents", "skills", "react-patterns"));
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      "# No tools override — inherit from org\n",
    );
    await writeFile(
      join(teamDir, ".agents", "skills", "react-patterns", "SKILL.md"),
      "---\nname: react-patterns\ndescription: React patterns\n---\n# React\nUse hooks.",
    );
    await addTestCommand(teamDir);

    // Sync from team directory -- should inherit cursor from org
    await sync({ cwd: teamDir, json: true });

    // Cursor reads canonical skills natively and projects supported commands.
    await expect(
      access(join(teamDir, ".agents", "skills", "react-patterns", "SKILL.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(teamDir, ".cursor", "commands", "test.md")),
    ).resolves.toBeUndefined();
    await expect(access(join(teamDir, ".cursor", "skills"))).rejects.toThrow();
  });

  it("applies profile when --profile is passed", async () => {
    await ensureDir(join(root, ".agents", "skills", "test-skill"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor", "claude"]',
        "",
        "[profiles.minimal]",
        'tools = ["cursor"]',
      ].join("\n"),
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test-skill\ndescription: A test\n---\n# Test",
    );
    await addTestCommand(root);

    // With profile "minimal", only cursor should be active
    await sync({ cwd: root, profile: "minimal", json: true });

    // Cursor should receive commands while reading skills from .agents/ natively.
    await expect(
      access(join(root, ".cursor", "commands", "test.md")),
    ).resolves.toBeUndefined();
    await expect(access(join(root, ".cursor", "skills"))).rejects.toThrow();

    // claude should NOT be synced since "minimal" profile only has cursor
    await expect(access(join(root, ".claude"))).rejects.toThrow();
  });

  it("single-root current-format project syncs normally", async () => {
    await ensureDir(join(root, ".agents", "skills", "test-skill"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test\ndescription: Test skill\n---\n# Test",
    );
    await addTestCommand(root);

    await sync({ cwd: root, json: true });
    await expect(
      access(join(root, ".cursor", "commands", "test.md")),
    ).resolves.toBeUndefined();
    await expect(access(join(root, ".cursor", "skills"))).rejects.toThrow();
  });

  it("profile from AGENTSYNC_PROFILE is used when no --profile flag", async () => {
    await ensureDir(join(root, ".agents", "skills", "test-skill"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor", "claude"]',
        "",
        "[profiles.ci]",
        'tools = ["claude"]',
      ].join("\n"),
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test\ndescription: A test\n---\n# Test",
    );
    await addTestCommand(root);
    vi.stubEnv("AGENTSYNC_PROFILE", "ci");

    // No --profile flag; the environment selects the "ci" profile.
    await sync({ cwd: root, json: true });

    // Only claude should be synced per the "ci" profile
    await expect(access(join(root, ".claude"))).resolves.toBeUndefined();

    // cursor should NOT be synced
    await expect(access(join(root, ".cursor"))).rejects.toThrow();
  });

  it("--profile flag overrides AGENTSYNC_PROFILE", async () => {
    await ensureDir(join(root, ".agents", "skills", "test-skill"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      [
        'tools = ["cursor", "claude"]',
        "",
        "[profiles.ci]",
        'tools = ["claude"]',
        "",
        "[profiles.dev]",
        'tools = ["cursor"]',
      ].join("\n"),
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test\ndescription: A test\n---\n# Test",
    );
    await addTestCommand(root);
    vi.stubEnv("AGENTSYNC_PROFILE", "ci");

    // --profile=dev overrides AGENTSYNC_PROFILE=ci.
    await sync({ cwd: root, profile: "dev", json: true });

    // Only Cursor should be synced per the "dev" profile.
    await expect(
      access(join(root, ".cursor", "commands", "test.md")),
    ).resolves.toBeUndefined();
    await expect(access(join(root, ".cursor", "skills"))).rejects.toThrow();

    // claude should NOT be synced
    await expect(access(join(root, ".claude"))).rejects.toThrow();
  });

  it("no profile applied when profiles section is absent", async () => {
    await ensureDir(join(root, ".agents", "skills", "test-skill"));
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      'tools = ["cursor", "claude"]\n',
    );
    await writeFile(
      join(root, ".agents", "skills", "test-skill", "SKILL.md"),
      "---\nname: test\ndescription: A test\n---\n# Test",
    );
    await addTestCommand(root);

    // Both tools should be synced since no profiles section
    await sync({ cwd: root, json: true });

    await expect(
      access(join(root, ".cursor", "commands", "test.md")),
    ).resolves.toBeUndefined();
    await expect(access(join(root, ".cursor", "skills"))).rejects.toThrow();
    await expect(access(join(root, ".claude"))).resolves.toBeUndefined();
  });
});
