/**
 * Consumer-path lifecycle coverage for the four release providers.
 *
 * This suite executes only the built AgentSync CLI. Provider CLIs are validated
 * separately; none is launched from this test.
 */

import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { SyncManifestSchema } from "../../src/sync/manifest.js";
import {
  CleanDataSchema,
  CliResultSchema,
  SyncDataSchema,
} from "../../src/types/output.js";
import {
  parseJsonValidated,
  pathExists,
  readJsonValidated,
} from "../../src/utils/fs.js";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const CLI_PATH = path.join(PACKAGE_ROOT, "dist", "cli.js");
const CLI_TIMEOUT_MS = 15_000;
const MANIFEST_PATH = ".agents/.sync-manifest.json";

const ReleaseToolSchema = z.enum(["claude", "codex", "opencode", "cursor"]);
type ReleaseTool = z.infer<typeof ReleaseToolSchema>;

const SyncCliResultSchema = CliResultSchema.extend({
  command: z.literal("sync"),
  data: SyncDataSchema,
});
const CleanCliResultSchema = CliResultSchema.extend({
  command: z.literal("clean"),
  data: CleanDataSchema,
});

interface LifecycleTarget {
  tool: ReleaseTool;
  generatedAgent: string;
  generatedAgentCompanion?: string;
  configPath: string;
  initialConfig?: string;
  retainedConfigFragment?: string;
}

type SnapshotEntry =
  | { kind: "directory"; mode: number }
  | { kind: "file"; content: string; mode: number }
  | { kind: "symlink"; target: string; mode: number }
  | { kind: "other"; mode: number };

type TreeSnapshot = Record<string, SnapshotEntry>;

const TARGETS: readonly LifecycleTarget[] = [
  {
    tool: "claude",
    generatedAgent: ".claude/agents/reviewer.md",
    configPath: ".mcp.json",
  },
  {
    tool: "codex",
    generatedAgent: ".codex/agents/reviewer.md",
    generatedAgentCompanion: ".codex/agents/reviewer.toml",
    configPath: ".codex/config.toml",
    initialConfig: 'model = "gpt-5.6-codex"\n',
    retainedConfigFragment: 'model = "gpt-5.6-codex"',
  },
  {
    tool: "opencode",
    generatedAgent: ".opencode/agents/reviewer.md",
    configPath: "opencode.json",
    initialConfig: '{\n  // user-owned setting\n  "theme": "system",\n}\n',
    retainedConfigFragment: '"theme": "system"',
  },
  {
    tool: "cursor",
    generatedAgent: ".cursor/agents/reviewer.md",
    configPath: ".cursor/mcp.json",
  },
];

const AGENT = `---
description: Reviews lifecycle changes
---

# Lifecycle reviewer
`;

function configForTools(tools: readonly ReleaseTool[]): string {
  return `tools = [${tools.map((tool) => `"${tool}"`).join(", ")}]

[mcp.release]
command = "node"
args = ["server.js"]
`;
}

function configFor(tool: ReleaseTool): string {
  return configForTools([tool]);
}

function runBuiltCommand<T>(
  projectRoot: string,
  homeRoot: string,
  args: string[],
  schema: z.ZodType<T>,
): T {
  const child = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
      XDG_CONFIG_HOME: path.join(homeRoot, ".config"),
      NO_COLOR: "1",
      AGENTSYNC_CODEX_HOME_MCP: undefined,
      AGENTSYNC_PROFILE: undefined,
    },
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 5 * 1024 * 1024,
  });

  if (child.error) {
    throw new Error(
      `agentsync ${args[0]} failed to start: ${child.error.message}`,
    );
  }
  if (child.status !== 0) {
    throw new Error(
      `agentsync ${args[0]} failed (exit ${child.status ?? "unknown"}): ` +
        `stdout=${child.stdout} stderr=${child.stderr}`,
    );
  }
  return parseJsonValidated(child.stdout, schema);
}

