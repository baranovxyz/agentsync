# AgentSync Testing Strategy (0.2.x → 0.4.0)

This document describes the test architecture and strategy for AgentSync, aligned with the roadmap and core requirements.

## Overview

AgentSync uses a **three-tier testing pyramid** designed for stability, speed, and maintainability.

### Guiding Principles

- Test user-visible contracts via CLI, but run in-process for stability
- Prefer structured data assertions (JSON/objects) over free-form strings
- Use declarative fixtures and scenario files for reproducible tests
- Ensure determinism: freeze time, normalize paths/newlines, sanitize nondeterministic output
- Keep true E2E smoke suite minimal (CI-only); focus on workflows

### Architecture

```
       ┌─────────────────────┐
       │  E2E Smoke (CI)     │  Packaging & shebang validation
       ├─────────────────────┤
       │ Workflows (14)      │  In-process CLI tests, fast & stable
       ├─────────────────────┤
       │  Unit (425+)        │  Logic validation, fast feedback
       └─────────────────────┘
```

## Test Tiers

### Unit Tests (Fast, Isolated)

**Location**: `tests/unit/`

**Purpose**: Test pure logic with minimal filesystem/process dependencies

**Examples**:

- Token substitution: `tests/unit/core/mcp/tokens.test.ts`
- Merger logic: `tests/unit/core/registry/merger.test.ts`
- Schema validation: `tests/unit/types/schemas.test.ts`
- Security scanners: `tests/unit/security/`

**Contract**: Strong typed APIs, deterministic outputs

**Performance**: < 5 seconds for full unit suite

### Workflow Tests (Fast, Integrated)

**Location**: `tests/workflows/`

**Purpose**: Test complete user workflows in-process without spawning

**Key Features**:

- No shebang/permissions issues
- Deterministic across all platforms
- Fast (in-process execution)
- Realistic behavior testing

**Examples**:

- `tests/workflows/mcp-basic.test.ts` - Complete MCP workflow

**Implementation Pattern**:

```typescript
import { runCli, assertSuccess } from "../utils/workflow-harness.js";

// Add MCP
const result = await runCli(["mcp", "add", "github"], {
  cwd: projectDir,
  env: { HOME: homeDir },
});
assertSuccess(result);

// Verify configuration
const config = await fs.readJson(
  path.join(projectDir, ".agentsync", "config.json")
);
expect(config.mcpServers).toContain("github");
```

**Performance**: ~40ms per test

### E2E Smoke Tests (Slow, Minimal Validation)

**Location**: `tests/e2e/`

**Purpose**: Validate packaging only. Ensure tarball builds, contains correct version, and CLI shebang/permissions are correct.

**Scope**: Minimal (≤ 4 tests). Installation/runtime path behaviors are covered by BATS.

Note: If BATS runs across all CI platforms (macOS, Linux, Windows), this E2E suite may be disabled entirely; in that case ensure BATS validates packaging (shebang + exec-bit) and global PATH behavior.

**Examples**:

- `tests/e2e/version-smoke.test.ts` - Packaging and shebang checks only

---

## Infrastructure

### Workflow Harness (`tests/utils/workflow-harness.ts`)

Run CLI commands in-process without spawning:

```typescript
// Run command with custom environment
const result = await runCli(["mcp", "list"], {
  cwd: projectDir,
  env: { HOME: homeDir },
});

// Check results
if (result.exitCode === 0) {
  expect(result.stdout).toContain("github");
}
```

**Features**:

- Environment variable isolation
- Working directory control
- Output capture
- Exit code handling
- Path normalization

### Scenario Runner (`tests/utils/scenario-runner.ts`)

Declarative YAML-based test scenarios:

```yaml
name: MCP Workflow
setup:
  project:
    files:
      .cursor/.placeholder: ""
  home:
    files:
      .agentsync/mcp.json: |
        { "github": { "command": "npx", ... } }
  env:
    GITHUB_TOKEN: ghp_test
steps:
  - run: ["mcp", "add", "github"]
    expect:
      exitCode: 0
  - run: ["mcp", "sync"]
assert:
  files:
    .cursor/mcp.json: json
```

---

## Determinism & Stability

### Environment Isolation

Each test runs in isolation:

- Separate temp directories for project and home
- Environment variables reset after each test
- No global state pollution

### Path Normalization

Output is normalized for assertions:

- Temp paths replaced with `<PROJECT>`, `<HOME>` placeholders
- Line endings normalized (CRLF → LF)
- Trailing whitespace removed

