# Shell Testing Implementation

> **Parent:** [Testing Strategy](../../TESTING.md)

This document covers shell testing implementation for AgentSync CLI, including both Vitest + execa and BATS approaches.

---

## Overview

Shell testing ensures the AgentSync CLI works correctly when executed in real bash/zsh environments, not just via programmatic API calls.

**Implementation Date:** 2025-10-18
**Status:** ✅ Complete
**Test Count:** 50 shell tests (24 Vitest + 26 BATS)
**Execution Time:** ~7 seconds total

---

## Why Shell Testing?

The original test suite only used programmatic TypeScript/Vitest tests. This didn't verify:

- ❌ `npx agentsync` execution
- ❌ Built CLI (`dist/cli.js`) works in real shells
- ❌ Shebang (`#!/usr/bin/env node`) execution
- ❌ Cross-platform shell compatibility (bash vs zsh)
- ❌ Error messages display correctly in terminals
- ❌ Exit codes work as expected

**Shell testing catches:**
- Build issues (missing shebang, wrong permissions)
- Terminal output problems (colors, formatting)
- Cross-platform incompatibilities
- Real user experience issues

---

## Dual Testing Strategy

We use two complementary approaches:

### 1. Vitest + Execa (Primary)

**Technology:** Node.js Vitest with `execa` for process spawning
**Tests:** 24 tests
**Speed:** ~1.7s
**File:** `tests/e2e/cli-shell.test.ts`

**Pros:**
- ✅ Zero additional dependencies (uses Node.js)
- ✅ Fast execution
- ✅ Integrated into existing test suite
- ✅ Cross-platform (macOS, Linux, Windows)
- ✅ TypeScript support
- ✅ Coverage reporting

**Cons:**
- ⚠️ Not "true" shell environment (Node.js child_process)

### 2. BATS (Optional)

**Technology:** Bash Automated Testing System
**Tests:** 26 tests
**Speed:** ~5s
**File:** `tests/shell/cli.bats`

**Pros:**
- ✅ Tests in actual bash/zsh shell
- ✅ TAP output for CI integration
- ✅ Shell-native syntax

**Cons:**
- ❌ Requires separate installation
- ❌ Slower execution

---

## Test Coverage

### Vitest + Execa (24 tests)

#### Basic CLI (6 tests)
- ✅ `agentsync --version`
- ✅ `agentsync --help`
- ✅ Unknown command errors
- ✅ Shebang execution (`./dist/cli.js`)
- ✅ Error handling
- ✅ Direct execution

#### MCP Commands (7 tests)
- ✅ `mcp list` - Show available MCPs
- ✅ `mcp add` - Add MCP to project
- ✅ `mcp sync` - Sync to targets
- ✅ `mcp sync --dry-run` - Preview mode
- ✅ `mcp sync --tool cursor` - Specific tool
- ✅ `mcp remove` - Remove MCP
- ✅ Missing registry handling

#### Error Handling (4 tests)
- ✅ Missing MCP registry
- ✅ Missing environment variables
- ✅ Invalid JSON configuration
- ✅ File permission errors

#### Cross-Platform (3 tests)
- ✅ Line ending compatibility
- ✅ Spaces in paths
- ✅ HOME environment variable

#### Exit Codes (3 tests)
- ✅ Success (0)
- ✅ Errors (non-zero)
- ✅ Missing arguments

#### Output Formatting (3 tests)
- ✅ UTF-8 encoding
- ✅ stdout vs stderr
- ✅ Error message formatting

### BATS (26 tests)

Similar coverage to Vitest tests plus:
- ✅ Full workflow integration tests
- ✅ Multiple MCPs support
- ✅ Shell-specific behavior validation

**See:** [Automated Testing](automated.md) for BATS details

---

## Running Shell Tests

### Vitest + Execa (Recommended)

```bash
# Run shell tests
pnpm test:shell

# With coverage
pnpm test:coverage

# Watch mode
pnpm test:watch -- tests/e2e/cli-shell.test.ts

# Run specific test
pnpm test:shell -t "executes --version"
```

### BATS (Optional)

```bash
# Install BATS first
brew install bats-core  # macOS
sudo apt-get install -y bats  # Ubuntu

# Run all BATS tests
pnpm test:bats

# Or directly
bats tests/shell/cli.bats

# Specific test
bats tests/shell/cli.bats --filter "version"

# TAP output
bats --tap tests/shell/cli.bats

# Verbose
bats --verbose-run tests/shell/cli.bats
```

---

## Implementation Details

### Vitest + Execa Example

```typescript
import { execa } from 'execa';

it('executes --version flag successfully', async () => {
  const { stdout, exitCode } = await execa('node', [cliPath, '--version']);

  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
});

it('handles errors gracefully', async () => {
  try {
    await execa('node', [cliPath, 'invalid-command']);
    expect.fail('Should have thrown');
  } catch (error: any) {
    expect(error.exitCode).not.toBe(0);
    expect(error.stderr || error.stdout).toContain('error');
  }
});
```

**Key features:**
- Uses `execa` to spawn real Node.js processes
- Captures stdout, stderr, and exit codes
- Tests actual CLI execution
- Runs in isolated temp directories
- Fast and reliable

### BATS Example

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

**Key features:**
- Native bash/zsh execution
- TAP output format
- `run` helper captures output and exit code
- Pattern matching with `[[ ]]`

---

## Test Fixtures and Helpers

### Vitest Setup

