/**
 * Extensions CLI E2E
 *
 * Spawns `node dist/cli.js sync` against a real tmpdir project. Unlike the
 * other tests in tests/e2e/ which import sync sub-modules and call them
 * directly, this one drives the real CLI binary the way a user does.
 *
 * Motivation: an earlier revision shipped with the full unit suite green,
 * yet `agentsync sync` wrote zero extension files on a minimal
 * `[[hooks.PreToolUse]]` config — because loadConfigHierarchy silently
 * dropped the new fields between mergeConfigChain and the plan. No test
 * exercised the dist/cli.js → loadConfigHierarchy → planSync → execute →
 * write path end-to-end, so the gap was invisible.
 *
 * Every canonical surface gets at least one assertion here. Skip via
 * SKIP_CLI_E2E=1 in environments without a built dist/.
 *
 */

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(PACKAGE_ROOT, "dist");
const CLI_PATH = path.join(DIST_DIR, "cli.js");
const SKIP = process.env.SKIP_CLI_E2E === "1";
let cliPath = CLI_PATH;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function distReady(distDir: string): Promise<boolean> {
  if (!(await pathExists(path.join(distDir, "cli.js")))) return false;

  // During `pnpm build`, tsc writes module files and Vite later replaces the
  // directory with a bundled cli.js. Both final shapes are usable; the transient
  // broken shape is a module tree missing a dependency.
  if (!(await pathExists(path.join(distDir, "sync")))) return true;
  return pathExists(path.join(distDir, "utils", "fs.js"));
}

async function prepareCliCopy(): Promise<string | undefined> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await distReady(DIST_DIR))) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    const root = await mkdtemp(path.join(PACKAGE_ROOT, ".temp-cli-e2e-dist-"));
    const copiedDist = path.join(root, "dist");
    try {
      await cp(DIST_DIR, copiedDist, { recursive: true });
      if (await distReady(copiedDist)) return path.join(copiedDist, "cli.js");
    } catch {
      // Another test may be rebuilding dist concurrently; retry with a fresh copy.
    }
    await rm(root, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return undefined;
}

function runSync(cwd: string): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [cliPath, "sync", "--json"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "" };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    throw new Error(
      `agentsync sync failed (exit ${error.status}): ` +
        `stdout=${error.stdout ?? ""} stderr=${error.stderr ?? ""}`,
    );
  }
}

describe.skipIf(SKIP)("CLI E2E: extensions reach real `agentsync sync`", () => {
  let tmp: string;
  let built: boolean;
  let cliCopyRoot: string | undefined;

  beforeAll(async () => {
    const preparedCli = await prepareCliCopy();
    built = preparedCli !== undefined;
    if (!preparedCli) return;

    cliPath = preparedCli;
    cliCopyRoot = path.dirname(path.dirname(preparedCli));
  });

  beforeEach(async () => {
    if (!built) return;
    tmp = await mkdtemp(path.join(tmpdir(), "agentsync-cli-e2e-"));
  });

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (cliCopyRoot) await rm(cliCopyRoot, { recursive: true, force: true });
  });

  async function seed(config: string, hookScript = "#!/bin/sh\nexit 0\n") {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await rm(path.join(tmp, ".agents"), { recursive: true, force: true });
    const scriptsDir = path.join(tmp, ".agents", "hooks", "scripts");
    await mkdir(scriptsDir, { recursive: true });
    await writeFile(path.join(tmp, ".agents", "agentsync.toml"), config);
    await writeFile(path.join(scriptsDir, "log-bash.sh"), hookScript, {
      mode: 0o755,
    });
  }

  it("writes .claude/settings.json hooks block from [[hooks.PreToolUse]]", async () => {
    if (!built) return;
    await seed(`tools = ["claude"]

[[hooks.PreToolUse]]
id = "log-bash"
matcher = "Bash"
command = ".agents/hooks/scripts/log-bash.sh"
`);

    runSync(tmp);

    const settings = JSON.parse(
      await readFile(path.join(tmp, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks?.PreToolUse).toBeDefined();
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain(
      ".claude/hooks/scripts/log-bash.sh",
    );
  });

  it("does NOT write [[hooks.*]] for codex (cx 0.130 has no hooks system)", async () => {
    if (!built) return;
    await seed(`tools = ["codex"]

[[hooks.PreToolUse]]
id = "log-bash"
matcher = "Bash"
command = ".agents/hooks/scripts/log-bash.sh"
`);

    const { stdout } = runSync(tmp);
    const parsed = JSON.parse(stdout) as { warnings?: string[] };
    // sync surfaces "codex does not support hooks" so the user knows
    // their canonical hooks did not reach cx.
    expect(parsed.warnings ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("codex does not support hooks"),
      ]),
    );

    // If .codex/config.toml exists at all (no other writers ran), it
    // must not contain a hooks block.
    const cfg = path.join(tmp, ".codex", "config.toml");
    try {
      const raw = await readFile(cfg, "utf-8");
      const tomlParsed = parseToml(raw) as Record<string, unknown>;
      expect(tomlParsed.hooks).toBeUndefined();
    } catch (err) {
      // ENOENT is fine — nothing wrote .codex/config.toml in this scenario.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  });

  it("writes .claude/settings.json permissions from [permissions]", async () => {
    if (!built) return;
    await seed(`tools = ["claude"]

[permissions]
default = "ask"

[[permissions.rules]]
id = "no-curl"
tool = "Bash"
pattern = "curl *"
decision = "deny"
`);

    runSync(tmp);

    const settings = JSON.parse(
      await readFile(path.join(tmp, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.deny).toBeDefined();
    // Regression: canonical default="ask" must map to cc's vocabulary
    // (default|acceptEdits|bypassPermissions|plan), not pass through. A live
    // smoke run surfaced "Found 1 settings issue · /doctor" when cc saw
    // defaultMode="ask".
    expect(settings.permissions.defaultMode).toBe("default");
  });

  it("writes .claude/statusline/render.sh from [statusline]", async () => {
    if (!built) return;
    await seed(`tools = ["claude"]

[statusline]
items = ["model", "branch"]
`);

    runSync(tmp);

    const script = await readFile(
      path.join(tmp, ".claude", "statusline", "render.sh"),
      "utf-8",
    );
    expect(script.length).toBeGreaterThan(0);

    const settings = JSON.parse(
      await readFile(path.join(tmp, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.statusLine?.command).toContain("render.sh");
  });

  it("writes .claude/settings.json outputStyle when tone has a cc built-in", async () => {
    if (!built) return;
    // cc only has built-ins for terse → Concise and explanatory →
    // Explanatory. pragmatic/none/friendly fall through to null and
    // write nothing (only "friendly" emits a warning — pragmatic/none
    // are silent no-ops).
    await seed(`tools = ["claude"]

[output_style]
tone = "terse"
`);

    runSync(tmp);

    const ccSettings = JSON.parse(
      await readFile(path.join(tmp, ".claude", "settings.json"), "utf-8"),
    );
    expect(ccSettings.outputStyle).toBe("Concise");
  });

  it("writes .codex/config.toml profiles.default.personality from [output_style]", async () => {
    if (!built) return;
    await seed(`tools = ["codex"]

[output_style]
tone = "pragmatic"
`);

    runSync(tmp);

    const cxRaw = await readFile(
      path.join(tmp, ".codex", "config.toml"),
      "utf-8",
    );
    const cxParsed = parseToml(cxRaw) as Record<
      string,
      Record<string, unknown>
    >;
    expect(cxParsed.profiles?.default?.personality).toBe("pragmatic");
  });
});
