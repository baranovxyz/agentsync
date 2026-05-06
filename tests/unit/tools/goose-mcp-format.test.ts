/**
 * Goose YAML MCP Format Tests
 * Goose MCP is configured via YAML at .goose/config.yaml under "extensions" key.
 * Field mapping: command→cmd, args→args, env→envs, url→uri.
 * Type field: "stdio" for command-based, "sse" for URL-based.
 * Merges into existing config.yaml to preserve non-MCP settings.
 *
 * Ref: https://block.github.io/goose/docs/
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Goose YAML MCP Format", () => {
  let tmpDir: string;
  const provider = getToolProvider("goose");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-goose-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes command-based MCPs as stdio extensions", async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "github_test_abc123" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const configFile = path.join(tmpDir, ".goose", "config.yaml");
    const content = yaml.load(await readFile(configFile, "utf-8")) as Record<
      string,
      unknown
    >;

    const extensions = content.extensions as Record<
      string,
      Record<string, unknown>
    >;
    expect(extensions.github.type).toBe("stdio");
    expect(extensions.github.cmd).toBe("npx");
    expect(extensions.github.args).toEqual([
      "-y",
      "@modelcontextprotocol/server-github",
    ]);
    expect(
      (extensions.github.envs as Record<string, string>).GITHUB_TOKEN,
    ).toBe("github_test_abc123");
  });

  it("writes URL-based MCPs as sse extensions", async () => {
    const mcps: Record<string, MCP> = {
      "remote-api": {
        url: "https://mcp.example.com/sse",
        headers: { Authorization: "Bearer secret-token" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const configFile = path.join(tmpDir, ".goose", "config.yaml");
    const content = yaml.load(await readFile(configFile, "utf-8")) as Record<
      string,
      unknown
    >;

    const extensions = content.extensions as Record<
      string,
      Record<string, unknown>
    >;
    expect(extensions["remote-api"].type).toBe("sse");
    expect(extensions["remote-api"].uri).toBe("https://mcp.example.com/sse");
    expect(
      (extensions["remote-api"].headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer secret-token");
  });

  it("merges into existing config.yaml without clobbering", async () => {
    const gooseDir = path.join(tmpDir, ".goose");
    await ensureDir(gooseDir);
    await outputFile(
      path.join(gooseDir, "config.yaml"),
      yaml.dump({ model: "claude-sonnet", provider: "anthropic" }),
    );

    const mcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { TOKEN: "abc" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = yaml.load(
      await readFile(path.join(gooseDir, "config.yaml"), "utf-8"),
    ) as Record<string, unknown>;

    // Existing fields preserved
    expect(content.model).toBe("claude-sonnet");
    expect(content.provider).toBe("anthropic");

    // Extensions added
    const extensions = content.extensions as Record<
      string,
      Record<string, unknown>
    >;
    expect(extensions.github).toBeDefined();
    expect(extensions.github.type).toBe("stdio");
  });

  it("omits envs key when env is empty", async () => {
    const mcps: Record<string, MCP> = {
      minimal: { command: "npx", args: ["-y", "minimal-server"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const configFile = path.join(tmpDir, ".goose", "config.yaml");
    const content = yaml.load(await readFile(configFile, "utf-8")) as Record<
      string,
      unknown
    >;

    const extensions = content.extensions as Record<
      string,
      Record<string, unknown>
    >;
    expect(extensions.minimal.type).toBe("stdio");
    expect(extensions.minimal.cmd).toBe("npx");
    expect(extensions.minimal.envs).toBeUndefined();
  });
});
