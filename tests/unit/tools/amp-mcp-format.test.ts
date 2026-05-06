/**
 * Amp MCP Format Tests
 * Amp MCP is configured via JSON at .amp/settings.json under "amp.mcpServers" key.
 * Merges into existing settings file to preserve non-MCP settings.
 *
 * Ref: https://sourcegraph.com/docs/amp
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Amp MCP Format", () => {
  let tmpDir: string;
  const provider = getToolProvider("amp");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-amp-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes amp.mcpServers to .amp/settings.json", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "github_test_abc123" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const settingsFile = path.join(tmpDir, ".amp", "settings.json");
    const content = JSON.parse(await readFile(settingsFile, "utf-8"));

    expect(content["amp.mcpServers"].github.command).toBe("npx");
    expect(content["amp.mcpServers"].github.env.GITHUB_TOKEN).toBe(
      "github_test_abc123",
    );
  });

  it("merges into existing settings without clobbering", async () => {
    const ampDir = path.join(tmpDir, ".amp");
    await ensureDir(ampDir);
    await outputFile(
      path.join(ampDir, "settings.json"),
      JSON.stringify(
        {
          model: "claude-sonnet",
          theme: "dark",
        },
        null,
        2,
      ),
    );

    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { TOKEN: "abc" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(ampDir, "settings.json"), "utf-8"),
    );

    // Existing keys preserved
    expect(content.model).toBe("claude-sonnet");
    expect(content.theme).toBe("dark");

    // amp.mcpServers added
    expect(content["amp.mcpServers"]).toBeDefined();
    expect(content["amp.mcpServers"].github.command).toBe("npx");
  });
});
