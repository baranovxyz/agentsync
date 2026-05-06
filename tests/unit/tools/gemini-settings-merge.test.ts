/**
 * Gemini settings.json Merge Robustness Tests
 * Gemini MCP is merged into .gemini/settings.json alongside other settings
 * Ref: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Gemini settings.json Merge", () => {
  let tmpDir: string;
  const provider = getToolProvider("gemini");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-gemini-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates settings.json from scratch when none exists", async () => {
    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: ["-y", "@mcp/github"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const settingsPath = path.join(tmpDir, ".gemini", "settings.json");
    expect(await pathExists(settingsPath)).toBe(true);

    const content = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(content.mcpServers.github.command).toBe("npx");
  });

  it("preserves existing settings when merging MCP", async () => {
    const geminiDir = path.join(tmpDir, ".gemini");
    await ensureDir(geminiDir);
    await outputFile(
      path.join(geminiDir, "settings.json"),
      JSON.stringify(
        {
          model: "gemini-2.5-pro",
          theme: "dark",
          context: { fileName: ["GEMINI.md", "AGENTS.md"] },
          mcpServers: {},
        },
        null,
        2,
      ),
    );

    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: ["-y", "@mcp/github"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
    );
    expect(content.model).toBe("gemini-2.5-pro");
    expect(content.theme).toBe("dark");
    expect(content.context.fileName).toEqual(["GEMINI.md", "AGENTS.md"]);
    expect(content.mcpServers.github).toBeDefined();
  });

  it("overwrites existing mcpServers completely", async () => {
    const geminiDir = path.join(tmpDir, ".gemini");
    await ensureDir(geminiDir);
    await outputFile(
      path.join(geminiDir, "settings.json"),
      JSON.stringify({
        mcpServers: {
          old_server: { command: "old", args: [] },
        },
      }),
    );

    const mcps: Record<string, MCP> = {
      new_server: { command: "new", args: [] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
    );
    // Old server should be gone, new server present
    expect(content.mcpServers.old_server).toBeUndefined();
    expect(content.mcpServers.new_server.command).toBe("new");
  });

  it("recovers from malformed settings.json", async () => {
    const geminiDir = path.join(tmpDir, ".gemini");
    await ensureDir(geminiDir);
    await outputFile(
      path.join(geminiDir, "settings.json"),
      "this is not valid json!!!",
    );

    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: [] },
    };

    // Should not throw
    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
    );
    expect(content.mcpServers.github).toBeDefined();
  });

  it("handles empty settings.json", async () => {
    const geminiDir = path.join(tmpDir, ".gemini");
    await ensureDir(geminiDir);
    await outputFile(path.join(geminiDir, "settings.json"), "{}");

    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: [] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
    );
    expect(content.mcpServers.server).toBeDefined();
  });

  it("preserves deeply nested settings", async () => {
    const geminiDir = path.join(tmpDir, ".gemini");
    await ensureDir(geminiDir);
    await outputFile(
      path.join(geminiDir, "settings.json"),
      JSON.stringify({
        context: {
          fileName: ["GEMINI.md"],
        },
        sandbox: {
          image: "custom-sandbox:latest",
          env: { NODE_ENV: "development" },
        },
        toolPermissions: {
          "shell-exec": "auto-approve",
          "file-write": "ask",
        },
      }),
    );

    const mcps: Record<string, MCP> = {
      github: { command: "npx", args: ["-y", "@mcp/github"] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(geminiDir, "settings.json"), "utf-8"),
    );
    expect(content.context.fileName).toEqual(["GEMINI.md"]);
    expect(content.sandbox.image).toBe("custom-sandbox:latest");
    expect(content.toolPermissions["shell-exec"]).toBe("auto-approve");
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes valid formatted JSON", async () => {
    const mcps: Record<string, MCP> = {
      server: { command: "npx", args: [] },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const raw = await readFile(
      path.join(tmpDir, ".gemini", "settings.json"),
      "utf-8",
    );
    // Should be pretty-printed (contains newlines and indentation)
    expect(raw).toContain("\n");
    expect(raw).toContain("  ");
    // Should end with newline
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("handles URL-based MCP servers", async () => {
    const mcps: Record<string, MCP> = {
      remote: {
        url: "https://mcp.example.com/sse",
        headers: { Authorization: "Bearer tok-123" },
      },
    };

    await provider.mcpFormat!.writeMCP(mcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
    );
    expect(content.mcpServers.remote.url).toBe("https://mcp.example.com/sse");
    expect(content.mcpServers.remote.headers.Authorization).toBe(
      "Bearer tok-123",
    );
  });
});
