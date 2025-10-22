/**
 * Token Substitution Module
 * Handles {VAR} → env value substitution for MCP configurations
 */

/**
 * MCP server configuration
 */
export interface MCP {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Token pattern: {UPPERCASE_WITH_UNDERSCORES}
 * Matches: {GITHUB_TOKEN}, {API_KEY}, {DATABASE_URL_123}
 */
const TOKEN_PATTERN = /\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Substitute tokens in a single MCP configuration
 * @param mcp - MCP configuration with token placeholders
 * @param env - Environment variables
 * @returns New MCP with tokens substituted
 * @throws Error if required environment variable is missing
 */
export function substituteTokens(mcp: MCP, env: Record<string, string>): MCP {
  // Deep clone to avoid mutation
  const result: MCP = {
    command: mcp.command,
    args: [...mcp.args],
  };

  // Handle env section if present
  if (mcp.env) {
    result.env = {};

    for (const [key, value] of Object.entries(mcp.env)) {
      if (typeof value === "string") {
        result.env[key] = value.replace(TOKEN_PATTERN, (_match, varName) => {
          if (!env[varName]) {
            throw new Error(`Missing environment variable: ${varName}`);
          }
          return env[varName];
        });
      } else {
        result.env[key] = value;
      }
    }
  }

  return result;
}

/**
 * Substitute tokens in all MCPs
 * @param mcps - Record of MCP configurations
 * @param env - Environment variables
 * @returns New record with tokens substituted
 */
export function substituteAllMCPs(
  mcps: Record<string, MCP>,
  env: Record<string, string>,
): Record<string, MCP> {
  const result: Record<string, MCP> = {};

  for (const [name, mcp] of Object.entries(mcps)) {
    result[name] = substituteTokens(mcp, env);
  }

  return result;
}

/**
 * Validate that all tokens have been substituted
 * @param mcps - Record of MCP configurations
 * @throws Error if any tokens remain unsubstituted
 */
export function validateTokens(mcps: Record<string, MCP>): void {
  const missingTokens: Array<{ token: string; server: string }> = [];

  for (const [serverName, mcp] of Object.entries(mcps)) {
    if (!mcp.env) continue;

    for (const value of Object.values(mcp.env)) {
      if (typeof value === "string") {
        const matches = value.matchAll(TOKEN_PATTERN);
        for (const match of matches) {
          missingTokens.push({
            token: match[1],
            server: serverName,
          });
        }
      }
    }
  }

  if (missingTokens.length > 0) {
    const uniqueTokens = Array.from(new Set(missingTokens.map((m) => m.token)));
    const serverMap = missingTokens.reduce(
      (acc, { token, server }) => {
        if (!acc[token]) acc[token] = [];
        acc[token].push(server);
        return acc;
      },
      {} as Record<string, string[]>,
    );

    const details = uniqueTokens
      .map(
        (token) => `  - ${token} (required by: ${serverMap[token].join(", ")})`,
      )
      .join("\n");

    throw new Error(`Missing required environment variables:\n${details}`);
  }
}
