# AgentSync Tests

Guide to understanding, running, and writing tests in AgentSync.

## Quick Start

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- tests/workflows/mcp-basic.test.ts

# Run tests matching pattern
pnpm test -- --grep "workflow"

# Watch mode (re-run on change)
pnpm test -- --watch

# With coverage report
pnpm test -- --coverage
```

## Test Structure

AgentSync uses a **three-tier pyramid**:

```
    E2E Smoke (CI)     Packaging validation
      Workflows (14)   User workflows, in-process
       Units (425+)    Logic & isolation
```

### Unit Tests (`tests/unit/`)

Fast, isolated logic tests with strong types.

**When to write**: Testing a function or class with no I/O

**Example**:

```typescript
// tests/unit/core/mcp/tokens.test.ts
describe("substituteTokens", () => {
  it("replaces {VAR} with env value", () => {
    const mcp = { command: "cmd", args: [], env: { KEY: "{VAR}" } };
    const result = substituteTokens(mcp, { VAR: "value" });
    expect(result.env.KEY).toBe("value");
  });
});
```

### Workflow Tests (`tests/workflows/`)

End-to-end user workflows, running in-process (not spawning).

**When to write**: Testing complete CLI workflows (enable → sync → disable)

**Example**:

```typescript
// tests/workflows/mcp-basic.test.ts
describe("MCP Workflow", () => {
  it("adds and syncs MCP", async () => {
    const result = await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir, GITHUB_TOKEN: "token" },
    });
    assertSuccess(result);
  });
});
```

**Harness API**:

```typescript
import {
  runCli,
  assertSuccess,
  withTempProject,
} from "../utils/workflow-harness.js";

// Run command in-process
const result = await runCli(["mcp", "list"], { cwd, env });

// Check exit code and output
assertSuccess(result); // throws if exitCode !== 0
expect(result.stdout).toContain("github");
expect(result.stderr).toBe("");

// Setup temp environment
await withTempProject(async ({ projectDir, homeDir }) => {
  // Run tests here, dirs auto-cleanup
});
```

### E2E Smoke Tests (`tests/e2e/`)

Validation of built artifact on each platform.

**When to write**: Testing shebang, permissions, or platform-specific issues

**Note**: These run only on CI, not in normal `pnpm test`

## Scenario-Based Tests

Declarative YAML format for complex workflows.

**Location**: `tests/scenarios/`

**Example** (`mcp-add-sync.yml`):

```yaml
name: MCP Add and Sync
setup:
  project:
    files:
      .cursor/.placeholder: ""
  home:
    files:
      .agentsync/mcp.json: |
        {
          "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
          }
        }
  env:
    GITHUB_TOKEN: ghp_test
steps:
  - run: ["mcp", "add", "github"]
    expect:
      exitCode: 0
  - run: ["mcp", "sync"]
    expect:
      exitCode: 0
assert:
  files:
    .cursor/mcp.json: json
```

**Running scenarios**:

```typescript
import { loadScenario, runScenario } from "../utils/scenario-runner.js";

const scenario = await loadScenario("tests/scenarios/mcp-add-sync.yml");
const result = await runScenario(scenario);
expect(result.passed).toBe(true);
```

## Adding Tests

### For New Features

1. **Decide tier**:
   - Pure logic → `tests/unit/`
   - CLI workflow → `tests/workflows/`
   - Platform-specific → `tests/e2e/`

2. **Create test file**:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("My Feature", () => {
  beforeEach(async () => {
    // Setup: create temp dirs, files, etc.
  });

  afterEach(async () => {
    // Cleanup: remove temp files
  });

  it("should work", async () => {
    // Test
  });
});
```

3. **For workflows**, use the harness:

```typescript
import { runCli, assertSuccess } from "../utils/workflow-harness.js";

describe("My Workflow", () => {
  it("should add MCP", async () => {
    const result = await runCli(["mcp", "add", "github"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    assertSuccess(result);
  });
});
```

### Testing Guidelines

✅ **Do**:

- Use `beforeEach`/`afterEach` for setup/cleanup
- Delete environment variables: `delete process.env.VAR`
- Check both exit code and output
- Use descriptive test names
- Keep tests focused and fast

❌ **Don't**:

