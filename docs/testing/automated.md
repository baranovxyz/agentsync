# Automated Testing

> **Parent:** [Testing Strategy](../../TESTING.md)

This document covers automated testing using Vitest and BATS.

---

## Overview

AgentSync uses two automated testing frameworks:

1. **Vitest** - Primary test framework (125 tests, ~2s)
2. **BATS** - Shell script testing (26 tests, ~5s, optional)

**Total**: 151 automated tests, >90% code coverage

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
│   └── commands/mcp/      # MCP commands (28 tests)
│       ├── sync.test.ts
│       ├── list.test.ts
│       ├── add.test.ts
│       └── remove.test.ts
├── integration/targets/   # Target integration (16 tests)
│   ├── cursor-target.test.ts
│   └── claude-target.test.ts
└── e2e/                   # End-to-end (43 tests)
    ├── mcp-workflow.test.ts
    └── cli-shell.test.ts
```

### Coverage by Module

| Module | Tests | Coverage | Status |
|--------|-------|----------|--------|
| MCP Core | 38 | 95% | ✅ |
| MCP Commands | 28 | 92% | ✅ |
| Targets | 16 | 90% | ✅ |
| E2E Workflows | 5 | - | ✅ |
| Shell Execution | 24 | - | ✅ |
| Init Command | 14 | 85% | ✅ |
| **Total** | **125** | **>90%** | ✅ |

### Running Specific Tests

```bash
# MCP tests only
pnpm test tests/unit/core/mcp/ tests/integration/targets/ tests/unit/commands/mcp/

# E2E tests only
pnpm test:e2e

# Shell tests only
pnpm test:shell

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
- Clean up after tests
- Test both success and error cases

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
| Vitest (all) | 125 | ~2.2s | 🚀 Fast |
| Shell (Vitest) | 24 | ~1.7s | 🚀 Fast |
| BATS | 26 | ~5.0s | ⚡ Good |
| **Total** | **151** | **~9s** | 🚀 Fast |

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
