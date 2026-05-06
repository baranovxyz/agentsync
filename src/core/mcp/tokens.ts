/**
 * Token Substitution Module
 * Handles {VAR} → env value substitution for MCP configurations
 */

/**
 * MCP server configuration
 * Supports both command-based (local process) and URL-based (HTTP remote) formats
 */
export type MCP =
  | {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  | {
      url: string;
      headers?: Record<string, string>;
    };

/**
 * Token pattern: {UPPERCASE_WITH_UNDERSCORES}
 * Matches: {GITHUB_TOKEN}, {API_KEY}, {DATABASE_URL_123}
 */
export const TOKEN_PATTERN = /\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Substitute tokens in a single MCP configuration
 * @param mcp - MCP configuration with token placeholders
 * @param env - Environment variables
 * @returns New MCP with tokens substituted
 * @throws Error if required environment variable is missing
 */
/**
 * Replace token placeholders in a string with values from env.
 * @throws Error if a referenced variable is missing from env
 */
function replaceTokens(str: string, env: Record<string, string>): string {
  return str.replace(TOKEN_PATTERN, (_match, varName) => {
    if (!(varName in env)) {
      throw new Error(`Missing environment variable: ${varName}`);
    }
    return env[varName];
  });
}

/**
 * Substitute tokens in all string values of a Record.
 */
function substituteRecord(
  record: Record<string, string>,
  env: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = replaceTokens(value, env);
  }
  return result;
}

export function substituteTokens(mcp: MCP, env: Record<string, string>): MCP {
  if ("url" in mcp) {
    const result: MCP = { url: replaceTokens(mcp.url, env) };
    if (mcp.headers) {
      result.headers = substituteRecord(mcp.headers, env);
    }
    return result;
  }

  const result: MCP = { command: mcp.command, args: [...mcp.args] };
  if (mcp.env) {
    result.env = substituteRecord(mcp.env, env);
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
/**
 * Collect unsubstituted tokens from a Record of string values.
 */
function collectTokensFromRecord(
  record: Record<string, string>,
  serverName: string,
  out: Array<{ token: string; server: string }>,
): void {
  for (const value of Object.values(record)) {
    for (const match of value.matchAll(TOKEN_PATTERN)) {
      out.push({ token: match[1], server: serverName });
    }
  }
}

export function validateTokens(mcps: Record<string, MCP>): void {
  const missingTokens: Array<{ token: string; server: string }> = [];

  for (const [serverName, mcp] of Object.entries(mcps)) {
    if ("command" in mcp && mcp.env) {
      collectTokensFromRecord(mcp.env, serverName, missingTokens);
    }
    if ("url" in mcp && mcp.headers) {
      collectTokensFromRecord(mcp.headers, serverName, missingTokens);
    }
  }

  if (missingTokens.length > 0) {
    const serverMap: Record<string, string[]> = {};
    for (const { token, server } of missingTokens) {
      if (!serverMap[token]) serverMap[token] = [];
      serverMap[token].push(server);
    }

    const details = Object.entries(serverMap)
      .map(
        ([token, servers]) =>
          `  - ${token} (required by: ${servers.join(", ")})`,
      )
      .join("\n");

    throw new Error(`Missing required environment variables:\n${details}`);
  }
}
