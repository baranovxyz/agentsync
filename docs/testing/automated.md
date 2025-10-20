# Automated Testing

> **Parent:** [Testing Strategy](../../TESTING.md)

This document covers automated testing using Vitest and BATS.

---

## Overview

AgentSync uses three automated testing frameworks:

1. **Vitest** - Primary test framework (149 tests, ~2s)
2. **Install Test** - Production package validation (17 tests, ~30-60s)
3. **BATS** - Shell script testing (26 tests, ~5s, optional)

**Total**: 192 automated tests, >90% code coverage

---

## Vitest Testing

### Quick Start

```bash
# Run all tests
pnpm test

# Watch mode (dev)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Specific test file
pnpm test src/commands/mcp/sync.test.ts
```

### Test Structure

```
tests/
├── unit/
│   ├── core/mcp/          # MCP core logic (38 tests)
│   │   ├── tokens.test.ts
│   │   ├── registry.test.ts
│   │   └── config.test.ts
│   ├── commands/mcp/      # MCP commands (28 tests)
│   │   ├── sync.test.ts
│   │   ├── list.test.ts
│   │   ├── add.test.ts
│   │   └── remove.test.ts
│   ├── utils/             # Utilities (12 tests)
│   │   └── process-tracker.test.ts
│   └── cli-output-snapshots.test.ts  # CLI snapshots (12 tests)
├── integration/targets/   # Target integration (16 tests)
│   ├── cursor-target.test.ts
│   └── claude-target.test.ts
└── e2e/                   # End-to-end (60 tests)
    ├── mcp-workflow.test.ts       # Workflow tests (5 tests)
    ├── cli-shell.test.ts          # Shell execution (24 tests)
    └── install-test.test.ts       # Production package (17 tests)
```

### Coverage by Module

| Module | Tests | Coverage | Status |
|--------|-------|----------|--------|
| MCP Core | 38 | 95% | ✅ |
| MCP Commands | 28 | 92% | ✅ |
| Targets | 16 | 90% | ✅ |
| E2E Workflows | 5 | - | ✅ |
| Shell Execution | 24 | - | ✅ |
| Install/Package | 17 | - | ✅ |
| Init Command | 14 | 85% | ✅ |
| CLI Snapshots | 12 | - | ✅ |
| Process Tracker | 12 | 100% | ✅ |
| **Total** | **166** | **>90%** | ✅ |

### Running Specific Tests

```bash
# MCP tests only
pnpm test tests/unit/core/mcp/ tests/integration/targets/ tests/unit/commands/mcp/

# E2E tests only
pnpm test:e2e

# Shell tests only
pnpm test:shell

# Install test (production package validation)
pnpm test tests/e2e/install-test.test.ts

# With coverage
pnpm test:coverage

# Update snapshots
pnpm test -- -u
```

### Writing Tests

**Example test:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { syncMCP } from '../commands/mcp/sync.js';

describe('MCP Sync', () => {
  beforeEach(async () => {
    // Setup test environment
  });

  it('syncs MCPs to targets', async () => {
    // Test implementation
    await syncMCP();

    expect(result).toBeDefined();
  });
});
```

**Best practices:**
- Use `describe` for grouping related tests
- Use `beforeEach` for setup, `afterEach` for cleanup
- Create temp directories with `fs.mkdtemp`
- Clean up after tests (use process tracker for spawned processes)
- Test both success and error cases
- Use snapshots for CLI output regression testing

---

## Snapshot Testing

### Overview

Snapshot testing captures CLI output and ensures it doesn't change unexpectedly. This prevents accidental UX regressions.

### Usage

```bash
# Run snapshot tests
pnpm test tests/unit/cli-output-snapshots.test.ts

# Update snapshots (when changes are intentional)
pnpm test tests/unit/cli-output-snapshots.test.ts -- -u

# Review snapshot changes
git diff **/__snapshots__/
```

### Example

```typescript
import { execa } from 'execa';
import stripAnsi from 'strip-ansi';

it('--help output matches snapshot', async () => {
  const { stdout } = await execa('node', [cliPath, '--help']);
  const clean = stripAnsi(stdout);  // Remove ANSI color codes
  expect(clean).toMatchSnapshot();
});
```

### What to Snapshot

✅ **Good candidates:**
- `--help` output for all commands
- `--version` output
- Error messages (common errors)
- Formatted output (tables, lists)

❌ **Avoid snapshotting:**
- Timestamps
- Random IDs
- Temp file paths (normalize them first)
- Environment-specific output

### Normalizing Output

For paths or random data, normalize before snapshotting:

```typescript
let clean = stripAnsi(output);
// Normalize temp paths
clean = clean.replace(
  /\/tmp\/test-[^/]+/g,
  '/tmp/test-XXXXXX'
);
expect(clean).toMatchSnapshot();
```

---

## Process Cleanup Tracking

### Overview

The process tracker ensures all spawned processes are killed after tests, preventing zombie processes and resource leaks.

### Usage

```typescript
import { processTracker } from '../utils/process-tracker.js';