### Time Stability

Tests don't depend on time:

- No hardcoded durations
- No timestamp assertions
- Frozen clock in determinism utilities

---

## Test Coverage Requirements

### By Component

| Component                   | Target | Status         |
| --------------------------- | ------ | -------------- |
| MCP system                  | ≥ 90%  | ✅ Implemented |
| Registry/presets            | ≥ 90%  | ✅ Implemented |
| CLI commands                | ≥ 85%  | ✅ In progress |
| Filtering (include/exclude) | ≥ 90%  | ✅ Implemented |
| Error handling              | ≥ 85%  | ✅ Implemented |
| Security scanners           | ≥ 95%  | ✅ Implemented |

### Overall Target

**≥ 80% code coverage** across all paths

---

## Running Tests

### Run all tests

```bash
pnpm test
```

### Run specific test file

```bash
pnpm test -- tests/workflows/mcp-basic.test.ts
```

### Run tests matching pattern

```bash
pnpm test -- --grep "MCP"
```

### Run with coverage

```bash
pnpm test -- --coverage
```

### Run workflow tests only

```bash
pnpm test -- tests/workflows/
```

### Run unit tests only

```bash
pnpm test -- tests/unit/
```

---

## CI/CD Strategy

### PR Checks (Fast, Gated)

- Unit tests (all)
- Workflow tests (all)
- Coverage report
- TypeScript compilation

**Time**: < 2 minutes

### Main Branch (Comprehensive)

- Unit + Workflow tests
- Coverage validation (≥80%)
- Snapshot comparisons
- Performance regression check

**Time**: < 5 minutes

### Nightly OS Matrix

- E2E smoke tests on macOS, Linux, Windows (packaging-only)
- Shebang validation
- Permissions checks are covered by BATS shell tests
- Platform-specific PATH issues covered by BATS

**Time**: ~15 minutes (parallelized)

---

## Common Issues & Solutions

### Issue: Test fails with "Cannot find module"

**Solution**: Ensure you've run `pnpm install` and `pnpm build`

### Issue: Path-related test failures on Windows

**Solution**: Tests use path normalization. If raw paths are expected, use forward slashes.

### Issue: Environment variable test pollution

**Solution**: Always delete environment variables in `afterEach()`:

```typescript
afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});
```

### Issue: Flaky timeout tests

**Solution**: Avoid `setTimeout` in tests. Use deterministic test fixtures instead.

---

## Adding New Tests

### 1. Decide Tier

- **Unit**: Pure logic, no I/O → `tests/unit/`
- **Workflow**: User-facing flow → `tests/workflows/`
- **E2E**: Packaging/platform → `tests/e2e/`

### 2. Create Test File

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("My Feature", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it("should do something", () => {
    // Test
  });
});
```

### 3. For Workflows

Use the harness:

```typescript
import { runCli, assertSuccess } from "../utils/workflow-harness.js";

it("should add MCP", async () => {
  const result = await runCli(["mcp", "add", "github"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  assertSuccess(result);
});
```

### 4. For Scenarios

Create YAML:

```yaml
name: My Scenario
setup:
  project:
    files:
      .cursor/.placeholder: ""
steps:
  - run: ["mcp", "list"]
assert:
  files:
    .agentsync/config.json: exists
```

---

## Debugging Tests

### Print captured output

```typescript
const result = await runCli(["mcp", "list"], { cwd });
console.log("STDOUT:", result.stdout);
console.log("STDERR:", result.stderr);
console.log("Exit code:", result.exitCode);
```

### Run single test

```bash
pnpm test -- --reporter=verbose tests/workflows/mcp-basic.test.ts --grep "should complete"
```

### Watch mode (auto-rerun on change)

```bash
pnpm test -- --watch tests/workflows/
```

---

## Future Improvements

- [ ] Scenario matrix (multiple configurations)
- [ ] Golden file diffs with clear visualization
- [ ] Flake detection and alerting
- [ ] Performance regression tracking
- [ ] Mutation testing for critical paths
- [ ] Contract testing for plugin interfaces

---

## References

- Test Architecture Plan: `agentsync-docs/55-plans/test-architecture-and-workflow-plan-0.2x-to-0.4.0.md`
- Core Requirements: `agentsync-docs/10-requirements/core-requirements.md`
- Workflow Harness: `tests/utils/workflow-harness.ts`
- Scenario Runner: `tests/utils/scenario-runner.ts`
