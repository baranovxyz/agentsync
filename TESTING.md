# Testing Strategy

> **Quick Links:** [Automated Tests](#automated-testing) · [E2E Tests](#e2e-testing) · [Pre-Release Checklist](#pre-release-checklist) · [Detailed Docs](docs/testing/)

## Overview

AgentSync uses a comprehensive, fully-automated testing strategy to ensure CLI reliability, UX quality, and production readiness.

**Test Philosophy:**

- **Unit tests** catch regressions and validate functionality
- **Integration tests** ensure components work together
- **E2E tests** validate complete workflows and production package
- **Shell tests** verify real-world CLI execution
- **All tests automated** - no manual testing required

## Architecture-First Testing

When fixing architectural issues, follow these principles:

- **Identify root cause before fixing symptoms** - architectural mismatches often hide behind passing mocks
- **Use real file system operations** in integration tests instead of mocking when testing file system interactions
- **Create helper functions** for common file operations in tests for consistency with implementation
- **When tests pass with mocks but fail in real usage**, investigate architectural consistency

---

## Quick Start

```bash
# Install and build
pnpm install
pnpm build

# Run all automated tests (~10 seconds)
pnpm test

# Run specific test suites
pnpm test:shell      # Shell execution tests (Vitest + execa)
pnpm test:bats       # Shell script tests (BATS)
pnpm test:coverage   # With coverage report

# Run critical tests before release
pnpm test                                    # All tests (unit + integration + E2E)
pnpm test tests/e2e/install-test.test.ts   # Production package validation
```

---

## Test Types

| Type                             | Count   | Speed   | Coverage | Purpose                     | Documentation                                                                        |
| -------------------------------- | ------- | ------- | -------- | --------------------------- | ------------------------------------------------------------------------------------ |
| **Vitest (Unit/Integration)**    | 166     | ~2s     | >90%     | Core functionality          | [automated.md](docs/testing/automated.md)                                            |
| **E2E Workflow Tests**           | 5       | ~1s     | -        | MCP lifecycle               | [automated.md](docs/testing/automated.md#e2e-workflow-tests)                         |
| **E2E Error Scenarios**          | 11      | ~1s     | -        | Edge cases & errors         | [automated.md](docs/testing/automated.md#e2e-error-scenarios)                        |
| **Install Test (Production)**    | 22      | ~30-60s | -        | Package validation + new UX | [automated.md](docs/testing/automated.md#install-test-production-package-validation) |
| **Shell Tests (Vitest + execa)** | 24      | ~2s     | -        | Real CLI execution          | [shell-implementation.md](docs/testing/shell-implementation.md)                      |
| **BATS (Shell Scripts)**         | 26      | ~5s     | -        | Shell validation            | [shell-implementation.md](docs/testing/shell-implementation.md)                      |
| **Total**                        | **207** | ~10s    | >90%     | Complete coverage           | -                                                                                    |

**All tests are automated** - no manual testing required. E2E tests cover all workflows previously done manually.

---

## Test Design Best Practices

### Natural Flow Over Manual Setup

**Key principle:** Tests should follow user workflows, not bypass them with manual file creation.

**❌ Avoid:**

```typescript
// Manual setup bypasses user workflow
await fs.writeFile(".agentsync/config.json", "{invalid json}");
```

**✅ Prefer:**

```typescript
// Natural user workflow
await initializeProject();
await fs.writeFile(".agentsync/config.json", "{invalid json}");
```

### Helper Functions for Common Setup

Create reusable helper functions for common test setup patterns:

```typescript
async function initializeProject(options = {}) {
  const { template = "default", tools = ["cursor"] } = options;
  const { exitCode } = await execaCli([
    "init",
    "--template",
    template,
    "--tools",
    tools.join(","),
  ]);
  expect(exitCode).toBe(0);
  const configExists = await fs.pathExists(".agentsync/config.json");
  expect(configExists).toBe(true);
}
```

### E2E Test Environment Requirements

E2E tests require complete CLI environment setup:

- **Required files:** `dist/`, `package.json`, `templates/`, `node_modules/`
- **Templates directory:** Required for `init` command to work properly
- **Node modules:** Use symlink approach due to ESM limitations

---

## Module Resolution Testing Patterns

### Vitest Configuration Requirements

When working with TypeScript projects, ensure proper module resolution:

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "include": ["src/**/*", "tests/**/*"]
  }
}
```

**vitest.config.ts:**

```typescript
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

### Troubleshooting "Cannot find module" Errors

**Common Issues:**

- Tests importing with `.js` extensions (bad practice)
- Missing `@` alias configuration
- Incorrect `moduleResolution` setting

**Solutions:**

1. Use `@` alias for all test imports: `import { something } from "@/path/to/module"`
2. Configure `tsconfig.json` with `"moduleResolution": "node"`
3. Include tests in TypeScript compilation: `"include": ["src/**/*", "tests/**/*"]`
4. Update Vitest config with proper alias resolution

**Pattern:**

```typescript
// ✅ Correct
import { UserPresetRegistry } from "@/core/registry/user-preset-registry";

// ❌ Avoid
import { UserPresetRegistry } from "../../../src/core/registry/user-preset-registry.js";
```

### Major Refactoring Test Strategy

When performing major architecture changes:

1. **Focus on Critical Tests First**: Error handling, core functionality
2. **Fix Module Resolution Systematically**: Update all imports to use `@` alias
3. **Expect 75-80% Pass Rate**: During major refactoring, some tests will fail due to API changes
4. **Update Test Expectations**: Match new error handling patterns and API behavior
5. **Preserve Test Coverage**: Maintain >80% coverage target throughout refactoring

### Error Handling Test Updates

When migrating to unified error handling:

**Before (Specific Error Types):**

```typescript
await expect(function()).rejects.toThrow(ConfigError);
```

**After (Unified Error Wrapping):**

```typescript
await expect(function()).rejects.toThrow(AgentSyncError);
```

**Pattern for Error Message Testing:**

```typescript
try {
  await function();
} catch (error) {
  expect(error).toBeInstanceOf(AgentSyncError);
  if (error instanceof AgentSyncError) {
    expect(error.getUserMessage()).toContain("expected message");
  }
}
```

---

## Automated Testing

### Vitest (Primary)

Fast, comprehensive unit and integration tests.

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

**What's tested:**

- ✅ MCP commands (list, add, sync, remove)
- ✅ Token substitution
- ✅ Configuration loading
- ✅ Target detection (Cursor, Claude)
- ✅ Error handling
- ✅ File operations

### Shell Testing

Tests real CLI execution in bash/zsh environments.

```bash
# Vitest + execa (recommended)
pnpm test:shell

# BATS (optional, requires installation)
brew install bats-core
pnpm test:bats
```

**What's tested:**

- ✅ `agentsync --version`, `--help`
- ✅ Shebang execution (`#!/usr/bin/env node`)
- ✅ Exit codes (0 for success, non-zero for errors)
- ✅ Error messages in terminal
- ✅ Cross-platform compatibility

**Details:** [docs/testing/shell-implementation.md](docs/testing/shell-implementation.md)

### Handling Preset Updates

When major dependencies are updated, common issues include:

**fs-extra v11+ Migration:**

- Removed: `readJson`, `writeJson`
- Solution: Use native `node:fs/promises` + manual JSON parsing
- Test mocks must include all methods used (add `outputFile` to vi.mock)
- Helper pattern for E2E tests:
  ```typescript
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(
      filePath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
  }
  ```

**Test Isolation:**

- Copy production artifacts (dist/, package.json) to temp directories
- Use `beforeAll` for expensive setup (CLI copying), `beforeEach` for test-specific setup
- Clean up shared resources only in `afterAll`, not `afterEach`

---

## E2E Testing

Comprehensive end-to-end tests covering complete workflows and error scenarios.

**Test Files:**

- `tests/e2e/mcp-workflow.test.ts` - Complete MCP lifecycle (add → sync → remove)
- `tests/e2e/error-scenarios.test.ts` - Edge cases and error handling
- `tests/e2e/install-test.test.ts` - Production package validation

**Workflow Tests** (5 tests):

- Complete MCP lifecycle workflow
- Token substitution in real files
- Multi-tool sync
- Tool-specific sync (--tool flag)
- Dry-run mode validation
- Removing last MCP (empty config)

**Error Scenarios** (11 tests):

- Invalid MCP names
- Duplicate MCP addition
- Removing non-existent MCPs
- Missing environment variables
- No target directories
- Spaces in paths
- Invalid JSON recovery
- Permission errors (Unix only)
- Empty global registry
- Auto-creating missing config

**Run:**

```bash
# Run all E2E tests
pnpm test tests/e2e/

# Run specific E2E test file
pnpm test tests/e2e/mcp-workflow.test.ts
pnpm test tests/e2e/error-scenarios.test.ts
pnpm test tests/e2e/install-test.test.ts
```

**Benefits:**

- ✅ Fully automated - no human intervention
- ✅ Consistent results
- ✅ Fast execution (~10s total)
- ✅ Runs in CI on every commit
- ✅ Covers all workflows previously done manually

---

## Pre-Release Checklist

Before publishing to npm:

### 1. Automated Tests ✅

- [ ] All tests pass: `pnpm test` (207 tests)
- [ ] E2E tests pass: `pnpm test tests/e2e/`
- [ ] Shell tests pass: `pnpm test:shell`
- [ ] Install test passes: `pnpm test tests/e2e/install-test.test.ts`
- [ ] BATS tests pass: `pnpm test:bats` (if installed)
- [ ] Coverage >80%: `pnpm test:coverage`
- [ ] No TypeScript errors: `pnpm lint`

**All testing is automated** - no manual steps required!

### 2. Build & Package ✅

- [ ] Clean build: `rm -rf dist && pnpm build`
- [ ] Install test passes (validates tarball creation & installation)
- [ ] ~~Pack tarball manually~~ (install test does this)
- [ ] ~~Install from tarball~~ (install test does this)

### 4. Documentation ✅

- [ ] README.md updated
- [ ] CHANGELOG.md updated with version changes
- [ ] Version number correct in `package.json`
- [ ] Examples work correctly

### 5. Git ✅

- [ ] All changes committed
- [ ] Git status clean
- [ ] Ensure on main branch after PR merge
- [ ] Verify branch cleanup: `git branch` should show `* main`
- [ ] Confirm up to date: `git status` should show "up to date with origin/main"
- [ ] Create tag: `git tag v0.2.0-alpha.2`
- [ ] Push tag: `git push --tags`

### 6. Publish ✅

```bash
# Dry run (verify what will be published)
npm publish --dry-run

# Actually publish
npm publish

# Or for alpha/beta
npm publish --tag alpha
```

---

## Troubleshooting

### Tests Failing

```bash
# Clean install
rm -rf node_modules dist
pnpm install
pnpm build
pnpm test
```

### Shell Tests Not Working

```bash
# Rebuild CLI
pnpm build

# Check executable
chmod +x dist/cli.js
head -1 dist/cli.js  # Should show: #!/usr/bin/env node
```

### BATS Not Found

```bash
# Install BATS
brew install bats-core  # macOS
sudo apt-get install -y bats  # Ubuntu
```

---

## Documentation

- **[Automated Testing](docs/testing/automated.md)** - Vitest and BATS details
- **[Shell Implementation](docs/testing/shell-implementation.md)** - Shell testing deep dive
- **E2E Tests** - See `tests/e2e/` for workflow and error scenario tests

---

## CI/CD Integration

Tests run automatically in GitHub Actions:

```yaml
# .github/workflows/test.yml
- run: pnpm test
- run: pnpm test:shell
- run: pnpm test:coverage
```

**Example workflow:** [docs/testing/automated.md#cicd](docs/testing/automated.md#cicd)

---

## Contributing

When adding new features:

1. ✅ Write unit tests (Vitest)
2. ✅ Add E2E tests for new workflows
3. ✅ Add shell tests if CLI-related
4. ✅ Ensure all tests pass: `pnpm test`
5. ✅ Document testing approach

**Test Coverage Requirements:**

- Unit tests for all new functions
- E2E tests for user-facing workflows
- Error scenario tests for edge cases
- All tests automated (no manual steps)

## Refactoring Testing

**After Code Refactoring:**

- Run specific test files for modified functions
- Verify functionality is preserved: `pnpm test tests/unit/commands/[module]/[file].test.ts`
- Ensure all tests pass before proceeding with further changes
- Focus on unit tests for modified files to catch regressions early

**Pattern:**

```bash
# Test specific module after refactoring
pnpm test tests/unit/commands/mcp/add.test.ts

# Verify broader functionality
pnpm test tests/unit/commands/mcp/
```

---

**Version**: 0.2.0-alpha.2
**Last Updated**: 2025-10-18
**Test Coverage**: 90%+ (MCP v0.2.0-alpha)