describe('My Tests', () => {
  afterEach(async () => {
    // Kill all tracked processes
    await processTracker.killAll();
  });

  it('spawns a process', () => {
    const proc = spawn('sleep', ['10']);
    processTracker.track(proc);  // Track for cleanup

    // Process will be auto-killed in afterEach
  });
});
```

### API

```typescript
// Track a process
processTracker.track(childProcess);

// Kill all tracked processes
await processTracker.killAll(signal?, timeout?);

// Get process count
processTracker.count;

// Check if empty
processTracker.isEmpty;

// Get tracked PIDs
processTracker.pids;
```

### Features

- **Graceful shutdown**: Sends SIGTERM first, waits for exit
- **Force kill**: Sends SIGKILL after timeout (default: 5s)
- **Auto-removal**: Processes removed when they exit naturally
- **Error handling**: Handles already-dead processes gracefully

---

## ShellCheck Integration

### Overview

ShellCheck ensures shell scripts follow POSIX best practices and catches common errors.

### Configuration

`.shellcheckrc`:
```bash
# Enable external sources checking
external-sources=true

# Set shell to bash
shell=bash
```

### Usage

```bash
# Check all shell scripts
find . -name "*.sh" | xargs shellcheck

# Check specific file
shellcheck scripts/build.sh

# Ignore specific warnings
shellcheck --exclude=SC2034 scripts/build.sh
```

### CI Integration

ShellCheck runs automatically in CI:

```yaml
- name: Install ShellCheck (Ubuntu only)
  if: runner.os == 'Linux'
  run: sudo apt-get install -y shellcheck

- name: Lint shell scripts
  if: runner.os == 'Linux'
  run: |
    find . -name "*.sh" -not -path "*/node_modules/*" | while read -r file; do
      shellcheck --severity=warning "$file"
    done
```

### Common Warnings

| Code | Warning | Fix |
|------|---------|-----|
| SC2086 | Unquoted variable | Use `"$var"` |
| SC2046 | Word splitting | Quote command substitution |
| SC2006 | Deprecated backticks | Use `$(command)` |
| SC2155 | Masking return value | Separate `local` and assignment |

---

## BATS Testing

### Installation

**macOS:**
```bash
brew install bats-core
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y bats
```

**Verify:**
```bash
bats --version
# Bats 1.12.0
```

### Quick Start

```bash
# Run all BATS tests
pnpm test:bats

# Or directly
bats tests/shell/cli.bats

# Specific test
bats tests/shell/cli.bats --filter "version"

# TAP output (for CI)
bats --tap tests/shell/cli.bats

# Verbose
bats --verbose-run tests/shell/cli.bats
```

### Test Structure

```bash
tests/shell/cli.bats  # 26 tests covering:
├── Basic CLI (4 tests)
│   ├── --version
│   ├── --help
│   ├── Unknown command
│   └── Shebang execution
├── MCP List (2 tests)
├── MCP Add (3 tests)
├── MCP Sync (4 tests)
├── MCP Remove (2 tests)
├── Error Handling (3 tests)
├── Exit Codes (3 tests)
├── Output (2 tests)
└── Integration (2 tests)
```

### Writing BATS Tests

**Example:**

```bash
@test "CLI shows version" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "handles errors gracefully" {
  run node "$CLI" invalid-command
  [ "$status" -ne 0 ]
}
```

**Best practices:**
- Use `run` to capture output and exit code
- Check `$status` for exit codes
- Use `[[` `]]` for pattern matching
- Clean up in `teardown()` function

### BATS vs Vitest

| Aspect | Vitest | BATS |
|--------|--------|------|
| **Speed** | ~2s | ~5s |
| **Environment** | Node.js | Real shell |
| **Integration** | Native | External |
| **Coverage** | Yes | No |
| **Primary Use** | Development | Shell validation |

**When to use BATS:**
- Validating shell-specific behavior
- Testing actual bash/zsh execution
- Manual verification
- CI cross-platform checks

**When to use Vitest:**
- Daily development
- Fast iteration
- Code coverage
- Debugging

---

## Install Test (Production Package Validation)

### Overview

The install test validates the production package by creating a tarball and installing it globally, simulating the real `npm install -g` workflow. This replaces manual QA testing and catches packaging issues before publishing.

**File**: `tests/e2e/install-test.test.ts`
**Tests**: 17 tests
**Duration**: ~30-60 seconds
**Runs**: Weekly in CI, manually before releases

### What It Tests

✅ **Package Creation**:
- Tarball generation with `pnpm pack`
- Package size validation (<5MB)
- Required files included (dist/, templates/)
- Dev files excluded (tests/, node_modules/)

✅ **Global Installation**:
- `npm install -g` succeeds
- Binary is executable
- Correct version displayed
- Help text shows correctly

✅ **Full MCP Workflow**:
- Add MCPs to project
- Sync to targets (Cursor, Claude)
- Token substitution
- Dry-run mode
- Tool-specific sync (`--tool cursor`)
- Remove MCPs

✅ **Error Handling**:
- Missing registry error
- Non-existent MCP error
- Missing environment variables
- Invalid commands

### Running Install Test

```bash
# Run install test
pnpm test tests/e2e/install-test.test.ts

