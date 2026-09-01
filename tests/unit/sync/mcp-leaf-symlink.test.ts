import { lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../../src/constants.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { syncManagedMCP } from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile } from "../../../src/utils/fs.js";
import { writeProjectMcp } from "../../helpers/mcp.js";

const server: Record<string, MCP> = {
  tracker: { command: "npx", args: ["tracker"] },
};

const cases: Array<{ tool: ToolName; config: string }> = [
  { tool: "claude", config: ".mcp.json" },
  { tool: "opencode", config: "opencode.json" },
];

describe.runIf(process.platform !== "win32")(
  "managed MCP leaf symlinks",
  () => {
    let project: string;

    beforeEach(async () => {
      project = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-link-"));
    });

    afterEach(async () => {
      await rm(project, { recursive: true, force: true });
    });

    it.each(
      cases,
    )("preserves a receipt-owned $tool config redirected to another project file", async ({
      tool,
      config,
    }) => {
      const provider = getToolProvider(tool);
      const written = await syncManagedMCP([provider], server, project);
      const configPath = path.join(project, config);
      const original = await readFile(configPath, "utf-8");
      const targetPath = path.join(project, ".manual", `${tool}.config`);
      await outputFile(targetPath, original);
      await rm(configPath);
      await symlink(targetPath, configPath);

      const withdrawn = await syncManagedMCP([provider], {}, project, {
        previousOwners: written.owners,
      });

      expect(withdrawn.warnings).toEqual([
        expect.stringContaining("destination is not a regular file"),
      ]);
      expect(withdrawn.relinquishedTools).toEqual([tool]);
      expect(withdrawn.removedFiles).toEqual([]);
      expect(withdrawn.modifiedFiles).toEqual([]);
      expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
      expect(await readFile(targetPath, "utf-8")).toBe(original);
    });

    it("rejects an in-project OpenCode leaf symlink at the mutation boundary", async () => {
      const provider = getToolProvider("opencode");
      const targetPath = path.join(project, ".manual", "opencode.jsonc");
      const original = '{"manual":true}\n';
      await outputFile(targetPath, original);
      const configPath = path.join(project, "opencode.json");
      await symlink(targetPath, configPath);
      const format = provider.mcpFormat;
      if (!format) throw new Error("OpenCode MCP format is required");

      await expect(writeProjectMcp(provider, server, project)).rejects.toThrow(
        /destination is not a regular file/,
      );

      expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
      expect(await readFile(targetPath, "utf-8")).toBe(original);
    });
  },
);
