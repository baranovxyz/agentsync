/**
 * Sync Command MCP Hints Tests
 * Tests the hint messages shown when MCPs are available but not synced
 */

import { describe, expect, it } from "vitest";

/**
 * Helper to format MCP hint messages
 * Shows which MCPs are available but not synced, and why
 */
function formatMCPHints(
  availableServers: string[],
  enabledServers: string[],
  disabledServers: string[],
): string | null {
  const activeMCPs = enabledServers.filter((s) => !disabledServers.includes(s));
  const notSynced = availableServers.filter((s) => !activeMCPs.includes(s));

  if (notSynced.length === 0) {
    return null; // All available servers are synced
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("ℹ️  Available MCP servers not synced:");

  for (const server of notSynced) {
    if (disabledServers.includes(server)) {
      lines.push(`  - ${server} (in mcpDisabled)`);
    } else if (!enabledServers.includes(server)) {
      lines.push(`  - ${server} (not in mcpEnabled)`);
    }
  }

  lines.push("");
  lines.push("To enable: agentsync mcp enable <name>");
  lines.push("To view all: agentsync mcp list");

  return lines.join("\n");
}

describe("formatMCPHints", () => {
  it("returns null when all available servers are synced", () => {
    const result = formatMCPHints(
      ["github", "postgres"],
      ["github", "postgres"],
      [],
    );

    expect(result).toBeNull();
  });

  it("returns null when no servers are available", () => {
    const result = formatMCPHints([], [], []);

    expect(result).toBeNull();
  });

  it("shows hint for server not in mcpEnabled", () => {
    const result = formatMCPHints(["github", "postgres"], ["github"], []);

    expect(result).toContain("Available MCP servers not synced:");
    expect(result).toContain("postgres (not in mcpEnabled)");
    expect(result).toContain("To enable: agentsync mcp enable <name>");
  });

  it("shows hint for server in mcpDisabled", () => {
    const result = formatMCPHints(
      ["github", "postgres"],
      ["github", "postgres"],
      ["postgres"],
    );

    expect(result).toContain("Available MCP servers not synced:");
    expect(result).toContain("postgres (in mcpDisabled)");
  });

  it("shows hints for multiple unsynced servers", () => {
    const result = formatMCPHints(
      ["github", "postgres", "filesystem"],
      ["github"],
      ["filesystem"],
    );

    expect(result).toContain("postgres (not in mcpEnabled)");
    expect(result).toContain("filesystem (in mcpDisabled)");
  });

  it("handles case when mcpEnabled is empty", () => {
    const result = formatMCPHints(["github", "postgres"], [], []);

    expect(result).toContain("github (not in mcpEnabled)");
    expect(result).toContain("postgres (not in mcpEnabled)");
  });

  it("prioritizes disabled reason over not enabled", () => {
    // Server is in both enabled and disabled - disabled wins
    const result = formatMCPHints(
      ["github", "postgres"],
      ["postgres"],
      ["postgres"],
    );

    expect(result).toContain("github (not in mcpEnabled)");
    expect(result).toContain("postgres (in mcpDisabled)");
    expect(result).not.toContain("postgres (not in mcpEnabled)");
  });

  it("includes helpful action hints", () => {
    const result = formatMCPHints(["github"], [], []);

    expect(result).toContain("To enable: agentsync mcp enable <name>");
    expect(result).toContain("To view all: agentsync mcp list");
  });

  it("formats message with proper spacing", () => {
    const result = formatMCPHints(["github"], [], []);

    expect(result).toMatch(/^\n/); // Starts with newline
    expect(result).toContain("  - github"); // Proper indentation
    expect(result).toContain("\n\n"); // Has blank line before commands
  });
});