# Watch mode (not recommended - too slow)
pnpm test:watch tests/e2e/install-test.test.ts
```

**Note**: This test is slower than unit tests because it:
1. Builds the project
2. Creates a tarball
3. Installs globally
4. Runs tests
5. Uninstalls and cleans up

### When to Run

✅ **Run install test**:
- Before publishing to npm
- After packaging changes (package.json, files field)
- Weekly (automated in CI)
- After major CLI changes

❌ **Don't run install test**:
- During active development (too slow)
- For every PR (runs in CI weekly)
- When testing internal APIs

### CI Integration

The install test runs on a weekly schedule and on main branch pushes:

```yaml
# .github/workflows/install-test.yml
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  push:
    branches: [main]
  workflow_dispatch:      # Manual trigger
```

**Why weekly instead of every PR?**
- Slower execution (~1-2 min per platform)
- Tests packaging, not core functionality
- Sufficient to catch issues before release

### Troubleshooting

**Test fails with "package already installed":**
```bash
# Uninstall manually
npm uninstall -g agentsync

# Re-run test
pnpm test tests/e2e/install-test.test.ts
```

**Tarball not found:**
```bash
# Ensure clean build
pnpm build

# Re-run test
pnpm test tests/e2e/install-test.test.ts
```

**Global install fails:**
```bash
# Check npm permissions
npm config get prefix

# Use npx if needed (doesn't require global install)
npx agentsync --version
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [18, 20]

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm lint

      - name: Build CLI
        run: pnpm build

      - name: Run Vitest tests
        run: pnpm test

      - name: Run shell tests
        run: pnpm test:shell

      # Optional: BATS tests
      - name: Install BATS (Ubuntu)
        if: matrix.os == 'ubuntu-latest'
        run: sudo apt-get install -y bats

      - name: Install BATS (macOS)
        if: matrix.os == 'macos-latest'
        run: brew install bats-core

      - name: Run BATS tests
        run: pnpm test:bats

      - name: Upload coverage
        if: matrix.os == 'ubuntu-latest' && matrix.node == '20'
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
```

### Test Matrix

Recommended test matrix:

| OS | Node | Vitest | Shell | BATS |
|----|------|--------|-------|------|
| Ubuntu | 18 | ✅ | ✅ | ✅ |
| Ubuntu | 20 | ✅ | ✅ | ✅ |
| macOS | 18 | ✅ | ✅ | ✅ |
| macOS | 20 | ✅ | ✅ | ✅ |

---

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run tests/e2e",
    "test:shell": "vitest run tests/e2e/cli-shell.test.ts",
    "test:bats": "bats tests/shell/cli.bats"
  }
}
```

---

## Debugging Tests

### Vitest Debugging

```bash
# Run with verbose output
DEBUG=true pnpm test

# Run single test file
pnpm test src/commands/mcp/sync.test.ts

# Run specific test
pnpm test -t "syncs MCPs to targets"

# Watch mode (auto-rerun on changes)
pnpm test:watch
```

### BATS Debugging

```bash
# Verbose run
bats --verbose-run tests/shell/cli.bats

# Trace execution
bats --trace tests/shell/cli.bats

# Print output on failure
bats --print-output-on-failure tests/shell/cli.bats

# Run specific test
bats tests/shell/cli.bats --filter "version"
```

---

## Performance

### Execution Times

| Test Suite | Tests | Duration | Speed |
|------------|-------|----------|-------|
| Vitest (unit/integration) | 149 | ~2.3s | 🚀 Fast |
| Shell (Vitest + execa) | 24 | ~1.8s | 🚀 Fast |
| Install Test (E2E) | 17 | ~30-60s | ⚡ Medium |
| BATS | 26 | ~5.0s | ⚡ Good |
| **Total** | **216** | **~40-65s** | ⚡ Good |

### Optimization Tips

1. **Use `beforeEach` wisely** - Don't repeat expensive setup
2. **Parallelize tests** - Vitest runs tests in parallel by default
3. **Mock external dependencies** - Don't make real API calls
4. **Use temp directories** - Isolate test environments
5. **Clean up properly** - Use `afterEach` for cleanup

---

## Troubleshooting

### Tests Fail Locally

```bash
# Clean install
rm -rf node_modules dist
pnpm install
pnpm build
pnpm test
```

### Coverage Below Threshold

```bash
# Check coverage report
pnpm test:coverage
open coverage/index.html

# Add tests for uncovered code
```

### BATS Not Found

```bash
# Install BATS
brew install bats-core  # macOS
sudo apt-get install -y bats  # Ubuntu

# Verify
bats --version
```

### Timeout Errors

```bash
# Increase timeout in vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 30000,  // 30 seconds
  },
});
```

---

**See also:**
- [Shell Implementation](shell-implementation.md) - Detailed shell testing guide
- [Manual Testing](manual-testing.md) - Manual test suite
- [Testing Strategy](../../TESTING.md) - Overview
