import { lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import {
  pruneMissingManifestEntries,
  readManifest,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import {
  previewManagedMCP,
  reconcileMcpOwnership,
  syncManagedMCP,
} from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  ensureDir,
  outputFile,
  pathExists,
  readJsonValidated,
} from "../../../src/utils/fs.js";

const releaseProviders = [
  getToolProvider("claude"),
  getToolProvider("cursor"),
  getToolProvider("opencode"),
  getToolProvider("codex"),
];

const trackerMcp: Record<string, MCP> = {
  tracker: { command: "node", args: ["tracker.js"] },
};

const updatedTrackerMcp: Record<string, MCP> = {
  tracker: { command: "node", args: ["updated.js"] },
};

const CodexOwnershipReceiptSchema = z
  .object({
    version: z.literal(1),
    home_mcp: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  })
  .loose();

function parseTomlRecord(content: string): Record<string, unknown> {
  return ToolSettingsSchema.parse(parseToml(content));
}

describe("managed MCP ownership", () => {
  let projectDir: string;
  let homeDir: string;
  let originalHome: string | undefined;
  let originalOptIn: string | undefined;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-owner-"));
    homeDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-home-"));
    originalHome = process.env.HOME;
    originalOptIn = process.env.AGENTSYNC_CODEX_HOME_MCP;
    process.env.HOME = homeDir;
    delete process.env.AGENTSYNC_CODEX_HOME_MCP;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalOptIn === undefined) {
      delete process.env.AGENTSYNC_CODEX_HOME_MCP;
    } else {
      process.env.AGENTSYNC_CODEX_HOME_MCP = originalOptIn;
    }
    await Promise.all([
      rm(projectDir, { recursive: true, force: true }),
      rm(homeDir, { recursive: true, force: true }),
    ]);
  });

  async function seedSharedSiblings(): Promise<void> {
    await outputFile(
      path.join(projectDir, "opencode.json"),
      '{"model":"anthropic/claude"}\n',
    );
    await outputFile(
      path.join(projectDir, ".codex", "config.toml"),
      'model = "gpt-5"\n',
    );
  }

  function projectMcpPath(tool: string, root: string): string {
    const relative = getToolProvider(tool).paths.mcpConfigPath;
    if (!relative) throw new Error(`${tool} has no project MCP path`);
    return path.join(root, relative);
  }

  async function writeDifferentMcpState(
    tool: string,
    root: string,
  ): Promise<void> {
    const configPath = projectMcpPath(tool, root);
    const content =
      tool === "claude" || tool === "cursor"
        ? '{"mcpServers":{"manual":{"command":"manual"}}}\n'
        : tool === "opencode"
          ? '{"mcp":{"manual":{"type":"local","command":["manual"]}}}\n'
          : '[mcp_servers.manual]\ncommand = "manual"\n';
    await outputFile(configPath, content);
  }

  it.each([
    "claude",
    "cursor",
    "opencode",
    "codex",
  ])("guards every configured %s MCP write with exact prior ownership", async (tool) => {
    const provider = getToolProvider(tool);
    const roots = Object.fromEntries(
      await Promise.all(
        ["absent", "unowned-identical", "unowned-different", "owned"].map(
          async (name) => {
            const root = path.join(projectDir, `${tool}-${name}`);
            await ensureDir(root);
            return [name, root] as const;
          },
        ),
      ),
    );

    const absent = await syncManagedMCP([provider], trackerMcp, roots.absent);
    expect(absent.owners[tool]).toBeDefined();

    await outputFile(
      projectMcpPath(tool, roots["unowned-identical"]),
      await readFile(projectMcpPath(tool, roots.absent), "utf-8"),
    );
    await expect(
      syncManagedMCP([provider], trackerMcp, roots["unowned-identical"]),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: {
        configPath: projectMcpPath(tool, roots["unowned-identical"]),
      },
    });

    await writeDifferentMcpState(tool, roots["unowned-different"]);
    await expect(
      syncManagedMCP([provider], trackerMcp, roots["unowned-different"]),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: {
        configPath: projectMcpPath(tool, roots["unowned-different"]),
      },
    });

    const firstOwned = await syncManagedMCP(
      [provider],
      trackerMcp,
      roots.owned,
    );
    const updated = await syncManagedMCP(
      [provider],
      updatedTrackerMcp,
      roots.owned,
      { previousOwners: firstOwned.owners },
    );
    expect(updated.owners[tool]).toBeDefined();

    await writeDifferentMcpState(tool, roots.owned);
    const modifiedBefore = await readFile(
      projectMcpPath(tool, roots.owned),
      "utf-8",
    );
    await expect(
      syncManagedMCP([provider], trackerMcp, roots.owned, {
        previousOwners: updated.owners,
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath: projectMcpPath(tool, roots.owned) },
    });
    expect(await readFile(projectMcpPath(tool, roots.owned), "utf-8")).toBe(
      modifiedBefore,
    );
  });

  it("rejects one occupied MCP target before writing any other provider", async () => {
    const cursorPath = projectMcpPath("cursor", projectDir);
    await writeDifferentMcpState("cursor", projectDir);
    const cursorBefore = await readFile(cursorPath, "utf-8");

    await expect(
      syncManagedMCP(
        [getToolProvider("claude"), getToolProvider("cursor")],
        trackerMcp,
        projectDir,
      ),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });

    expect(await pathExists(path.join(projectDir, ".mcp.json"))).toBe(false);
    expect(await readFile(cursorPath, "utf-8")).toBe(cursorBefore);
  });

  it("never touches hand-authored MCP state on a first empty sync", async () => {
    const files = new Map([
      [path.join(projectDir, ".mcp.json"), '{"mcpServers":{"mine":{}}}\n'],
      [
        path.join(projectDir, ".cursor", "mcp.json"),
        '{"mcpServers":{"mine":{}}}\n',
      ],
      [
        path.join(projectDir, "opencode.json"),
        '{"model":"mine","mcp":{"mine":{}}}\n',
      ],
      [
        path.join(projectDir, ".codex", "config.toml"),
        '[mcp_servers.mine]\ncommand = "mine"\n',
      ],
    ]);
    await Promise.all(
      [...files].map(([filePath, content]) => outputFile(filePath, content)),
    );

    const result = await syncManagedMCP(releaseProviders, {}, projectDir);

    expect(result.owners).toEqual({});
    expect(result.warnings).toEqual([]);
    expect(result.relinquishedTools).toEqual([]);
    for (const [filePath, content] of files) {
      expect(await readFile(filePath, "utf-8")).toBe(content);
    }
  });

  it("withdraws only exact prior output and preserves shared siblings", async () => {
    await seedSharedSiblings();
    const written = await syncManagedMCP(
      releaseProviders,
      trackerMcp,
      projectDir,
    );

    expect(Object.keys(written.owners).sort()).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
    ]);

    const withdrawn = await syncManagedMCP(releaseProviders, {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(withdrawn.warnings).toEqual([]);
    expect(withdrawn.relinquishedTools.sort()).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
    ]);
    expect(await pathExists(path.join(projectDir, ".mcp.json"))).toBe(false);
    expect(await pathExists(path.join(projectDir, ".cursor", "mcp.json"))).toBe(
      false,
    );

    const openCode = await readJsonValidated(
      path.join(projectDir, "opencode.json"),
      ToolSettingsSchema,
    );
    expect(openCode).toEqual({ model: "anthropic/claude" });
    const codex = parseTomlRecord(
      await readFile(path.join(projectDir, ".codex", "config.toml"), "utf-8"),
    );
    expect(codex).toEqual({ model: "gpt-5" });
    expect(withdrawn.modifiedFiles.sort()).toEqual(
      [
        path.join(projectDir, ".codex", "config.toml"),
        path.join(projectDir, "opencode.json"),
      ].sort(),
    );
  });

  it("preserves modified whole files and owned keys with warnings", async () => {
    await seedSharedSiblings();
    const written = await syncManagedMCP(
      releaseProviders,
      trackerMcp,
      projectDir,
    );
    const claudePath = path.join(projectDir, ".mcp.json");
    const cursorPath = path.join(projectDir, ".cursor", "mcp.json");
    const openCodePath = path.join(projectDir, "opencode.json");
    const codexPath = path.join(projectDir, ".codex", "config.toml");
    await outputFile(claudePath, '{"mcpServers":{"manual":{}}}\n');
    await outputFile(cursorPath, '{"mcpServers":{"manual":{}}}\n');
    await outputFile(
      openCodePath,
      '{"model":"anthropic/claude","mcp":{"manual":{}}}\n',
    );
    await outputFile(
      codexPath,
      'model = "gpt-5"\n\n[mcp_servers.manual]\ncommand = "manual"\n',
    );
    const expected = await Promise.all(
      [claudePath, cursorPath, openCodePath, codexPath].map((filePath) =>
        readFile(filePath, "utf-8"),
      ),
    );

    const withdrawn = await syncManagedMCP(releaseProviders, {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(withdrawn.warnings).toHaveLength(4);
    expect(
      withdrawn.warnings.every((warning) => warning.includes("preserved")),
    ).toBe(true);
    expect(withdrawn.removedFiles).toEqual([]);
    expect(withdrawn.modifiedFiles).toEqual([]);
    for (const [index, filePath] of [
      claudePath,
      cursorPath,
      openCodePath,
      codexPath,
    ].entries()) {
      expect(await readFile(filePath, "utf-8")).toBe(expected[index]);
    }
  });

  it("uses semantic owned-key hashes across formatting changes", async () => {
    await seedSharedSiblings();
    const providers = [getToolProvider("opencode"), getToolProvider("codex")];
    const written = await syncManagedMCP(providers, trackerMcp, projectDir);
    const openCodePath = path.join(projectDir, "opencode.json");
    const openCode = await readJsonValidated(openCodePath, ToolSettingsSchema);
    await outputFile(openCodePath, `${JSON.stringify(openCode)}\n`);
    const codexPath = path.join(projectDir, ".codex", "config.toml");
    const codex = parseTomlRecord(await readFile(codexPath, "utf-8"));
    await outputFile(codexPath, `\n${stringifyToml(codex)}\n`);

    const withdrawn = await syncManagedMCP(providers, {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(withdrawn.warnings).toEqual([]);
    expect(await readJsonValidated(openCodePath, ToolSettingsSchema)).toEqual({
      model: "anthropic/claude",
    });
    expect(parseTomlRecord(await readFile(codexPath, "utf-8"))).toEqual({
      model: "gpt-5",
    });
  });

  it("preserves unreadable prior state and relinquishes only on real sync", async () => {
    const providers = [getToolProvider("claude"), getToolProvider("opencode")];
    const written = await syncManagedMCP(providers, trackerMcp, projectDir);
    const claudePath = path.join(projectDir, ".mcp.json");
    const openCodePath = path.join(projectDir, "opencode.json");
    await rm(claudePath);
    await ensureDir(claudePath);
    const malformed = "{not json";
    await outputFile(openCodePath, malformed);

    const preview = await previewManagedMCP(providers, {}, projectDir, {
      previousOwners: written.owners,
    });
    expect(preview.warnings).toHaveLength(2);
    expect(preview.relinquishedTools).toEqual([]);
    expect(await readFile(openCodePath, "utf-8")).toBe(malformed);

    const actual = await syncManagedMCP(providers, {}, projectDir, {
      previousOwners: written.owners,
    });
    expect(actual.warnings).toHaveLength(2);
    expect(actual.relinquishedTools.sort()).toEqual(["claude", "opencode"]);
    expect(await readFile(openCodePath, "utf-8")).toBe(malformed);
    expect(await lstatKind(claudePath)).toBe("directory");
  });

  it("preserves unselected receipts during filtered sync and withdraws them on full sync", async () => {
    const written = await syncManagedMCP(
      releaseProviders,
      trackerMcp,
      projectDir,
    );
    const cursorPath = path.join(projectDir, ".cursor", "mcp.json");
    const cursorBefore = await readFile(cursorPath, "utf-8");

    const filtered = await syncManagedMCP(
      [getToolProvider("claude")],
      trackerMcp,
      projectDir,
      { previousOwners: written.owners, filtered: true },
    );
    expect(Object.keys(filtered.owners)).toEqual(["claude"]);
    expect(await readFile(cursorPath, "utf-8")).toBe(cursorBefore);

    const full = await syncManagedMCP(
      [getToolProvider("claude")],
      trackerMcp,
      projectDir,
      { previousOwners: written.owners },
    );
    expect(full.relinquishedTools.sort()).toEqual([
      "codex",
      "cursor",
      "opencode",
    ]);
    expect(await pathExists(cursorPath)).toBe(false);
  });

  it("previews exact removal and modified preservation without side effects", async () => {
    const providers = [getToolProvider("claude"), getToolProvider("cursor")];
    const written = await syncManagedMCP(providers, trackerMcp, projectDir);
    const claudePath = path.join(projectDir, ".mcp.json");
    const cursorPath = path.join(projectDir, ".cursor", "mcp.json");
    const cursorBefore = await readFile(cursorPath, "utf-8");
    const modifiedClaude = '{"mcpServers":{"manual":{}}}\n';
    await outputFile(claudePath, modifiedClaude);

    const preview = await previewManagedMCP(providers, {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(preview.removedFiles).toEqual([cursorPath]);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.relinquishedTools).toEqual([]);
    expect(await readFile(claudePath, "utf-8")).toBe(modifiedClaude);
    expect(await readFile(cursorPath, "utf-8")).toBe(cursorBefore);
  });

  it("updates and withdraws only receipt-owned opt-in Codex home servers", async () => {
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    const provider = getToolProvider("codex");
    const homeConfigPath = path.join(homeDir, ".codex", "config.toml");
    const receiptPath = path.join(
      projectDir,
      ".codex",
      ".agentsync-ownership.json",
    );
    await outputFile(
      homeConfigPath,
      'model = "keep"\n\n[mcp_servers.manual]\ncommand = "manual"\n',
    );

    const first = await syncManagedMCP([provider], trackerMcp, projectDir);
    const firstReceipt = await readJsonValidated(
      receiptPath,
      CodexOwnershipReceiptSchema,
    );
    expect(Object.keys(firstReceipt.home_mcp)).toEqual(["tracker"]);

    const updatedMcp: Record<string, MCP> = {
      tracker: { command: "node", args: ["updated.js"] },
    };
    const updated = await syncManagedMCP([provider], updatedMcp, projectDir, {
      previousOwners: first.owners,
    });
    const updatedHome = parseTomlRecord(
      await readFile(homeConfigPath, "utf-8"),
    );
    const updatedServers = z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .parse(updatedHome.mcp_servers);
    expect(updatedServers.manual).toBeDefined();
    expect(updatedServers.tracker?.args).toEqual(["updated.js"]);

    const withdrawn = await syncManagedMCP([provider], {}, projectDir, {
      previousOwners: updated.owners,
    });
    expect(withdrawn.warnings).toEqual([]);
    const finalHome = parseTomlRecord(await readFile(homeConfigPath, "utf-8"));
    expect(finalHome).toEqual({
      model: "keep",
      mcp_servers: { manual: { command: "manual" } },
    });
    expect(await pathExists(receiptPath)).toBe(false);
  });

  it("preserves modified opt-in Codex home servers with a warning", async () => {
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    const provider = getToolProvider("codex");
    const homeConfigPath = path.join(homeDir, ".codex", "config.toml");
    const written = await syncManagedMCP([provider], trackerMcp, projectDir);
    const modified =
      '[mcp_servers.tracker]\ncommand = "manual"\nargs = ["mine.js"]\n';
    await outputFile(homeConfigPath, modified);

    const withdrawn = await syncManagedMCP([provider], {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(withdrawn.warnings).toEqual([
      expect.stringContaining('home MCP server "tracker" preserved'),
    ]);
    expect(await readFile(homeConfigPath, "utf-8")).toBe(modified);
    expect(
      await pathExists(
        path.join(projectDir, ".codex", ".agentsync-ownership.json"),
      ),
    ).toBe(false);
  });

  it("previews opt-in Codex home withdrawal without changing home or receipt", async () => {
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    const provider = getToolProvider("codex");
    const homeConfigPath = path.join(homeDir, ".codex", "config.toml");
    const receiptPath = path.join(
      projectDir,
      ".codex",
      ".agentsync-ownership.json",
    );
    const written = await syncManagedMCP([provider], trackerMcp, projectDir);
    const before = await Promise.all(
      [homeConfigPath, receiptPath].map((filePath) =>
        readFile(filePath, "utf-8"),
      ),
    );

    const preview = await previewManagedMCP([provider], {}, projectDir, {
      previousOwners: written.owners,
    });

    expect(preview.removedFiles).toContain(homeConfigPath);
    expect(
      await Promise.all(
        [homeConfigPath, receiptPath].map((filePath) =>
          readFile(filePath, "utf-8"),
        ),
      ),
    ).toEqual(before);
  });

  it("never reads or writes Codex home MCP without the exact opt-in", async () => {
    const provider = getToolProvider("codex");
    const homeConfigPath = path.join(homeDir, ".codex", "config.toml");
    const malformed = "[mcp_servers.tracker\n";
    await outputFile(homeConfigPath, malformed);

    await expect(
      syncManagedMCP([provider], trackerMcp, projectDir),
    ).resolves.toMatchObject({ warnings: [] });

    expect(await readFile(homeConfigPath, "utf-8")).toBe(malformed);
    expect(
      await pathExists(
        path.join(projectDir, ".codex", ".agentsync-ownership.json"),
      ),
    ).toBe(false);
  });

  it("fails malformed opt-in Codex home preflight before project writes", async () => {
    process.env.AGENTSYNC_CODEX_HOME_MCP = "1";
    const homeConfigPath = path.join(homeDir, ".codex", "config.toml");
    await outputFile(homeConfigPath, "[mcp_servers.tracker\n");

    await expect(
      syncManagedMCP([getToolProvider("codex")], trackerMcp, projectDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath: homeConfigPath },
    });
    expect(
      await pathExists(path.join(projectDir, ".codex", "config.toml")),
    ).toBe(false);
  });

  it("fails configured preflight on malformed shared config or a directory target", async () => {
    const malformedPath = path.join(projectDir, "opencode.json");
    const claudePath = path.join(projectDir, ".mcp.json");
    await outputFile(malformedPath, "{not json");
    await ensureDir(claudePath);

    await expect(
      previewManagedMCP([getToolProvider("opencode")], trackerMcp, projectDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath: malformedPath },
    });
    await expect(
      previewManagedMCP([getToolProvider("claude")], trackerMcp, projectDir),
    ).rejects.toMatchObject({
      code: "CONFIG_ERROR",
      context: { configPath: claudePath },
    });
  });

  it("publishes MCP receipts atomically with filtered/full manifest semantics", async () => {
    const written = await syncManagedMCP(
      releaseProviders,
      trackerMcp,
      projectDir,
    );
    await writeOwnedManifest(projectDir, new Map(), {
      preserveUnselected: false,
      replaceTools: releaseProviders.map((provider) => provider.name),
      mcpOwners: written.owners,
    });
    expect((await readManifest(projectDir))?.mcp_owners).toEqual(
      written.owners,
    );

    const filtered = await syncManagedMCP(
      [getToolProvider("claude")],
      trackerMcp,
      projectDir,
      { previousOwners: written.owners, filtered: true },
    );
    await writeOwnedManifest(projectDir, new Map(), {
      preserveUnselected: true,
      replaceTools: ["claude"],
      mcpOwners: filtered.owners,
    });
    const afterFiltered = await readManifest(projectDir);
    expect(afterFiltered?.mcp_owners?.cursor).toEqual(written.owners.cursor);
    expect(afterFiltered?.mcp_owners?.opencode).toEqual(
      written.owners.opencode,
    );

    await writeOwnedManifest(projectDir, new Map(), {
      preserveUnselected: false,
      replaceTools: releaseProviders.map((provider) => provider.name),
      mcpOwners: filtered.owners,
    });
    expect(
      Object.keys((await readManifest(projectDir))?.mcp_owners ?? {}),
    ).toEqual(["claude"]);
  });

  it("removes relinquished MCP receipts without disturbing file ownership", async () => {
    const written = await syncManagedMCP(
      [getToolProvider("claude"), getToolProvider("cursor")],
      trackerMcp,
      projectDir,
    );
    const ownedCommand = path.join(
      projectDir,
      ".cursor",
      "commands",
      "review.md",
    );
    await outputFile(ownedCommand, "# Review");
    await writeOwnedManifest(
      projectDir,
      new Map([["cursor", [ownedCommand]]]),
      {
        preserveUnselected: false,
        replaceTools: ["claude", "cursor"],
        mcpOwners: written.owners,
      },
    );

    await pruneMissingManifestEntries(projectDir, [], ["claude"]);

    const manifest = await readManifest(projectDir);
    expect(manifest?.mcp_owners?.claude).toBeUndefined();
    expect(manifest?.mcp_owners?.cursor).toEqual(written.owners.cursor);
    expect(manifest?.owners?.cursor).toEqual([".cursor/commands/review.md"]);
  });

  it("ignores an incompatible receipt without touching its nominated path", async () => {
    const manualPath = path.join(projectDir, ".mcp.json");
    const manual = '{"mcpServers":{"mine":{}}}\n';
    await outputFile(manualPath, manual);

    const result = await reconcileMcpOwnership(
      getToolProvider("claude"),
      {
        kind: "whole-file",
        path: ".cursor/mcp.json",
        hash: `sha256:${"a".repeat(64)}`,
      },
      projectDir,
      false,
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.relinquished).toBe(true);
    expect(await readFile(manualPath, "utf-8")).toBe(manual);
  });

  it.runIf(process.platform !== "win32")(
    "preserves an ownership path redirected outside the project",
    async () => {
      const provider = getToolProvider("claude");
      const written = await syncManagedMCP([provider], trackerMcp, projectDir);
      const mcpPath = path.join(projectDir, ".mcp.json");
      const externalDir = await mkdtemp(
        path.join(tmpdir(), "agentsync-mcp-external-"),
      );
      const externalPath = path.join(externalDir, "mcp.json");
      const external = await readFile(mcpPath, "utf-8");
      try {
        await outputFile(externalPath, external);
        await rm(mcpPath);
        await symlink(externalPath, mcpPath);

        const result = await syncManagedMCP([provider], {}, projectDir, {
          previousOwners: written.owners,
        });

        expect(result.warnings).toHaveLength(1);
        expect(result.relinquishedTools).toEqual(["claude"]);
        expect(await readFile(externalPath, "utf-8")).toBe(external);
      } finally {
        await rm(externalDir, { recursive: true, force: true });
      }
    },
  );
});

async function lstatKind(
  filePath: string,
): Promise<"directory" | "file" | "other"> {
  const stats = await lstat(filePath);
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}