```typescript
beforeEach(async () => {
  // Create temp directory
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-test-'));
  originalCwd = process.cwd();
  process.chdir(tempDir);

  // Create target directories
  await fs.ensureDir('.cursor');
  await fs.ensureDir('.claude');

  // Setup env
  tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-home-'));
  originalHome = process.env.HOME;
  process.env.HOME = tempHomeDir;
});

afterEach(async () => {
  process.chdir(originalCwd);
  process.env.HOME = originalHome;
  await fs.remove(tempDir);
  await fs.remove(tempHomeDir);
});
```

### BATS Setup

```bash
setup() {
  # Create temp directories
  export TEST_TEMP_DIR="$(mktemp -d)"
  export ORIGINAL_PWD="$PWD"
  cd "$TEST_TEMP_DIR"

  # Create temp home
  export ORIGINAL_HOME="$HOME"
  export HOME="$(mktemp -d)"

  # Setup registry
  mkdir -p "$HOME/.agentsync"
  cat > "$HOME/.agentsync/mcp.json" <<EOF
  {"github": {...}}
  EOF
}

teardown() {
  cd "$ORIGINAL_PWD"
  export HOME="$ORIGINAL_HOME"
  rm -rf "$TEST_TEMP_DIR"
}
```

---

## Performance

| Test Suite | Tests | Duration | Speed |
|------------|-------|----------|-------|
| Vitest (shell) | 24 | ~1.7s | 🚀 Fast |
| BATS | 26 | ~5.0s | ⚡ Good |
| **Total** | **50** | **~7s** | 🚀 Fast |

**Why Vitest is faster:**
- Parallel execution
- Optimized process spawning
- No shell interpreter overhead
- Better caching

---

## CI/CD Integration

### GitHub Actions (Vitest)

```yaml
- name: Run shell tests
  run: pnpm test:shell
```

**Always runs** - no additional installation needed

### GitHub Actions (BATS)

```yaml
- name: Install BATS (Ubuntu)
  if: matrix.os == 'ubuntu-latest'
  run: sudo apt-get install -y bats

- name: Install BATS (macOS)
  if: matrix.os == 'macos-latest'
  run: brew install bats-core

- name: Run BATS tests
  run: pnpm test:bats
```

**Optional** - requires BATS installation

**See:** [Automated Testing - CI/CD](automated.md#cicd) for complete workflow

---

## Cross-Platform Considerations

### What's Tested

✅ **macOS (Darwin)**
- Bash and zsh execution
- Shebang handling
- File permissions

✅ **Linux (Ubuntu/Debian)**
- Bash execution
- Package management differences
- Path handling

⚠️ **Windows (WSL)**
- Via WSL bash
- Some tests skipped (permissions, shebang)

### Platform-Specific Tests

```typescript
it('executes via shebang (Unix only)', async () => {
  if (process.platform === 'win32') {
    return;  // Skip on Windows
  }

  const { exitCode } = await execa(cliPath, ['--version']);
  expect(exitCode).toBe(0);
});
```

```bash
@test "handles permissions (Unix only)" {
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    skip "Permission test not applicable on Windows"
  fi

  chmod 444 .cursor
  run node "$CLI" mcp sync
  [ "$status" -ne 0 ]
}
```

---

## Troubleshooting

### Tests Fail: "CLI not built"

```bash
# Build first
pnpm build

# Verify
ls -la dist/cli.js
head -1 dist/cli.js  # Should show: #!/usr/bin/env node
```

### Permission Denied

```bash
# Fix permissions
chmod +x dist/cli.js

# Rebuild to ensure shebang
pnpm build
```

### BATS Not Found

```bash
# Install BATS
brew install bats-core  # macOS
sudo apt-get install -y bats  # Ubuntu

# Verify
bats --version
which bats
```

### Tests Timeout

```bash
# Increase timeout in test file
await execa('node', [cliPath, 'command'], {
  timeout: 30000  // 30 seconds
});
```

---

## When to Use Each

### Use Vitest + Execa

✅ **For:**
- Daily development
- Fast iteration
- CI/CD pipelines
- Coverage reporting
- Debugging

✅ **Always run:** `pnpm test:shell`

### Use BATS

✅ **For:**
- Shell-specific validation
- Manual verification
- Cross-shell testing (bash vs zsh)
- TAP output requirements

✅ **Optional:** `pnpm test:bats`

---

## Key Learnings

1. **Execa is ideal for CLI testing**
   - Clean stdout/stderr separation
   - Proper exit code handling
   - Cross-platform support

2. **Temp directories are essential**
   - Prevents test interference
   - Easy cleanup
   - Parallel execution safe

3. **Test real CLI, not just APIs**
   - Catches build issues
   - Validates user experience
   - Ensures production readiness

4. **Both approaches complement each other**
   - Vitest for speed
   - BATS for validation
   - Together: comprehensive coverage

---

## Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `tests/e2e/cli-shell.test.ts` | Vitest shell tests | 371 |
| `tests/shell/cli.bats` | BATS shell tests | 350 |
| `tests/shell/README.md` | Shell testing guide | 291 |
| `package.json` | Test scripts | +2 |

---

## Dependencies

```json
{
  "devDependencies": {
    "execa": "9.6.0"  // For Vitest shell tests
  }
}
```

**BATS:** Optional, install via brew/apt (not in package.json)

---

**See also:**
- [Automated Testing](automated.md) - Vitest and BATS details
- [Testing Strategy](../../TESTING.md) - Overview
- [tests/shell/README.md](../../tests/shell/README.md) - Detailed BATS guide