- Use `setTimeout` for timing
- Hardcode absolute paths
- Rely on external services
- Mix multiple concerns in one test
- Write flaky tests (retry won't help)

## Common Patterns

### Testing with Environment Variables

```typescript
beforeEach(async () => {
  process.env.GITHUB_TOKEN = "test_token";
});

afterEach(async () => {
  delete process.env.GITHUB_TOKEN; // Important!
});
```

### Testing File Operations

```typescript
import * as fs from "../../src/utils/fs.js";

it("creates config", async () => {
  await fs.writeJson(path.join(projectDir, ".agentsync/config.json"), {
    mcpServers: ["github"],
  });

  const config = await fs.readJson(
    path.join(projectDir, ".agentsync/config.json")
  );
  expect(config.mcpServers).toContain("github");
});
```

### Testing Error Cases

```typescript
it("rejects invalid MCP", async () => {
  const result = await runCli(["mcp", "add", "nonexistent"], { cwd });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("not found");
});
```

## Debugging Tests

### See what CLI produced

```typescript
const result = await runCli(["mcp", "list"], { cwd });
console.log("Exit:", result.exitCode);
console.log("Stdout:", result.stdout);
console.log("Stderr:", result.stderr);
```

### Run one test

```bash
pnpm test -- --grep "should add MCP"
```

### Run with verbose output

```bash
pnpm test -- --reporter=verbose tests/workflows/mcp-basic.test.ts
```

### Watch specific file

```bash
pnpm test -- --watch tests/workflows/mcp-basic.test.ts
```

## Determinism & Stability

### Why tests sometimes fail

1. **Environment pollution** - Previous test left env vars
   - Fix: Always `delete process.env.VAR` in cleanup

2. **Path issues** - Temp paths change each run
   - Fix: Use normalization helpers or path placeholders

3. **Timing** - Tests depend on time or delays
   - Fix: Use event-driven assertions, not `setTimeout`

4. **Missing setup** - Directory or file doesn't exist
   - Fix: Use `fs.ensureDir()` before reading

### Making tests deterministic

✅ Freeze time if needed:

```typescript
import { vi } from "vitest";
vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
```

✅ Normalize output:

```typescript
import { normalizeOutput } from "../utils/workflow-harness.js";
const clean = normalizeOutput(output, {
  [projectDir]: "<PROJECT>",
  [homeDir]: "<HOME>",
});
```

✅ Sort collections before comparison:

```typescript
const sorted = Object.keys(result).sort();
expect(sorted).toEqual(["a", "b", "c"]);
```

## Performance

### Target times

| Test Type       | Target | Current    |
| --------------- | ------ | ---------- |
| Unit test       | < 5ms  | ✅ 1-3ms   |
| Workflow test   | < 50ms | ✅ 30-40ms |
| Full unit suite | < 5s   | ✅ 3-4s    |
| Full suite      | < 5s   | ✅ 1.21s   |

### If tests are slow

1. Check for `setTimeout` calls
2. Reduce file I/O (mock when possible)
3. Use smaller fixtures
4. Run tests in parallel: `pnpm test -- --reporter=dot`

## Coverage Goals

Minimum coverage by component:

| Component        | Target |
| ---------------- | ------ |
| MCP system       | ≥ 90%  |
| Registry/presets | ≥ 90%  |
| CLI commands     | ≥ 85%  |
| Filtering        | ≥ 90%  |
| Error handling   | ≥ 85%  |
| Security         | ≥ 95%  |

View coverage:

```bash
pnpm test -- --coverage
```

## Troubleshooting

| Problem                | Solution                                       |
| ---------------------- | ---------------------------------------------- |
| "Cannot find module"   | Run `pnpm install && pnpm build`               |
| "ENOENT: no such file" | Use `fs.ensureDir()` before operations         |
| "Port already in use"  | Tests should not start servers                 |
| "test timeout"         | Avoid `setTimeout`, increase timeout if needed |
| "test flaky"           | Look for timing or env pollution issues        |

## References

- **Architecture**: `agentsync-docs/55-plans/test-architecture-and-workflow-plan-0.2x-to-0.4.0.md`
- **Requirements**: `agentsync-docs/10-requirements/core-requirements.md`
- **Harness**: `tests/utils/workflow-harness.ts`
- **Scenarios**: `tests/utils/scenario-runner.ts`
- **Full Guide**: `TESTING.md`

## Contributing

When adding tests:

1. Read this guide
2. Check existing test patterns
3. Ensure cleanup in `afterEach()`
4. Verify test passes locally
5. Check coverage hasn't dropped

Questions? Check `TESTING.md` or see example tests in:

- `tests/unit/commands/mcp/sync.test.ts`
- `tests/workflows/mcp-basic.test.ts`