async function seedProject(
  projectRoot: string,
  target: LifecycleTarget,
  additionalAgents: readonly string[] = [],
): Promise<string> {
  const canonicalAgent = path.join(projectRoot, ".agents/agents/reviewer.md");
  const userOwnedAgent = path.join(
    projectRoot,
    path.dirname(target.generatedAgent),
    "user-owned.md",
  );
  await Promise.all([
    mkdir(path.dirname(canonicalAgent), { recursive: true }),
    mkdir(path.dirname(userOwnedAgent), { recursive: true }),
    mkdir(path.dirname(path.join(projectRoot, target.configPath)), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      path.join(projectRoot, ".agents/agentsync.toml"),
      configFor(target.tool),
    ),
    writeFile(canonicalAgent, AGENT),
    ...additionalAgents.map((name) =>
      writeFile(
        path.join(projectRoot, ".agents/agents", `${name}.md`),
        AGENT.replace("Reviews lifecycle changes", `Reviews ${name} changes`),
      ),
    ),
    writeFile(
      path.join(projectRoot, "AGENTS.md"),
      "# Lifecycle instructions\n",
    ),
    writeFile(path.join(projectRoot, "server.js"), "process.exit(0);\n"),
    writeFile(userOwnedAgent, "# User-owned agent\n"),
    ...(target.initialConfig
      ? [
          writeFile(
            path.join(projectRoot, target.configPath),
            target.initialConfig,
          ),
        ]
      : []),
  ]);
  return userOwnedAgent;
}

async function snapshotLeaf(
  absolutePath: string,
  relativePath: string,
  isFile: boolean,
  isSymlink: boolean,
  normalizeManifestTimestamp: boolean,
): Promise<SnapshotEntry> {
  const mode = (await lstat(absolutePath)).mode & 0o7777;
  if (isSymlink) {
    return { kind: "symlink", target: await readlink(absolutePath), mode };
  }
  if (!isFile) return { kind: "other", mode };

  const content =
    normalizeManifestTimestamp && relativePath === MANIFEST_PATH
      ? JSON.stringify({
          ...(await readJsonValidated(absolutePath, SyncManifestSchema)),
          timestamp: "<volatile>",
        })
      : (await readFile(absolutePath)).toString("base64");
  return { kind: "file", content, mode };
}

async function snapshotTree(
  root: string,
  normalizeManifestTimestamp: boolean,
): Promise<TreeSnapshot> {
  const snapshot: TreeSnapshot = {
    "./": { kind: "directory", mode: (await lstat(root)).mode & 0o7777 },
  };
  async function visit(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const mode = (await lstat(absolutePath)).mode & 0o7777;
        snapshot[`${relativePath}/`] = { kind: "directory", mode };
        await visit(absolutePath, relativePath);
        continue;
      }
      snapshot[relativePath] = await snapshotLeaf(
        absolutePath,
        relativePath,
        entry.isFile(),
        entry.isSymbolicLink(),
        normalizeManifestTimestamp,
      );
    }
  }

  await visit(root, "");
  return snapshot;
}

async function snapshotSandbox(
  projectRoot: string,
  homeRoot: string,
  normalizeManifestTimestamp = false,
): Promise<{ project: TreeSnapshot; home: TreeSnapshot }> {
  const [project, home] = await Promise.all([
    snapshotTree(projectRoot, normalizeManifestTimestamp),
    snapshotTree(homeRoot, false),
  ]);
  return { project, home };
}

function generatedAgentPath(target: LifecycleTarget, name: string): string {
  return path.posix.join(
    path.posix.dirname(target.generatedAgent),
    `${name}.md`,
  );
}

function generatedCompanionPath(
  target: LifecycleTarget,
  name: string,
): string | undefined {
  return target.generatedAgentCompanion
    ? path.posix.join(
        path.posix.dirname(target.generatedAgentCompanion),
        `${name}.toml`,
      )
    : undefined;
}

