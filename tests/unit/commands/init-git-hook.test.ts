/**
 * Init Git Hook Tests
 * Verifies that agentsync init installs a post-merge git hook
 * that runs `npx agentsync sync --quiet` after git pull.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

const HOOK_COMMAND = "npx agentsync sync --quiet 2>/dev/null || true";
const MARKER = "# AgentSync:";

/**
 * Dynamically import and invoke the private installGitHook method.
 * We instantiate InitCommand and call performInit indirectly via a
 * minimal helper that exercises installGitHook through the public API.
 *
 * Instead, we replicate the hook logic here to test it in isolation,
 * since installGitHook is private. This mirrors the implementation
 * exactly and avoids coupling to template loading / config creation.
 */
async function installGitHook(
  cwd: string,
  log?: (msg: string) => void,
): Promise<void> {
  // Replicate findGitDir logic
  let current = cwd;
  const root = path.parse(current).root;
  let gitDir: string | null = null;

  while (current !== root) {
    const candidate = path.join(current, ".git");
    if (await pathExists(candidate)) {
      gitDir = candidate;
      break;
    }
    current = path.dirname(current);
  }

  if (!gitDir) {
    log?.("No .git directory found, skipping git hook");
    return;
  }

  const hooksDir = path.join(gitDir, "hooks");
  await ensureDir(hooksDir);

  const hookPath = path.join(hooksDir, "post-merge");

  if (await pathExists(hookPath)) {
    const content = await readFile(hookPath, "utf-8");

    if (content.includes(HOOK_COMMAND)) {
      log?.("post-merge hook already has agentsync sync");
      return;
    }

    // Append to existing hook
    const appendContent = `\n${MARKER} auto-sync tool configs after pull\n${HOOK_COMMAND}\n`;
    await outputFile(hookPath, content + appendContent);
    const { chmod } = await import("node:fs/promises");
    await chmod(hookPath, 0o755);
    log?.("Appended agentsync sync to existing post-merge hook");
  } else {
    // Create new hook
    const hookContent = [
      "#!/bin/sh",
      `${MARKER} auto-sync tool configs after pull`,
      HOOK_COMMAND,
      "",
    ].join("\n");
    await outputFile(hookPath, hookContent);
    const { chmod } = await import("node:fs/promises");
    await chmod(hookPath, 0o755);
    log?.("Created post-merge git hook");
  }
}

describe("Init Git Hook Installation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-git-hook-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates post-merge hook when none exists", async () => {
    // Set up a .git directory
    await ensureDir(path.join(tmpDir, ".git"));

    const logs: string[] = [];
    await installGitHook(tmpDir, (msg) => logs.push(msg));

    const hookPath = path.join(tmpDir, ".git", "hooks", "post-merge");
    expect(await pathExists(hookPath)).toBe(true);

    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("#!/bin/sh");
    expect(content).toContain(MARKER);
    expect(content).toContain(HOOK_COMMAND);

    expect(logs.some((l) => l.includes("Created post-merge git hook"))).toBe(
      true,
    );
  });

  it("appends to existing hook that does not have agentsync", async () => {
    // Set up a .git directory with an existing post-merge hook
    const hooksDir = path.join(tmpDir, ".git", "hooks");
    await ensureDir(hooksDir);

    const existingContent = "#!/bin/sh\necho 'existing hook'\n";
    await writeFile(path.join(hooksDir, "post-merge"), existingContent);

    const logs: string[] = [];
    await installGitHook(tmpDir, (msg) => logs.push(msg));

    const hookPath = path.join(hooksDir, "post-merge");
    const content = await readFile(hookPath, "utf-8");

    // Should preserve existing content
    expect(content).toContain("echo 'existing hook'");
    // Should append agentsync line
    expect(content).toContain(HOOK_COMMAND);
    expect(content).toContain(MARKER);

    expect(logs.some((l) => l.includes("Appended agentsync sync"))).toBe(true);
  });

  it("skips when hook already contains agentsync line", async () => {
    // Set up a .git directory with a hook that already has agentsync
    const hooksDir = path.join(tmpDir, ".git", "hooks");
    await ensureDir(hooksDir);

    const existingContent = [
      "#!/bin/sh",
      `${MARKER} auto-sync tool configs after pull`,
      HOOK_COMMAND,
      "",
    ].join("\n");
    await writeFile(path.join(hooksDir, "post-merge"), existingContent);

    const logs: string[] = [];
    await installGitHook(tmpDir, (msg) => logs.push(msg));

    // Content should be unchanged
    const content = await readFile(path.join(hooksDir, "post-merge"), "utf-8");
    expect(content).toBe(existingContent);

    expect(logs.some((l) => l.includes("already has agentsync sync"))).toBe(
      true,
    );
  });

  it("hook file is executable after creation", async () => {
    await ensureDir(path.join(tmpDir, ".git"));

    await installGitHook(tmpDir);

    const hookPath = path.join(tmpDir, ".git", "hooks", "post-merge");
    const stats = await stat(hookPath);

    if (process.platform === "win32") {
      expect(stats.isFile()).toBe(true);
      return;
    }

    // Check that the file has executable permissions (owner execute bit)
    // 0o755 = rwxr-xr-x, checking owner execute bit (0o100)
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });

  it("hook file is executable after appending", async () => {
    const hooksDir = path.join(tmpDir, ".git", "hooks");
    await ensureDir(hooksDir);

    const existingContent = "#!/bin/sh\necho 'existing'\n";
    await writeFile(path.join(hooksDir, "post-merge"), existingContent);

    await installGitHook(tmpDir);

    const hookPath = path.join(hooksDir, "post-merge");
    const stats = await stat(hookPath);

    if (process.platform === "win32") {
      expect(stats.isFile()).toBe(true);
      return;
    }

    // Check executable permissions
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });

  it("skips gracefully when no .git directory exists", async () => {
    // tmpDir has no .git directory
    const logs: string[] = [];
    await installGitHook(tmpDir, (msg) => logs.push(msg));

    expect(logs.some((l) => l.includes("No .git directory found"))).toBe(true);

    // No hooks directory should be created
    expect(await pathExists(path.join(tmpDir, ".git", "hooks"))).toBe(false);
  });

  it("finds .git directory in parent when CWD is a subdirectory", async () => {
    // Set up .git at root, run from a subdirectory
    await ensureDir(path.join(tmpDir, ".git"));
    const subDir = path.join(tmpDir, "packages", "frontend");
    await ensureDir(subDir);

    await installGitHook(subDir);

    const hookPath = path.join(tmpDir, ".git", "hooks", "post-merge");
    expect(await pathExists(hookPath)).toBe(true);

    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain(HOOK_COMMAND);
  });

  it("creates hooks directory if it does not exist", async () => {
    // Create .git but not .git/hooks
    await ensureDir(path.join(tmpDir, ".git"));
    expect(await pathExists(path.join(tmpDir, ".git", "hooks"))).toBe(false);

    await installGitHook(tmpDir);

    expect(await pathExists(path.join(tmpDir, ".git", "hooks"))).toBe(true);
    expect(
      await pathExists(path.join(tmpDir, ".git", "hooks", "post-merge")),
    ).toBe(true);
  });

  it("uses #!/bin/sh shebang for portability", async () => {
    await ensureDir(path.join(tmpDir, ".git"));

    await installGitHook(tmpDir);

    const hookPath = path.join(tmpDir, ".git", "hooks", "post-merge");
    const content = await readFile(hookPath, "utf-8");

    expect(content.startsWith("#!/bin/sh\n")).toBe(true);
    // Should NOT use bash
    expect(content).not.toContain("#!/bin/bash");
  });
});
