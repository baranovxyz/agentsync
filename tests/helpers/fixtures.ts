/**
 * Standard test fixtures — canonical test data used across all tests
 */
import type { MCP } from "../../src/core/mcp/tokens.js";

// === MCP Configs ===

export const STANDARD_COMMAND_MCP: Record<string, MCP> = {
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: "github_test_test123" },
  },
  postgres: {
    command: "docker",
    args: ["exec", "-i", "postgres-mcp"],
    env: { POSTGRES_URL: "postgresql://localhost/testdb" },
  },
};

export const STANDARD_URL_MCP: Record<string, MCP> = {
  "remote-api": {
    url: "https://mcp.example.com/v1",
    headers: { Authorization: "Bearer test-token" },
  },
};

export const MIXED_MCP: Record<string, MCP> = {
  ...STANDARD_COMMAND_MCP,
  ...STANDARD_URL_MCP,
};

// === Skills ===

export const SIMPLE_SKILL = `---
name: test-skill
description: A simple test skill
---

# Test Skill

Do the thing.
`;

export const COMPLEX_SKILL = `---
name: complex-skill
description: A skill with all frontmatter fields
license: Apache-2.0
compatibility: Requires git and docker
metadata:
  author: test-org
  version: "1.0"
---

# Complex Skill

Step 1: Do this.
Step 2: Do that.
`;

// === Commands ===

export const SIMPLE_COMMAND = `---
description: A simple test command
---

# Test Command

Run the tests.
`;

export const COMMAND_WITH_ARGS = `---
description: Deploy to environment
argument-hint: <environment> [flags]
---

# Deploy

Deploy to $ARGUMENTS.
`;

// === Agents ===

export const SIMPLE_AGENT = `---
name: test-reviewer
description: Reviews code for quality
---

# Code Reviewer

Review all changes for quality issues.
`;

// === Docs ===

export const DOCS_CONTENT = `# Project

A test project for AgentSync.

## Commands

- \`pnpm test\` — run tests
- \`pnpm build\` — build project
`;