async function readManifest(projectRoot: string) {
  return readJsonValidated(
    path.join(projectRoot, MANIFEST_PATH),
    SyncManifestSchema,
  );
}

function manifestAuthorityForTool(
  manifest: z.infer<typeof SyncManifestSchema>,
  tool: ReleaseTool,
) {
  const ownedPaths = manifest.owners[tool] ?? [];
  return {
    ownedPaths,
    hashes: Object.fromEntries(
      ownedPaths.map((relativePath) => [
        relativePath,
        manifest.files[relativePath],
      ]),
    ),
    mcp: manifest.mcp_owners?.[tool],
    structured: manifest.structured_owners?.[tool],
    providerState: manifest.provider_state_owners?.includes(tool) ?? false,
  };
}

async function readProjectFiles(
  projectRoot: string,
  relativePaths: readonly string[],
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      relativePaths.map(async (relativePath) => [
        relativePath,
        await readFile(path.join(projectRoot, relativePath), "utf-8"),
      ]),
    ),
  );
}

function expectRelinquishWarning(
  warnings: readonly string[] | undefined,
  target: LifecycleTarget,
  agentName: string,
): void {
  const subject =
    target.tool === "codex"
      ? `codex agent ${agentName}`
      : generatedAgentPath(target, agentName);
  expect(
    warnings?.some(
      (warning) => warning.includes("relinquish") && warning.includes(subject),
    ) ?? false,
  ).toBe(true);
}

