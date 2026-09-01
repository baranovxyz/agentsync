/**
 * MCP config ownership tests.
 *
 * `MCPFormat.ownership` is what tells `agentsync clean` whether it may delete a
 * tool's config file. If a writer is ever changed from merging to clobbering
 * (or back) without updating that declaration, clean either starts destroying
 * user config or starts leaving its own behind. These tests check the
 * declaration against what the writer actually does, so the two cannot drift.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import type { ConfigFileFormat } from "../../../src/tools/mcp-helpers.js";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import { outputFile } from "../../../src/utils/fs.js";
import { writeProjectMcp } from "../../helpers/mcp.js";

const FOREIGN_KEY = "userAuthoredSetting";
const testMcps: Record<string, MCP> = {
  tracker: { command: "npx", args: ["-y", "@org/tracker"] },
};

function serialize(
  value: Record<string, unknown>,
  format: ConfigFileFormat,
): string {
  if (format === "yaml") return yaml.dump(value);
  if (format === "toml") return stringifyToml(value);
  // Every whole-file writer is JSON.
  return JSON.stringify(value, null, 2);
}

function parse(content: string, format: ConfigFileFormat): unknown {
  if (format === "toml") return parseToml(content);
  if (format === "yaml") return yaml.load(content);
  return JSON.parse(content);
}

describe("MCP config ownership matches writer behavior", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-ownership-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  for (const tool of SUPPORTED_TOOLS) {
    const provider = getToolProvider(tool);
    const relPath = provider.paths.mcpConfigPath;
    const mcpFormat = provider.mcpFormat;
    if (!(mcpFormat && relPath)) continue;

    const ownership = mcpFormat.ownership;

    it(`${tool} writer behaves as its "${ownership.kind}" declaration claims`, async () => {
      const format: ConfigFileFormat =
        ownership.kind === "owned-keys" ? ownership.format : "json";
      const configPath = path.join(tmpDir, relPath);
      await outputFile(
        configPath,
        serialize({ [FOREIGN_KEY]: "keep me" }, format),
      );

      await writeProjectMcp(provider, testMcps, tmpDir);

      const after = ToolSettingsSchema.parse(
        parse(await readFile(configPath, "utf-8"), format),
      );

      if (ownership.kind === "whole-file") {
        // Declared whole-file: the writer must really discard foreign content.
        // If this fails, the writer now merges and clean is deleting a file
        // that holds the user's settings.
        expect(after[FOREIGN_KEY]).toBeUndefined();
        return;
      }

      // Declared owned-keys: the writer must really preserve foreign content,
      // and must write EVERY key clean will strip. A declared key the writer
      // never writes is a key clean would delete without having created it.
      expect(after[FOREIGN_KEY]).toBe("keep me");
      for (const key of ownership.keys) {
        expect(
          key in after,
          `${tool} declares ownership of "${key}" but its project writer did not write it`,
        ).toBe(true);
      }
    });
  }

  it("declares ownership for every tool that writes an MCP config", () => {
    for (const tool of SUPPORTED_TOOLS) {
      const provider = getToolProvider(tool);
      if (!provider.mcpFormat) continue;
      expect(provider.mcpFormat.ownership.kind, tool).toMatch(
        /^(whole-file|owned-keys)$/,
      );
      expect(provider.paths.mcpConfigPath, tool).not.toBeNull();
    }
  });
});
