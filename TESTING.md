# Testing

Quick reference for running tests.

## Run all tests

```bash
pnpm test
```

## Common commands

```bash
# Run specific file
pnpm test -- tests/workflows/mcp-basic.test.ts

# Run matching pattern
pnpm test -- --grep "MCP"

# Generate coverage report
pnpm test -- --coverage

# Test specific suite
pnpm test -- tests/unit/
pnpm test -- tests/workflows/
pnpm test:e2e                         # E2E only
pnpm test:bats                        # BATS CLI tests (requires bats-core)
```

## Test structure

- **Unit**: Pure logic (fast, no I/O)
- **Workflows**: Realistic CLI flows (in-process)
- **E2E**: Packaging validation (CI-only)
- **BATS**: Shell-based CLI tests (requires [bats-core](https://github.com/bats-core/bats-core))

For test architecture, examples, and best practices see: **docs/testing.md**
