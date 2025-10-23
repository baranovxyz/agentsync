/**
 * MCP Remove Command Tests
 * Tests removing MCP server from project config
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeMCP } from "../../../../src/commands/mcp/remove.js";
import * as fs from "../../../../src/utils/fs.js";

describe("removeMCP", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-remove-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it("removes MCP from array config", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github", "postgres", "linear"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await removeMCP("postgres");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual(["github", "linear"]);
  });

  it("does nothing if MCP not in config", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await removeMCP("postgres");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual(["github"]); // Unchanged
  });

  it("throws error if .agentsync/config.json does not exist", async () => {
    await expect(removeMCP("github")).rejects.toThrow(
      /MCP configuration not found/,
    );
  });

  it("allows removing last MCP, resulting in empty array", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    const result = await removeMCP("github");

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe("github");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual([]);
  });

  it("handles object format config", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: {
        github: true,
        postgres: true,
      },
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    await removeMCP("postgres");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers.github).toBe(true);
    expect(updated.mcpServers.postgres).toBeUndefined();
  });

  it("returns result with removed status", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: ["github", "postgres"],
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    const result = await removeMCP("postgres");

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe("postgres");
  });

  it("allows removing last MCP in object format, resulting in empty object", async () => {
    await fs.ensureDir(".agentsync");
    const projectConfig = {
      version: "1.0",
      tools: ["cursor", "claude"],
      mcpServers: {
        github: true,
      },
    };
    await fs.writeJson(".agentsync/config.json", projectConfig);

    const result = await removeMCP("github");

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe("github");

    const updated = await fs.readJson(".agentsync/config.json");
    expect(updated.mcpServers).toEqual({});
  });
});
