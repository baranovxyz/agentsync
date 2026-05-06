/**
 * Token Substitution Tests
 * Target: 100% coverage (security critical)
 */

import { describe, expect, it } from "vitest";
import {
  type MCP,
  substituteAllMCPs,
  substituteTokens,
  validateTokens,
} from "../../../../src/core/mcp/tokens.js";

describe("substituteTokens", () => {
  it("replaces {GITHUB_TOKEN} with env value", () => {
    const mcp: MCP = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "{GITHUB_TOKEN}",
      },
    };
    const env = { GITHUB_TOKEN: "github_test_test123" };

    const result = substituteTokens(mcp, env);

    expect(result.env?.GITHUB_TOKEN).toBe("github_test_test123");
  });

  it("replaces multiple tokens in same MCP", () => {
    const mcp: MCP = {
      command: "custom-server",
      args: [],
      env: {
        API_KEY: "{API_KEY}",
        API_SECRET: "{API_SECRET}",
        DATABASE_URL: "{DATABASE_URL}",
      },
    };
    const env = {
      API_KEY: "key123",
      API_SECRET: "secret456",
      DATABASE_URL: "postgresql://localhost/db",
    };

    const result = substituteTokens(mcp, env);

    expect(result.env?.API_KEY).toBe("key123");
    expect(result.env?.API_SECRET).toBe("secret456");
    expect(result.env?.DATABASE_URL).toBe("postgresql://localhost/db");
  });

  it("throws error for missing environment variable", () => {
    const mcp: MCP = {
      command: "npx",
      args: [],
      env: {
        GITHUB_TOKEN: "{GITHUB_TOKEN}",
      },
    };
    const env = {}; // Missing GITHUB_TOKEN

    expect(() => substituteTokens(mcp, env)).toThrow(
      "Missing environment variable: GITHUB_TOKEN",
    );
  });

  it("does not replace tokens without curly braces", () => {
    const mcp: MCP = {
      command: "npx",
      args: [],
      env: {
        LITERAL_VALUE: "GITHUB_TOKEN", // No braces
      },
    };
    const env = { GITHUB_TOKEN: "github_test_test123" };

    const result = substituteTokens(mcp, env);

    expect(result.env?.LITERAL_VALUE).toBe("GITHUB_TOKEN"); // Unchanged
  });

  it("handles MCPs without env section", () => {
    const mcp: MCP = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
    };
    const env = { SOME_VAR: "value" };

    const result = substituteTokens(mcp, env);

    expect(result.env).toBeUndefined();
    expect(result.command).toBe("npx");
  });

  it("does not mutate original MCP object", () => {
    const mcp: MCP = {
      command: "npx",
      args: [],
      env: {
        GITHUB_TOKEN: "{GITHUB_TOKEN}",
      },
    };
    const env = { GITHUB_TOKEN: "github_test_test123" };

    const result = substituteTokens(mcp, env);

    expect(mcp.env?.GITHUB_TOKEN).toBe("{GITHUB_TOKEN}"); // Original unchanged
    expect(result.env?.GITHUB_TOKEN).toBe("github_test_test123"); // Result has substitution
  });

  it("replaces tokens in nested string values", () => {
    const mcp: MCP = {
      command: "custom",
      args: [],
      env: {
        CONNECTION_STRING: "postgresql://{DB_USER}:{DB_PASS}@localhost/mydb",
      },
    };
    const env = {
      DB_USER: "admin",
      DB_PASS: "secret123",
    };

    const result = substituteTokens(mcp, env);

    expect(result.env?.CONNECTION_STRING).toBe(
      "postgresql://admin:secret123@localhost/mydb",
    );
  });

  it("validates token pattern (uppercase with underscores only)", () => {
    const mcp: MCP = {
      command: "npx",
      args: [],
      env: {
        VALID_TOKEN: "{VALID_TOKEN}",
        VALID_123: "{VALID_123}",
      },
    };
    const env = {
      VALID_TOKEN: "value1",
      VALID_123: "value2",
    };

    const result = substituteTokens(mcp, env);

    expect(result.env?.VALID_TOKEN).toBe("value1");
    expect(result.env?.VALID_123).toBe("value2");
  });
});

describe("validateTokens", () => {
  it("passes when all required tokens are present", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "github_test_test123",
        },
      },
      postgres: {
        command: "npx",
        args: [],
        env: {
          POSTGRES_URL: "postgresql://localhost/db",
        },
      },
    };

    expect(() => validateTokens(mcps)).not.toThrow();
  });

  it("throws error listing all missing tokens", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "{GITHUB_TOKEN}", // Not substituted
        },
      },
      postgres: {
        command: "npx",
        args: [],
        env: {
          POSTGRES_URL: "{DATABASE_URL}", // Not substituted
        },
      },
    };

    expect(() => validateTokens(mcps)).toThrow(
      /Missing required environment variables/,
    );
    expect(() => validateTokens(mcps)).toThrow(/GITHUB_TOKEN/);
    expect(() => validateTokens(mcps)).toThrow(/DATABASE_URL/);
  });

  it("includes server names in error message", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "{GITHUB_TOKEN}",
        },
      },
    };

    expect(() => validateTokens(mcps)).toThrow(/required by: github/);
  });

  it("handles MCPs without env section", () => {
    const mcps = {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      },
    };

    expect(() => validateTokens(mcps)).not.toThrow();
  });

  it("passes when tokens are already substituted (no curly braces)", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "github_test_actual_token",
        },
      },
    };

    expect(() => validateTokens(mcps)).not.toThrow();
  });
});

describe("substituteAllMCPs", () => {
  it("substitutes tokens in all MCPs", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "{GITHUB_TOKEN}",
        },
      },
      postgres: {
        command: "npx",
        args: [],
        env: {
          POSTGRES_URL: "{DATABASE_URL}",
        },
      },
    };
    const env = {
      GITHUB_TOKEN: "github_test_test123",
      DATABASE_URL: "postgresql://localhost/db",
    };

    const result = substituteAllMCPs(mcps, env);

    expect(result.github.env?.GITHUB_TOKEN).toBe("github_test_test123");
    expect(result.postgres.env?.POSTGRES_URL).toBe("postgresql://localhost/db");
  });

  it("does not mutate original MCPs object", () => {
    const mcps = {
      github: {
        command: "npx",
        args: [],
        env: {
          GITHUB_TOKEN: "{GITHUB_TOKEN}",
        },
      },
    };
    const env = { GITHUB_TOKEN: "github_test_test123" };

    const result = substituteAllMCPs(mcps, env);

    expect(mcps.github.env?.GITHUB_TOKEN).toBe("{GITHUB_TOKEN}"); // Original unchanged
    expect(result.github.env?.GITHUB_TOKEN).toBe("github_test_test123"); // Result has substitution
  });
});
