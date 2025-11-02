# Testing

AgentSync uses a comprehensive testing strategy with multiple layers. See [TESTING.md](../TESTING.md) for overview.

## Quick Start

```bash
# Run all tests
pnpm test

# Watch mode (dev)
pnpm test:watch

# Coverage report (target: >80%)
pnpm test:coverage

# E2E tests only
pnpm test:e2e

# Shell tests (Vitest + execa)
pnpm test:shell

# BATS tests (optional, requires installation)
pnpm test:bats
```

## Test Architecture

AgentSync uses three complementary testing approaches:

### 1. Vitest (Primary)

Fast, comprehensive unit and integration tests with >90% code coverage.

```
tests/
├── unit/              # Unit tests for core logic
│   ├── core/mcp/      # MCP system (38 tests)
│   ├── commands/      # CLI commands (28 tests)
│   └── utils/         # Utilities (12 tests)
├── workflows/         # Integration workflows (5 tests)
└── e2e/
    ├── cli-shell.test.ts      # Shell execution (24 tests)
    └── install-test.test.ts   # Package validation (17 tests)
```

**Key features:**

- Parallel execution
- Coverage reporting (>90%)
- Snapshot testing for CLI output
- Process cleanup tracking

**Writing tests:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("Feature", () => {
  beforeEach(async () => {
    // Setup temp dirs, mock registry
  });

  it("does something", async () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

See test files in `tests/` for working examples.

### 2. Shell Tests (Vitest + execa)

Tests CLI execution in real shell environments using Node.js `execa`.

**Why shell testing?**

- Validates built CLI (`dist/cli.js`)
- Tests shebang execution
- Verifies exit codes and terminal output
- Cross-platform compatibility

**Example:**

```typescript
import { execa } from "execa";

it("executes --version", async () => {
  const { stdout, exitCode } = await execa("node", [cliPath, "--version"]);
  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
});
```

### 3. BATS (Optional)

Bash Automated Testing System for true shell validation.

**Installation:**

```bash
brew install bats-core          # macOS
sudo apt-get install -y bats    # Ubuntu
```

**When to use:**

- Shell-specific behavior validation
- Manual verification
- Cross-shell testing (bash vs zsh)

**Example:**

```bash
@test "CLI shows version" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]
}
```

See `tests/shell/cli.bats` for complete test suite.

## Test Coverage

AgentSync maintains comprehensive test coverage across all major modules:

- **MCP Core**: High coverage (>90%) of MCP configuration, merging, and registry operations
- **MCP Commands**: Thorough testing of CLI commands (add, list, remove)
- **Targets**: Codec validation for all supported tools (Cursor, Claude, Cline, RooCode)
- **Shell Execution**: CLI validation in real shell environments
- **Install/Package**: Production package validation
- **Init Command**: Template initialization workflows

**Overall Coverage**: >90% across the codebase

## Install Test (Production Package Validation)

Validates the complete `pnpm pack` → `npm install -g` workflow.

**What it tests:**

- Tarball creation and size (<5MB)
- Global installation
- Full MCP workflow (add, sync, remove)
- Init command with templates
- Error handling

**When to run:**

- Before publishing to npm
- After packaging changes
- Weekly (automated in CI)

**Note:** Slower (~30-60s) than unit tests. Not for daily development.

File: `tests/e2e/install-test.test.ts`

## Snapshot Testing

CLI output snapshots prevent UX regressions.

```bash
# Run snapshot tests
pnpm test tests/unit/cli-output-snapshots.test.ts

# Update snapshots (after intentional changes)
pnpm test tests/unit/cli-output-snapshots.test.ts -- -u
```

**Good candidates:** `--help` output, error messages, formatted tables
**Avoid:** Timestamps, random IDs, temp paths (normalize first)

## Process Cleanup

Tests track spawned processes to prevent zombies.

```typescript
import { processTracker } from "../utils/process-tracker.js";

afterEach(async () => {
  await processTracker.killAll(); // Cleanup all tracked processes
});

it("spawns process", () => {
  const proc = spawn("sleep", ["10"]);
  processTracker.track(proc); // Auto-killed in afterEach
});
```

## CI/CD Integration

Tests run on 9 platforms: Ubuntu/macOS/Windows × Node 18/20/22

```yaml
# GitHub Actions
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: pnpm test # Vitest tests
- run: pnpm test:shell # Shell tests

# Optional: BATS (Linux/macOS only)
- name: Install BATS
  if: runner.os != 'Windows'
  run: |
    if [ "$RUNNER_OS" == "Linux" ]; then
      sudo apt-get install -y bats
    else
      brew install bats-core
    fi
- run: pnpm test:bats
```

**CI Notes:**

- All workflows use `--frozen-lockfile`
- Hierarchical timeouts: 5s unit, 10s integration (2x on CI)
- Windows requires both `HOME` and `USERPROFILE` env vars
- Install test runs weekly, not on every PR (saves CI minutes)

## Performance

| Test Suite                | Duration      | Use Case            |
| ------------------------- | ------------- | ------------------- |
| Vitest (unit/integration) | Fast (~2s)    | Daily development   |
| Shell (Vitest + execa)    | Fast (~2s)    | CLI validation      |
| Install Test (E2E)        | Slow (30-60s) | Pre-release         |
| BATS (optional)           | Medium (~5s)  | Manual verification |

## Troubleshooting

**Tests fail: "CLI not built"**

```bash
pnpm build
ls -la dist/cli.js  # Verify shebang: #!/usr/bin/env node
```

**Permission denied**

```bash
chmod +x dist/cli.js
pnpm build
```

**Coverage below threshold**

```bash
pnpm test:coverage
open coverage/index.html
```

**BATS not found**

```bash
brew install bats-core          # macOS
sudo apt-get install -y bats    # Ubuntu
bats --version                  # Verify
```

## Cross-Platform Testing

- macOS/Linux: Full test suite including shebang and permissions
- Windows: Via WSL, some tests skipped (platform-specific features)
- Set both `HOME` and `USERPROFILE` on Windows for `os.homedir()`
- Retry cleanup on Windows file locks

## Best Practices

1. **Use temp directories** - Isolate test environments
2. **Clean up properly** - Use `afterEach` and process tracker
3. **Test both success and errors** - Don't just test happy paths
4. **Reference working tests** - See `tests/` for examples
5. **Keep tests fast** - Mock external dependencies
6. **Use snapshots wisely** - For stable CLI output only
