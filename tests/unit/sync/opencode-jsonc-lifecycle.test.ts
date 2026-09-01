import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanCommand } from "../../../src/commands/clean.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import {
  getManifestPath,
  type McpOwnership,
  readManifest,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import { previewManagedMCP, syncManagedMCP } from "../../../src/sync/mcp.js";
import {
  applyStructuredLifecyclePlan,
  type StructuredReceiptsByProvider,
} from "../../../src/sync/structured-lifecycle.js";
import { planToolStructuredLifecycle } from "../../../src/sync/structured-providers.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { resolveOpenCodeConfigPath } from "../../../src/tools/opencode.js";
import type {
  CanonicalRule,
  StructuredConfigProjectionInput,
  ToolProvider,
} from "../../../src/tools/types.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";
import { parseJsoncValidated } from "../../../src/utils/jsonc.js";

const provider = getToolProvider("opencode");
const trackerMcp: Record<string, MCP> = {
  tracker: { command: "node", args: ["tracker.js"] },
};
const updatedTrackerMcp: Record<string, MCP> = {
  tracker: { command: "node", args: ["updated.js"] },
};

function rule(name: string): CanonicalRule {
  const relPath = `${name}.md`;
  return {
    name,
    relPath,
    raw: `# ${name}\n`,
    body: `# ${name}\n`,
    sourcePath: `/project/.agents/rules/${relPath}`,
  };
}

function desired(
  decision: "allow" | "ask" | "deny" = "ask",
  rules: readonly CanonicalRule[] = [rule("house-style")],
): StructuredConfigProjectionInput {
  return {
    extensions: { permissions: { default: decision } },
    rules,
  };
}