describe("built CLI release lifecycle", () => {
  let testRoot: string;
  let projectRoot: string;
  let homeRoot: string;

  beforeAll(async () => {
    const cliStats = await stat(CLI_PATH);
    if (!cliStats.isFile()) {
      throw new Error(`Expected prebuilt CLI file at ${CLI_PATH}`);
    }
  });

  beforeEach(async () => {
    testRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "agentsync-cli-lifecycle-")),
    );
    projectRoot = path.join(testRoot, "project");
    homeRoot = path.join(testRoot, "home");
    await Promise.all([
      mkdir(projectRoot, { recursive: true }),
      mkdir(homeRoot, { recursive: true }),
    ]);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it.each(
    TARGETS,
  )("$tool is deterministic, dry-run safe, and withdraws stale agents", async (target) => {
    const userOwnedAgent = await seedProject(projectRoot, target);

    const first = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(first.status).toBe("success");
    const firstProjection = await snapshotSandbox(projectRoot, homeRoot, true);
    expect(
      Number.isNaN(Date.parse((await readManifest(projectRoot)).timestamp)),
    ).toBe(false);

    const repeated = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(repeated.status).toBe("success");
    expect(await snapshotSandbox(projectRoot, homeRoot, true)).toEqual(
      firstProjection,
    );

    const beforePreview = await snapshotSandbox(projectRoot, homeRoot);
    const preview = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--dry-run", "--json"],
      SyncCliResultSchema,
    );
    expect(preview.status).toBe("success");
    expect(preview.data).toEqual(repeated.data);
    expect(preview.warnings ?? []).toEqual(repeated.warnings ?? []);
    expect(await snapshotSandbox(projectRoot, homeRoot)).toEqual(beforePreview);

    await rm(path.join(projectRoot, ".agents/agents/reviewer.md"));
    const withdrawn = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(withdrawn.status).toBe("success");
    expect(
      await pathExists(path.join(projectRoot, target.generatedAgent)),
    ).toBe(false);
    if (target.generatedAgentCompanion) {
      expect(
        await pathExists(
          path.join(projectRoot, target.generatedAgentCompanion),
        ),
      ).toBe(false);
    }
    expect(await readFile(userOwnedAgent, "utf-8")).toBe(
      "# User-owned agent\n",
    );
  }, 20_000);

  it.each(
    TARGETS,
  )("$tool clean removes unchanged ownership and relinquishes edited outputs", async (target) => {
    const userOwnedAgent = await seedProject(projectRoot, target, ["edited"]);
    const initial = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(initial.status).toBe("success");

    const editedAgent = path.join(
      projectRoot,
      generatedAgentPath(target, "edited"),
    );
    const editedContent = "# User-edited generated agent\n";
    await writeFile(editedAgent, editedContent);

    const beforeCleanPreview = await snapshotSandbox(projectRoot, homeRoot);
    const cleanPreview = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["clean", "--dry-run", "--json"],
      CleanCliResultSchema,
    );
    expect(cleanPreview.status).toBe("success");
    expect(cleanPreview.data.dryRun).toBe(true);
    expect(await snapshotSandbox(projectRoot, homeRoot)).toEqual(
      beforeCleanPreview,
    );
    const previewResult = cleanPreview.data.results.find(
      (result) => result.tool === target.tool,
    );
    expect(previewResult?.removedFiles).toContain(
      path.join(projectRoot, target.generatedAgent),
    );
    expect(previewResult?.removedFiles).not.toContain(editedAgent);
    expectRelinquishWarning(previewResult?.warnings, target, "edited");

    const cleaned = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["clean", "--json"],
      CleanCliResultSchema,
    );
    expect(cleaned.status).toBe("success");
    expect(cleaned.data.summary).toEqual(cleanPreview.data.summary);
    const cleanedResult = cleaned.data.results.find(
      (result) => result.tool === target.tool,
    );
    expect(cleanedResult?.removedFiles).toContain(
      path.join(projectRoot, target.generatedAgent),
    );
    expect(cleanedResult?.removedFiles).not.toContain(editedAgent);
    expectRelinquishWarning(cleanedResult?.warnings, target, "edited");
    expect(
      await pathExists(path.join(projectRoot, target.generatedAgent)),
    ).toBe(false);
    expect(await readFile(editedAgent, "utf-8")).toBe(editedContent);
    if (target.generatedAgentCompanion) {
      expect(
        await pathExists(
          path.join(projectRoot, target.generatedAgentCompanion),
        ),
      ).toBe(false);
    }
    const editedCompanion = generatedCompanionPath(target, "edited");
    if (editedCompanion) {
      expect(await pathExists(path.join(projectRoot, editedCompanion))).toBe(
        true,
      );
    }
    expect(await readFile(userOwnedAgent, "utf-8")).toBe(
      "# User-owned agent\n",
    );

    const configExists = await pathExists(
      path.join(projectRoot, target.configPath),
    );
    if (target.retainedConfigFragment) {
      expect(configExists).toBe(true);
      const retainedConfig = await readFile(
        path.join(projectRoot, target.configPath),
        "utf-8",
      );
      expect(retainedConfig).toContain(target.retainedConfigFragment);
      expect(retainedConfig).not.toContain("release");
    } else {
      expect(configExists).toBe(false);
    }

    const manifest = await readManifest(projectRoot);
    expect(manifest.files).toEqual({});
    expect(manifest.owners).toEqual({});
    expect(manifest.mcp_owners ?? {}).toEqual({});
    expect(manifest.provider_state_owners ?? []).toEqual([]);
    expect(manifest.structured_owners ?? {}).toEqual({});
    if (target.tool === "codex") {
      expect(
        await pathExists(
          path.join(projectRoot, ".codex/.agentsync-ownership.json"),
        ),
      ).toBe(false);
    }
  }, 20_000);

  it("preserves unselected provider authority during built filtered sync", async () => {
    const userOwnedAgent = await seedProject(projectRoot, TARGETS[0]);
    const allTools = TARGETS.map((target) => target.tool);
    await writeFile(
      path.join(projectRoot, ".agents/agentsync.toml"),
      configForTools(allTools),
    );
    const initial = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(initial.status).toBe("success");

    const protectedPaths = [
      ".claude/agents/reviewer.md",
      ".mcp.json",
      "CLAUDE.md",
      ".codex/agents/reviewer.md",
      ".codex/agents/reviewer.toml",
      ".codex/config.toml",
      ".codex/.agentsync-ownership.json",
      ".cursor/agents/reviewer.md",
      ".cursor/mcp.json",
      ".claude/agents/user-owned.md",
    ];
    const beforeFiles = await readProjectFiles(projectRoot, protectedPaths);
    const beforeManifest = await readManifest(projectRoot);
    const unselectedTools = ["claude", "codex", "cursor"] as const;
    const beforeAuthority = Object.fromEntries(
      unselectedTools.map((tool) => [
        tool,
        manifestAuthorityForTool(beforeManifest, tool),
      ]),
    );

    await writeFile(
      path.join(projectRoot, ".agents/agents/reviewer.md"),
      AGENT.replace("# Lifecycle reviewer", "# Updated lifecycle reviewer"),
    );
    const filtered = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--tool", "opencode", "--json"],
      SyncCliResultSchema,
    );
    expect(filtered.status).toBe("success");
    expect(filtered.data.tools).toEqual(["opencode"]);
    expect(await readProjectFiles(projectRoot, protectedPaths)).toEqual(
      beforeFiles,
    );
    expect(
      await readFile(
        path.join(projectRoot, ".opencode/agents/reviewer.md"),
        "utf-8",
      ),
    ).toContain("# Updated lifecycle reviewer");
    const filteredManifest = await readManifest(projectRoot);
    for (const tool of unselectedTools) {
      expect(manifestAuthorityForTool(filteredManifest, tool)).toEqual(
        beforeAuthority[tool],
      );
    }
    const openCodeAgentPath = ".opencode/agents/reviewer.md";
    expect(filteredManifest.owners.opencode).toContain(openCodeAgentPath);
    expect(filteredManifest.files[openCodeAgentPath]).not.toBe(
      beforeManifest.files[openCodeAgentPath],
    );

    await writeFile(
      path.join(projectRoot, ".agents/agentsync.toml"),
      configFor("opencode"),
    );
    const full = runBuiltCommand(
      projectRoot,
      homeRoot,
      ["sync", "--json"],
      SyncCliResultSchema,
    );
    expect(full.status).toBe("success");
    for (const relativePath of [
      ".claude/agents/reviewer.md",
      "CLAUDE.md",
      ".codex/agents/reviewer.md",
      ".codex/agents/reviewer.toml",
      ".cursor/agents/reviewer.md",
    ]) {
      expect(
        await pathExists(path.join(projectRoot, relativePath)),
        `${relativePath} should be withdrawn`,
      ).toBe(false);
    }
    expect(
      z
        .record(z.string(), z.unknown())
        .parse(
          parseToml(
            await readFile(
              path.join(projectRoot, ".codex/config.toml"),
              "utf-8",
            ),
          ),
        ),
    ).toEqual({});
    expect(await pathExists(path.join(projectRoot, ".mcp.json"))).toBe(false);
    expect(await pathExists(path.join(projectRoot, ".cursor/mcp.json"))).toBe(
      false,
    );
    expect(
      await pathExists(
        path.join(projectRoot, ".codex/.agentsync-ownership.json"),
      ),
    ).toBe(false);
    expect(await readFile(userOwnedAgent, "utf-8")).toBe(
      "# User-owned agent\n",
    );
    expect(
      await pathExists(path.join(projectRoot, ".opencode/agents/reviewer.md")),
    ).toBe(true);
    const fullManifest = await readManifest(projectRoot);
    for (const tool of unselectedTools) {
      expect(manifestAuthorityForTool(fullManifest, tool)).toEqual({
        ownedPaths: [],
        hashes: {},
        mcp: undefined,
        structured: undefined,
        providerState: false,
      });
    }
  }, 20_000);
});
