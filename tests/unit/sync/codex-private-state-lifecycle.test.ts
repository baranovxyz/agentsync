import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanCommand } from "../../../src/commands/clean.js";
import { sync } from "../../../src/commands/sync.js";
import { syncAgents } from "../../../src/sync/agents.js";
import { executeSyncPlan } from "../../../src/sync/execute.js";
import { syncExtensions } from "../../../src/sync/extensions.js";
import {
  getManifestPath,
  readManifest,
  SyncManifestSchema,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import { buildSyncPlan } from "../../../src/sync/plan.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";

vi.mock("../../../src/utils/global-config.js", () => ({
  getGlobalConfigDir: () => "/tmp/agentsync-test-no-global",
  getGlobalConfigPath: () => "/tmp/agentsync-test-no-global/config.toml",
  loadGlobalConfig: async () => null,
}));

const ROLE_SOURCE = ".agents/agents/reviewer.md";
const ROLE_MARKDOWN = ".codex/agents/reviewer.md";
const ROLE_TOML = ".codex/agents/reviewer.toml";
const RECEIPT = ".codex/.agentsync-ownership.json";

describe("Codex provider-private state lifecycle", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-codex-state-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
  });

  async function configure(tools: string[], extension = ""): Promise<void> {
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      `tools = [${tools.map((tool) => `"${tool}"`).join(", ")}]\n${extension}`,
    );
  }

  async function writeRole(): Promise<void> {
    await outputFile(
      path.join(project, ROLE_SOURCE),
      "---\ndescription: Managed reviewer\n---\n# Reviewer\n",
    );
  }

  async function run(tool?: "codex" | "cursor") {
    const plan = await buildSyncPlan({ cwd: project, tool });
    return executeSyncPlan(plan, {
      cwd: project,
      filtered: tool !== undefined,
    });
  }

  it("normalizes private-state markers deterministically", async () => {
    await writeOwnedManifest(project, new Map(), {
      preserveUnselected: false,
      providerStateOwners: ["unknown", "codex", "codex"],
    });

    expect((await readManifest(project))?.provider_state_owners).toEqual([
      "codex",
    ]);
  });

  it.each([
    "role",
    "extension",
  ])("records %s-only state without generic Codex agent ownership", async (surface) => {
    await configure(
      ["codex"],
      surface === "extension" ? '\n[permissions]\ndefault = "ask"\n' : "",
    );
    if (surface === "role") await writeRole();

    await run();

    const manifest = await readManifest(project);
    expect(manifest?.provider_state_owners).toEqual(["codex"]);
    expect(manifest?.owners?.codex).toBeUndefined();
    if (surface === "role") {
      expect(manifest?.files).toHaveProperty(ROLE_MARKDOWN);
    }
  });

  it("drops the selected Codex marker when no private state remains", async () => {
    await configure(["codex"], '\n[permissions]\ndefault = "ask"\n');
    await run();
    await configure(["codex"]);

    await run();

    expect(
      (await readManifest(project))?.provider_state_owners,
    ).toBeUndefined();
    expect(await pathExists(path.join(project, RECEIPT))).toBe(false);
  });

  it("fully withdraws an unselected Codex role group", async () => {
    await configure(["codex"]);
    await writeRole();
    await run();
    const currentManifest = await readManifest(project);
    if (!currentManifest) throw new Error("expected sync manifest");
    const unindexedManifest = SyncManifestSchema.parse({
      files: currentManifest.files,
      symlink_targets: currentManifest.symlink_targets,
      owners: { codex: [ROLE_MARKDOWN] },
      timestamp: currentManifest.timestamp,
    });
    await outputFile(
      getManifestPath(project),
      `${JSON.stringify(unindexedManifest, null, 2)}\n`,
    );
    await configure(["cursor"]);
    await rm(path.join(project, ROLE_SOURCE));

    const result = await run();

    for (const relativePath of [ROLE_MARKDOWN, ROLE_TOML, RECEIPT]) {
      expect(await pathExists(path.join(project, relativePath))).toBe(false);
    }
    expect(
      (await readManifest(project))?.provider_state_owners,
    ).toBeUndefined();
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("unsafe manifest ownership path"),
      ]),
    );
  });

  it("preserves unselected Codex private state during filtered sync", async () => {
    await configure(["codex", "cursor"], '\n[permissions]\ndefault = "ask"\n');
    await writeRole();
    await run();
    const receiptBefore = await readFile(path.join(project, RECEIPT), "utf-8");
    await configure(["codex", "cursor"]);
    await rm(path.join(project, ROLE_SOURCE));

    await run("cursor");

    expect(await readFile(path.join(project, RECEIPT), "utf-8")).toBe(
      receiptBefore,
    );
    expect(await pathExists(path.join(project, ROLE_MARKDOWN))).toBe(true);
    expect((await readManifest(project))?.provider_state_owners).toContain(
      "codex",
    );
  });

  it("discovers and withdraws unindexed extension-only state on zero-tool sync", async () => {
    await configure([]);
    await syncExtensions(
      [getToolProvider("codex")],
      { permissions: { default: "ask" } },
      project,
    );
    expect(await readManifest(project)).toBeUndefined();

    await sync({ cwd: project, json: true });

    expect(await pathExists(path.join(project, RECEIPT))).toBe(false);
    expect(
      await readFile(path.join(project, ".codex/config.toml"), "utf-8"),
    ).not.toContain("default_permissions");
  });

  it("preserves and relinquishes a modified role group atomically", async () => {
    await configure(["codex"]);
    await writeRole();
    await run();
    await outputFile(path.join(project, ROLE_MARKDOWN), "# User reviewer\n");
    await configure([]);
    await rm(path.join(project, ROLE_SOURCE));

    const result = await run();

    expect(await readFile(path.join(project, ROLE_MARKDOWN), "utf-8")).toBe(
      "# User reviewer\n",
    );
    expect(await pathExists(path.join(project, ROLE_TOML))).toBe(true);
    expect(
      await readFile(path.join(project, ".codex/config.toml"), "utf-8"),
    ).toContain("[agents.reviewer]");
    expect(await pathExists(path.join(project, RECEIPT))).toBe(false);
    expect(
      (await readManifest(project))?.provider_state_owners,
    ).toBeUndefined();
    expect(result.warnings).toEqual([
      expect.stringContaining("ownership was relinquished"),
    ]);
  });

  it("previews zero-tool withdrawal without mutating private state or marker", async () => {
    await configure(["codex"]);
    await writeRole();
    await run();
    await configure([]);
    await rm(path.join(project, ROLE_SOURCE));
    const tracked = [
      ROLE_MARKDOWN,
      ROLE_TOML,
      RECEIPT,
      ".codex/config.toml",
      ".agents/.sync-manifest.json",
    ].map((relativePath) => path.join(project, relativePath));
    const before = await Promise.all(
      tracked.map((filePath) => readFile(filePath, "utf-8")),
    );

    await sync({ cwd: project, dryRun: true, json: true });

    await expect(
      Promise.all(tracked.map((filePath) => readFile(filePath, "utf-8"))),
    ).resolves.toEqual(before);
  });

  it("clean removes the private receipt marker with an unchanged role group", async () => {
    await configure(["codex"]);
    await writeRole();
    await run();

    await cleanCommand({ cwd: project });

    expect(await pathExists(path.join(project, RECEIPT))).toBe(false);
    expect(await pathExists(path.join(project, ROLE_MARKDOWN))).toBe(false);
    expect(await pathExists(path.join(project, ROLE_TOML))).toBe(false);
    expect(
      (await readManifest(project))?.provider_state_owners,
    ).toBeUndefined();
  });

  it("clean discovers unindexed role state without config or manifest evidence", async () => {
    await configure([]);
    await writeRole();
    await syncAgents([getToolProvider("codex")], project);
    expect(await readManifest(project)).toBeUndefined();

    const [result] = await cleanCommand({ cwd: project });

    expect(result.tool).toBe("codex");
    expect(await pathExists(path.join(project, RECEIPT))).toBe(false);
    expect(await pathExists(path.join(project, ROLE_MARKDOWN))).toBe(false);
    expect(await pathExists(path.join(project, ROLE_TOML))).toBe(false);
  });

  it("fails closed when discovery finds a malformed private receipt", async () => {
    await configure([]);
    await outputFile(path.join(project, RECEIPT), "not valid json\n");

    await expect(cleanCommand({ cwd: project })).rejects.toThrow(
      "Cannot validate Codex ownership receipt",
    );

    expect(await readFile(path.join(project, RECEIPT), "utf-8")).toBe(
      "not valid json\n",
    );
  });

  it("rejects a receipt missing a current required field", async () => {
    await configure([]);
    const incomplete = JSON.stringify({
      version: 1,
      roles: {},
      config: {},
    });
    await outputFile(path.join(project, RECEIPT), `${incomplete}\n`);

    await expect(cleanCommand({ cwd: project })).rejects.toThrow(
      "Cannot validate Codex ownership receipt",
    );

    expect(await readFile(path.join(project, RECEIPT), "utf-8")).toBe(
      `${incomplete}\n`,
    );
  });

  it("retains home-MCP-only discovery when global cleanup is not opted in", async () => {
    const previousHome = process.env.HOME;
    const previousOptIn = process.env.AGENTSYNC_CODEX_HOME_MCP;
    const home = path.join(project, "home");
    const homeConfig = path.join(home, ".codex", "config.toml");
    process.env.HOME = home;
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    try {
      await configure(
        ["codex"],
        '\n[mcp.tracker]\ncommand = "node"\nargs = ["tracker.js"]\n',
      );
      await run();
      const homeBefore = await readFile(homeConfig, "utf-8");
      delete process.env.AGENTSYNC_CODEX_HOME_MCP;
      await configure([]);

      await run();

      expect(await readFile(homeConfig, "utf-8")).toBe(homeBefore);
      expect(await pathExists(path.join(project, RECEIPT))).toBe(true);
      expect((await readManifest(project))?.provider_state_owners).toEqual([
        "codex",
      ]);

      await cleanCommand({ cwd: project });
      expect(await readFile(homeConfig, "utf-8")).toBe(homeBefore);
      expect(await pathExists(path.join(project, RECEIPT))).toBe(true);
      expect((await readManifest(project))?.provider_state_owners).toEqual([
        "codex",
      ]);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousOptIn === undefined) {
        delete process.env.AGENTSYNC_CODEX_HOME_MCP;
      } else {
        process.env.AGENTSYNC_CODEX_HOME_MCP = previousOptIn;
      }
    }
  });
});