describe("OpenCode JSONC lifecycle", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-opencode-jsonc-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  function absolute(relativePath: string): string {
    return path.join(project, ...relativePath.split("/"));
  }

  async function source(relativePath: string): Promise<string> {
    return readFile(absolute(relativePath), "utf-8");
  }

  async function config(
    relativePath: string,
  ): Promise<Record<string, unknown>> {
    return parseJsoncValidated(await source(relativePath), ToolSettingsSchema);
  }

  async function projectStructured(
    input: StructuredConfigProjectionInput | undefined,
    previousReceipts: StructuredReceiptsByProvider = {},
    dryRun = false,
  ) {
    const plan = await planToolStructuredLifecycle({
      cwd: project,
      providers: [provider],
      previousReceipts,
      ...(input ? { desired: input } : {}),
      preserveUnselected: false,
    });
    return applyStructuredLifecyclePlan(plan, { dryRun });
  }

  async function publishOwnership(
    mcpOwners: Readonly<Record<string, McpOwnership>>,
    structuredOwners: StructuredReceiptsByProvider,
  ): Promise<void> {
    await outputFile(
      absolute(".agents/agentsync.toml"),
      'tools = ["opencode"]\n',
    );
    await writeOwnedManifest(project, new Map(), {
      preserveUnselected: false,
      replaceTools: ["opencode"],
      mcpOwners,
      structuredOwners,
    });
  }

  it("resolves all four native project paths in OpenCode precedence order", async () => {
    expect(await resolveOpenCodeConfigPath(project)).toBe("opencode.json");

    await outputFile(absolute("opencode.json"), "{}\n");
    expect(await resolveOpenCodeConfigPath(project)).toBe("opencode.json");

    await outputFile(absolute("opencode.jsonc"), "{}\n");
    expect(await resolveOpenCodeConfigPath(project)).toBe("opencode.jsonc");

    await outputFile(absolute(".opencode/opencode.json"), "{}\n");
    expect(await resolveOpenCodeConfigPath(project)).toBe(
      ".opencode/opencode.json",
    );

    await outputFile(absolute(".opencode/opencode.jsonc"), "{}\n");
    expect(await resolveOpenCodeConfigPath(project)).toBe(
      ".opencode/opencode.jsonc",
    );
  });

  it("accepts an exact zero-byte OpenCode config for MCP projection", async () => {
    await outputFile(absolute("opencode.json"), "");

    const result = await syncManagedMCP([provider], trackerMcp, project);

    expect(result.owners.opencode).toMatchObject({ path: "opencode.json" });
    expect((await config("opencode.json")).mcp).toBeDefined();
  });

  it("accepts an exact zero-byte OpenCode config for structured projection", async () => {
    await outputFile(absolute("opencode.json"), "");

    const result = await projectStructured(desired());

    expect(result.plan.nextReceipts.opencode).toHaveProperty("opencode.json");
    expect(await config("opencode.json")).toMatchObject({
      permission: { "*": "ask" },
      instructions: [".agents/rules/house-style.md"],
    });
  });

  it("keeps the preflighted MCP path when a higher-precedence file appears after the write", async () => {
    const format = provider.mcpFormat;
    const baseResolve = format?.resolveProjectConfigPath;
    const baseWrite = format?.writeProjectMCPAtPath;
    if (!(format && baseResolve && baseWrite)) {
      throw new Error("OpenCode requires a dynamic managed MCP writer");
    }
    const manual = `{
  // user-owned active config
  "mcp": { "manual": { "type": "local", "command": ["manual"] } },
}
`;
    let resolveCalls = 0;
    const racingProvider: ToolProvider = {
      ...provider,
      mcpFormat: {
        ...format,
        async resolveProjectConfigPath(cwd) {
          resolveCalls += 1;
          return baseResolve(cwd);
        },
        async writeProjectMCPAtPath(mcps, cwd, target) {
          const evidence = await baseWrite(mcps, cwd, target);
          await outputFile(
            path.join(cwd, ".opencode", "opencode.jsonc"),
            manual,
          );
          return evidence;
        },
      },
    };

    const written = await syncManagedMCP([racingProvider], trackerMcp, project);
    expect(resolveCalls).toBe(1);
    expect(written.owners.opencode).toMatchObject({ path: "opencode.json" });

    await syncManagedMCP([racingProvider], {}, project, {
      previousOwners: written.owners,
    });

    expect(await pathExists(absolute("opencode.json"))).toBe(false);
    expect(await source(".opencode/opencode.jsonc")).toBe(manual);
  });

  it("rejects a managed MCP value changed after the writer before granting receipt authority", async () => {
    const format = provider.mcpFormat;
    const baseWrite = format?.writeProjectMCPAtPath;
    if (!(format && baseWrite)) {
      throw new Error("OpenCode requires a dynamic managed MCP writer");
    }
    const manual = `{
  "mcp": { "manual": { "type": "local", "command": ["manual"] } },
}
`;
    const racingProvider: ToolProvider = {
      ...provider,
      mcpFormat: {
        ...format,
        async writeProjectMCPAtPath(mcps, cwd, target) {
          const evidence = await baseWrite(mcps, cwd, target);
          await outputFile(target.absolutePath, manual);
          return evidence;
        },
      },
    };

    await expect(
      syncManagedMCP([racingProvider], trackerMcp, project),
    ).rejects.toThrow(/changed after the managed write/);
    expect(await source("opencode.json")).toBe(manual);
  });

  it("rejects a managed MCP value changed between outer preflight and writer mutation", async () => {
    const format = provider.mcpFormat;
    const baseWrite = format?.writeProjectMCPAtPath;
    if (!(format && baseWrite)) {
      throw new Error("OpenCode requires a dynamic managed MCP writer");
    }
    const manual = `{
  "mcp": { "manual": { "type": "local", "command": ["manual"] } },
}
`;
    const racingProvider: ToolProvider = {
      ...provider,
      mcpFormat: {
        ...format,
        async writeProjectMCPAtPath(mcps, cwd, target) {
          await outputFile(target.absolutePath, manual);
          return baseWrite(mcps, cwd, target);
        },
      },
    };

    await expect(
      syncManagedMCP([racingProvider], trackerMcp, project),
    ).rejects.toThrow(/managed key "mcp" changed after preflight/);
    expect(await source("opencode.json")).toBe(manual);
  });

  it("rejects an MCP active-path change at the writer mutation boundary", async () => {
    const format = provider.mcpFormat;
    const baseWrite = format?.writeProjectMCPAtPath;
    if (!(format && baseWrite)) {
      throw new Error("OpenCode requires a dynamic managed MCP writer");
    }
    const manual = '{"mcp":{"manual":{"type":"local","command":["manual"]}}}\n';
    const racingProvider: ToolProvider = {
      ...provider,
      mcpFormat: {
        ...format,
        async writeProjectMCPAtPath(mcps, cwd, target) {
          await outputFile(
            path.join(cwd, ".opencode", "opencode.jsonc"),
            manual,
          );
          return baseWrite(mcps, cwd, target);
        },
      },
    };

    await expect(
      syncManagedMCP([racingProvider], trackerMcp, project),
    ).rejects.toThrow(/active config path changed after preflight/);
    expect(await pathExists(absolute("opencode.json"))).toBe(false);
    expect(await source(".opencode/opencode.jsonc")).toBe(manual);
  });

  it("targets existing root JSONC and preserves comments, trailing commas, and exact user spans for MCP", async () => {
    const initial = `{
  // user-owned OpenCode settings
  "theme": "system", // retained comment
  "model": "anthropic/claude", // exact user span
}
`;
    await outputFile(absolute("opencode.jsonc"), initial);

    const first = await syncManagedMCP([provider], trackerMcp, project);
    const written = await source("opencode.jsonc");

    expect(first.owners.opencode).toMatchObject({
      kind: "owned-keys",
      path: "opencode.jsonc",
      format: "jsonc",
    });
    expect(written).toContain("// user-owned OpenCode settings\n");
    expect(written).toContain(
      '  "model": "anthropic/claude", // exact user span\n',
    );
    expect((await config("opencode.jsonc")).mcp).toBeDefined();

    const resynced = await syncManagedMCP([provider], trackerMcp, project, {
      previousOwners: first.owners,
    });
    expect(await source("opencode.jsonc")).toBe(written);

    const preview = await previewManagedMCP([provider], {}, project, {
      previousOwners: resynced.owners,
    });
    expect(preview.modifiedFiles).toEqual([absolute("opencode.jsonc")]);
    expect(await source("opencode.jsonc")).toBe(written);

    await syncManagedMCP([provider], {}, project, {
      previousOwners: resynced.owners,
    });
    expect(await config("opencode.jsonc")).toEqual({
      theme: "system",
      model: "anthropic/claude",
    });
    expect(await source("opencode.jsonc")).toContain(
      '  "model": "anthropic/claude", // exact user span\n',
    );
    expect(await source("opencode.jsonc")).toContain("// retained comment");
  });

  it("withdraws a sole trailing-comma MCP property while retaining surrounding comments", async () => {
    const first = await syncManagedMCP([provider], trackerMcp, project);
    const mcp = (await config("opencode.json")).mcp;
    await outputFile(
      absolute("opencode.json"),
      `{
  // KEEP BEFORE MCP
  "mcp": ${JSON.stringify(mcp, null, 2)}, // KEEP INLINE
}
`,
    );

    const withdrawn = await syncManagedMCP([provider], {}, project, {
      previousOwners: first.owners,
    });

    expect(withdrawn.modifiedFiles).toEqual([absolute("opencode.json")]);
    expect(await config("opencode.json")).toEqual({});
    expect(await source("opencode.json")).toContain("// KEEP BEFORE MCP");
    expect(await source("opencode.json")).toContain("// KEEP INLINE");
  });

  it("edits permission and only the managed instructions slice, then withdraws them losslessly", async () => {
    const initial = `${[
      "{",
      "\t// keep this comment",
      '\t"instructions": [',
      '\t\t"README.md", // manual instruction',
      '\t\t"CONTRIBUTING.md",',
      "\t],",
      '\t"theme": "system",',
      "}",
    ].join("\r\n")}\r\n`;
    await outputFile(absolute("opencode.jsonc"), initial);

    const first = await projectStructured(desired());
    const written = await source("opencode.jsonc");
    const parsed = await config("opencode.jsonc");

    expect(first.plan.nextReceipts.opencode).toHaveProperty("opencode.jsonc");
    expect(written).toContain("\t// keep this comment\r\n");
    expect(written).toContain('\t\t"README.md", // manual instruction\r\n');
    expect(written).not.toMatch(/(^|[^\r])\n/);
    expect(parsed).toMatchObject({
      theme: "system",
      permission: { "*": "ask" },
      instructions: [
        "README.md",
        "CONTRIBUTING.md",
        ".agents/rules/house-style.md",
      ],
    });

    const resynced = await projectStructured(
      desired(),
      first.plan.nextReceipts,
    );
    expect(await source("opencode.jsonc")).toBe(written);

    const dryRun = await projectStructured(
      undefined,
      resynced.plan.nextReceipts,
      true,
    );
    expect(dryRun.plan.configChanged).toBe(true);
    expect(await source("opencode.jsonc")).toBe(written);

    await projectStructured(undefined, resynced.plan.nextReceipts);
    expect(await config("opencode.jsonc")).toEqual({
      instructions: ["README.md", "CONTRIBUTING.md"],
      theme: "system",
    });
    const withdrawn = await source("opencode.jsonc");
    expect(withdrawn).toContain("// manual instruction");
    expect(withdrawn).toContain("// keep this comment");
  });

  it("rejects a structured active-path change immediately before mutation", async () => {
    const plan = await planToolStructuredLifecycle({
      cwd: project,
      providers: [provider],
      desired: desired(),
      preserveUnselected: false,
    });
    const manual = `{
  // newly active user config
  "permission": { "*": "deny" },
}
`;
    await outputFile(absolute(".opencode/opencode.jsonc"), manual);

    await expect(applyStructuredLifecyclePlan(plan)).rejects.toThrow(
      /target for "opencode" changed after preflight/,
    );

    expect(await pathExists(absolute("opencode.json"))).toBe(false);
    expect(await source(".opencode/opencode.jsonc")).toBe(manual);
  });

  it("targets the highest existing file and preserves every lower-precedence file byte-for-byte", async () => {
    const rootJson = '{\n  "lower": "root-json"\n}\n';
    const rootJsonc = '{\n  // lower JSONC\n  "lower": "root-jsonc",\n}\n';
    const directoryJson = '{\n  "lower": "directory-json"\n}\n';
    const active = `{
  // active settings
  "theme": "system",
  "instructions": ["README.md",],
}
`;
    await outputFile(absolute("opencode.json"), rootJson);
    await outputFile(absolute("opencode.jsonc"), rootJsonc);
    await outputFile(absolute(".opencode/opencode.json"), directoryJson);
    await outputFile(absolute(".opencode/opencode.jsonc"), active);

    const mcp = await syncManagedMCP([provider], trackerMcp, project);
    const structured = await projectStructured(desired());

    expect(mcp.owners.opencode).toMatchObject({
      path: ".opencode/opencode.jsonc",
    });
    expect(structured.plan.nextReceipts.opencode).toHaveProperty(
      ".opencode/opencode.jsonc",
    );
    expect(await source("opencode.json")).toBe(rootJson);
    expect(await source("opencode.jsonc")).toBe(rootJsonc);
    expect(await source(".opencode/opencode.json")).toBe(directoryJson);
    expect(await source(".opencode/opencode.jsonc")).toContain(
      "// active settings",
    );
  });

  it("moves unchanged receipt-owned state to a newly higher-precedence path without orphaning old keys", async () => {
    const oldSource = `{
  "theme": "old-user-setting",
}
`;
    await outputFile(absolute("opencode.json"), oldSource);
    const firstMcp = await syncManagedMCP([provider], trackerMcp, project);
    const firstStructured = await projectStructured(desired());

    const newSource = `{
  // new active file
  "theme": "new-user-setting",
  "instructions": ["README.md",],
}
`;
    await outputFile(absolute(".opencode/opencode.jsonc"), newSource);

    const movedMcp = await syncManagedMCP(
      [provider],
      updatedTrackerMcp,
      project,
      { previousOwners: firstMcp.owners },
    );
    const movedStructured = await projectStructured(
      desired("allow", [rule("new-rule")]),
      firstStructured.plan.nextReceipts,
    );

    expect(await config("opencode.json")).toEqual({
      theme: "old-user-setting",
    });
    expect(await source("opencode.json")).toContain(
      '  "theme": "old-user-setting",\n',
    );
    expect(await config(".opencode/opencode.jsonc")).toMatchObject({
      theme: "new-user-setting",
      permission: { "*": "allow" },
      instructions: ["README.md", ".agents/rules/new-rule.md"],
    });
    expect(movedMcp.owners.opencode).toMatchObject({
      path: ".opencode/opencode.jsonc",
    });
    expect(movedStructured.plan.nextReceipts.opencode).toEqual({
      ".opencode/opencode.jsonc": expect.any(Object),
    });
  });

  it("rejects an occupied higher-precedence switch target before withdrawing the old receipt path", async () => {
    await outputFile(
      absolute("opencode.json"),
      '{\n  "theme": "old-user-setting",\n}\n',
    );
    const firstMcp = await syncManagedMCP([provider], trackerMcp, project);
    const firstStructured = await projectStructured(desired());
    const oldBefore = await source("opencode.json");
    const occupied = `{
  // user-owned higher-precedence state
  "mcp": { "mine": { "type": "local", "command": ["mine"] } },
  "permission": { "*": "deny" },
}
`;
    await outputFile(absolute(".opencode/opencode.jsonc"), occupied);

    await expect(
      syncManagedMCP([provider], updatedTrackerMcp, project, {
        previousOwners: firstMcp.owners,
      }),
    ).rejects.toThrow(/no compatible prior AgentSync ownership receipt/);
    await expect(
      projectStructured(desired("allow"), firstStructured.plan.nextReceipts),
    ).rejects.toThrow(/occupied key has no prior AgentSync ownership receipt/);

    expect(await source("opencode.json")).toBe(oldBefore);
    expect(await source(".opencode/opencode.jsonc")).toBe(occupied);
  });

  it("fails closed when current-format receipt-owned managed keys were modified", async () => {
    await outputFile(
      absolute("opencode.jsonc"),
      '{\n  "theme": "system",\n}\n',
    );
    const firstMcp = await syncManagedMCP([provider], trackerMcp, project);
    const firstStructured = await projectStructured(desired());
    const edited = await config("opencode.jsonc");
    edited.mcp = { manual: { type: "local", command: ["manual"] } };
    edited.permission = { "*": "deny" };
    const modified = `${JSON.stringify(edited, null, 2)}\n`;
    await outputFile(absolute("opencode.jsonc"), modified);

    await expect(
      syncManagedMCP([provider], trackerMcp, project, {
        previousOwners: firstMcp.owners,
      }),
    ).rejects.toThrow(/modified after the last successful/);
    await expect(
      projectStructured(desired(), firstStructured.plan.nextReceipts),
    ).rejects.toThrow(/modified after the last successful/);
    expect(await source("opencode.jsonc")).toBe(modified);
  });

  it("rejects malformed JSONC and unowned collisions before changing bytes", async () => {
    const malformed = '{\n  // broken\n  "theme":,\n}\n';
    await outputFile(absolute("opencode.jsonc"), malformed);

    await expect(
      syncManagedMCP([provider], trackerMcp, project),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    await expect(projectStructured(desired())).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
    expect(await source("opencode.jsonc")).toBe(malformed);

    const occupied = `{
  "mcp": { "mine": { "type": "local", "command": ["mine"] } },
  "permission": { "*": "deny" },
  "theme": "system",
}
`;
    await outputFile(absolute("opencode.jsonc"), occupied);
    await expect(
      syncManagedMCP([provider], trackerMcp, project),
    ).rejects.toThrow(/no compatible prior AgentSync ownership receipt/);
    await expect(projectStructured(desired())).rejects.toThrow(
      /occupied key has no prior AgentSync ownership receipt/,
    );
    expect(await source("opencode.jsonc")).toBe(occupied);
  });

  it("clean dry-run is byte-stable and real clean retains a commented semantically empty JSONC file", async () => {
    const initial = `{
  // Keep this project note.
}
`;
    await outputFile(absolute("opencode.jsonc"), initial);
    const mcp = await syncManagedMCP([provider], trackerMcp, project);
    const structured = await projectStructured(desired());
    await publishOwnership(mcp.owners, structured.plan.nextReceipts);
    const before = await source("opencode.jsonc");
    const manifestBefore = await readFile(getManifestPath(project), "utf-8");

    await cleanCommand({ cwd: project, dryRun: true });
    expect(await source("opencode.jsonc")).toBe(before);
    expect(await readFile(getManifestPath(project), "utf-8")).toBe(
      manifestBefore,
    );

    const cleaned = await cleanCommand({ cwd: project });
    expect(await pathExists(absolute("opencode.jsonc"))).toBe(true);
    expect(await config("opencode.jsonc")).toEqual({});
    expect(await source("opencode.jsonc")).toContain(
      "// Keep this project note.",
    );
    expect(cleaned[0]?.modifiedFiles).toContain(absolute("opencode.jsonc"));
    expect((await readManifest(project))?.mcp_owners).toBeUndefined();
    expect((await readManifest(project))?.structured_owners).toBeUndefined();
  });

  it("clean deletes an AgentSync-only comment-free OpenCode config", async () => {
    const mcp = await syncManagedMCP([provider], trackerMcp, project);
    const structured = await projectStructured(desired());
    await publishOwnership(mcp.owners, structured.plan.nextReceipts);

    const cleaned = await cleanCommand({ cwd: project });

    expect(await pathExists(absolute("opencode.json"))).toBe(false);
    expect(cleaned[0]?.removedFiles).toContain(absolute("opencode.json"));
    expect((await readManifest(project))?.mcp_owners).toBeUndefined();
    expect((await readManifest(project))?.structured_owners).toBeUndefined();
  });
});
