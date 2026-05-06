/**
 * URL-Based MCP Server Tests
 * Verifies URL-based MCP servers are correctly written across all tools
 * including url, headers, and transport type handling
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../../src/constants.js";
import type { MCP } from "../../../../src/core/mcp/tokens.js";
import { substituteTokens } from "../../../../src/core/mcp/tokens.js";
import { syncMCP } from "../../../../src/sync/mcp.js";
import {
  getToolProvider,
  getToolProviders,
} from "../../../../src/tools/index.js";
import { pathExists } from "../../../../src/utils/fs.js";

describe("MCP URL-Based Servers", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-url-mcp-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const urlMCP: Record<string, MCP> = {
    "sse-server": {
      url: "https://sse.example.com/mcp",
      headers: { Authorization: "Bearer test-token-123" },
    },
  };

  function parseToolConfig(
    fullPath: string,
    raw: string,
  ): Record<string, unknown> {
    if (fullPath.endsWith(".toml"))
      return parseToml(raw) as Record<string, unknown>;
    if (fullPath.endsWith(".yaml") || fullPath.endsWith(".yml"))
      return yaml.load(raw) as Record<string, unknown>;
    return JSON.parse(raw);
  }

  function extractServersFromConfig(
    content: Record<string, unknown>,
  ): Record<string, unknown> {
    const direct =
      content.mcp_servers ||
      content["amp.mcpServers"] ||
      content.mcpServers ||
      content.mcp ||
      content.servers ||
      content.extensions;
    if (direct) return direct as Record<string, unknown>;
    const merged: Record<string, unknown> = {};
    for (const entry of (content.stdio_servers as Array<{ name: string }>) ||
      [])
      merged[entry.name] = entry;
    for (const entry of (content.sse_servers as Array<{ name: string }>) || [])
      merged[entry.name] = entry;
    return merged;
  }

  it("writes URL MCP to all tool configs", async () => {
    const providers = getToolProviders([...SUPPORTED_TOOLS]);
    await syncMCP(providers, urlMCP, tmpDir);

    for (const toolName of SUPPORTED_TOOLS) {
      const provider = getToolProvider(toolName);
      if (!provider.paths.mcpConfigPath) continue;
      const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath);
      expect(await pathExists(fullPath)).toBe(true);
      const raw = await readFile(fullPath, "utf-8");
      const servers = extractServersFromConfig(parseToolConfig(fullPath, raw));
      expect(servers).toBeDefined();
      expect(servers["sse-server"]).toBeDefined();
    }
  });

  it("standard tools preserve url and headers directly", async () => {
    for (const toolName of ["claude", "cursor", "roocode"] as const) {
      const provider = getToolProvider(toolName);
      await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

      const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath!);
      const content = JSON.parse(await readFile(fullPath, "utf-8"));

      expect(content.mcpServers["sse-server"].url).toBe(
        "https://sse.example.com/mcp",
      );
      expect(content.mcpServers["sse-server"].headers.Authorization).toBe(
        "Bearer test-token-123",
      );
    }
  });

  it("Copilot preserves url and headers under 'servers' key", async () => {
    const provider = getToolProvider("copilot");
    await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

    const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath!);
    const content = JSON.parse(await readFile(fullPath, "utf-8"));

    expect(content.servers["sse-server"].url).toBe(
      "https://sse.example.com/mcp",
    );
    expect(content.servers["sse-server"].headers.Authorization).toBe(
      "Bearer test-token-123",
    );
  });

  it("Codex preserves url and headers in TOML format", async () => {
    const provider = getToolProvider("codex");
    await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

    const fullPath = path.join(tmpDir, provider.paths.mcpConfigPath!);
    const content = parseToml(await readFile(fullPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const servers = content.mcp_servers as Record<
      string,
      Record<string, unknown>
    >;

    expect(servers["sse-server"].url).toBe("https://sse.example.com/mcp");
    // Codex uses http_headers (not headers) for URL-based servers
    const headers = servers["sse-server"].http_headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer test-token-123");
  });

  it("OpenCode converts URL MCP to remote type", async () => {
    const provider = getToolProvider("opencode");
    await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );

    expect(content.mcp["sse-server"].type).toBe("remote");
    expect(content.mcp["sse-server"].url).toBe("https://sse.example.com/mcp");
    expect(content.mcp["sse-server"].headers.Authorization).toBe(
      "Bearer test-token-123",
    );
    expect(content.mcp["sse-server"].enabled).toBe(true);
  });

  it("Gemini merges URL MCP into settings.json", async () => {
    const provider = getToolProvider("gemini");
    await provider.mcpFormat!.writeMCP(urlMCP, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
    );

    expect(content.mcpServers["sse-server"].url).toBe(
      "https://sse.example.com/mcp",
    );
    expect(content.mcpServers["sse-server"].headers.Authorization).toBe(
      "Bearer test-token-123",
    );
  });

  it("URL server without headers is written correctly", async () => {
    const noHeaderMCP: Record<string, MCP> = {
      basic: { url: "http://localhost:3000/mcp" },
    };

    const provider = getToolProvider("claude");
    await provider.mcpFormat!.writeMCP(noHeaderMCP, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );

    expect(content.mcpServers.basic.url).toBe("http://localhost:3000/mcp");
    expect(content.mcpServers.basic.headers).toBeUndefined();
  });

  it("mixed command and URL servers written to same config", async () => {
    const mixedMCP: Record<string, MCP> = {
      local: {
        command: "npx",
        args: ["-y", "local-server"],
        env: { KEY: "val" },
      },
      remote: {
        url: "https://api.example.com/v2/mcp",
        headers: { "X-API-Key": "key123" },
      },
    };

    const provider = getToolProvider("cursor");
    await provider.mcpFormat!.writeMCP(mixedMCP, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".cursor", "mcp.json"), "utf-8"),
    );

    expect(content.mcpServers.local.command).toBe("npx");
    expect(content.mcpServers.remote.url).toBe(
      "https://api.example.com/v2/mcp",
    );
  });

  it("token substitution works in URL-based MCP headers", () => {
    const mcp: MCP = {
      url: "https://api.example.com/mcp",
      headers: { Authorization: "Bearer {API_TOKEN}" },
    };

    const env = { API_TOKEN: "real-token-value" };
    const result = substituteTokens(mcp, env);

    expect("url" in result).toBe(true);
    if ("url" in result) {
      expect(result.headers?.Authorization).toBe("Bearer real-token-value");
    }
  });

  it("token substitution works in URL itself", () => {
    const mcp: MCP = {
      url: "https://{MCP_HOST}/v1/mcp",
      headers: {},
    };

    const env = { MCP_HOST: "production.example.com" };
    const result = substituteTokens(mcp, env);

    expect("url" in result).toBe(true);
    if ("url" in result) {
      expect(result.url).toBe("https://production.example.com/v1/mcp");
    }
  });

  it("multiple URL servers with different headers", async () => {
    const multiURL: Record<string, MCP> = {
      "service-a": {
        url: "https://a.example.com/mcp",
        headers: { "X-Service": "A" },
      },
      "service-b": {
        url: "https://b.example.com/mcp",
        headers: { "X-Service": "B", "X-Extra": "yes" },
      },
      "service-c": { url: "https://c.example.com/mcp" },
    };

    const provider = getToolProvider("claude");
    await provider.mcpFormat!.writeMCP(multiURL, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );

    expect(Object.keys(content.mcpServers)).toHaveLength(3);
    expect(content.mcpServers["service-a"].headers["X-Service"]).toBe("A");
    expect(content.mcpServers["service-b"].headers["X-Extra"]).toBe("yes");
    expect(content.mcpServers["service-c"].headers).toBeUndefined();
  });
});
