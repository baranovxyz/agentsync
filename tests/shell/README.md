# Shell Testing Documentation

This directory contains automated shell tests for the AgentSync CLI to ensure it works correctly in real shell environments (bash, zsh).

## Test Approaches

### 1. Vitest + Execa (Primary)

**Location:** `tests/e2e/cli-shell.test.ts`

**Technology:** Node.js Vitest with `execa` for shell execution

**Run:** `pnpm test:shell`

**Pros:**
- No additional dependencies beyond Node.js
- Integrated with existing Vitest test suite
- Fast execution
- Easy CI/CD integration
- Full TypeScript support
- Already part of your development workflow

**Cons:**
- Not a "true" shell environment (executes via Node.js child_process)
- Limited shell-specific feature testing

**Use Cases:**
- Primary test suite for CLI functionality
- CI/CD pipeline tests
- Cross-platform compatibility tests
- Exit code and output validation

### 2. BATS (Optional)

**Location:** `tests/shell/cli.bats`

**Technology:** Bash Automated Testing System

**Run:** `pnpm test:bats` (requires BATS installation)

**Pros:**
- Tests in actual bash/zsh shell
- Industry-standard for shell script testing
- TAP output for CI integration
- Shell-native syntax
- Better for testing shell-specific features

**Cons:**
- Requires separate BATS installation
- Not integrated into Node.js tooling
- Slower than Vitest tests

**Use Cases:**
- Manual testing in actual shell environments
- Advanced shell compatibility testing
- CI/CD for shell-specific features

## Installation

### Vitest + Execa (Already Installed)

```bash
# Included in package.json devDependencies
pnpm install
```

### BATS (Optional)

```bash
# macOS
brew install bats-core

# Linux (Ubuntu/Debian)
sudo apt-get install bats

# Via npm (global)
npm install -g bats

# Via npm (project-local)
pnpm add -D bats
```

## Running Tests

### Run Vitest Shell Tests (Recommended)

```bash
# Run all shell tests
pnpm test:shell

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch -- tests/e2e/cli-shell.test.ts

# Run specific test
pnpm test:shell -t "executes --version flag"
```

### Run BATS Tests (Optional)

```bash
# Run all BATS tests
pnpm test:bats

# Run directly with BATS
bats tests/shell/cli.bats

# Run with TAP output
bats --tap tests/shell/cli.bats

# Run specific test
bats tests/shell/cli.bats --filter "CLI shows version"
```

### Run Both

```bash
# Run all tests (Vitest + shell)
pnpm test

# Build and test
pnpm build && pnpm test:shell
```

## Test Coverage

### What's Tested

✅ **Basic CLI Execution**
- `--version` flag
- `--help` flag
- Unknown command errors
- Shebang execution (Unix)

✅ **MCP Commands**
- `mcp list` - Show available MCPs
- `mcp add` - Add MCP to project
- `mcp sync` - Sync to targets
- `mcp sync --dry-run` - Preview without applying
- `mcp sync --tool cursor` - Sync to specific tool
- `mcp remove` - Remove MCP from project

✅ **Error Handling**
- Missing MCP registry
- Missing environment variables
- Invalid JSON config
- Missing file permissions
- Invalid command arguments

✅ **Cross-Platform**
- Different line endings
- Spaces in paths
- HOME environment variable
- Windows compatibility (where applicable)

✅ **Exit Codes**
- Success (0)
- Errors (non-zero)
- Missing arguments

✅ **Output Formatting**
- UTF-8 encoding
- stdout vs stderr
- Error messages

✅ **Integration Workflows**
- Full workflow: add → sync → remove
- Multiple MCPs
- Environment variable substitution

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'

      # Install dependencies
      - run: pnpm install

      # Build CLI
      - run: pnpm build

      # Run shell tests (Vitest)
      - run: pnpm test:shell

      # Optional: Run BATS tests
      - name: Install BATS
        run: sudo apt-get install -y bats
      - run: pnpm test:bats
```

## Debugging Failed Tests

### Vitest Tests

```bash
# Run with verbose output
DEBUG=true pnpm test:shell

# Run single test file
pnpm test:shell -t "specific test name"

# Check test output
cat tests/e2e/cli-shell.test.ts
```

### BATS Tests

```bash
# Run with verbose output
bats --verbose-run tests/shell/cli.bats

# Run with trace
bats --trace tests/shell/cli.bats

# Run specific test
bats tests/shell/cli.bats --filter "pattern"
```

### Common Issues

**Issue:** Tests fail with "CLI not built"
```bash
# Solution: Build the CLI first
pnpm build
```

**Issue:** Environment variable errors
```bash
# Solution: Check .env file or set variables
export GITHUB_TOKEN=ghp_your_token
pnpm test:shell
```

**Issue:** Permission errors
```bash
# Solution: Check file permissions
ls -la dist/cli.js
chmod +x dist/cli.js
```

## Writing New Tests

### Vitest + Execa Pattern

```typescript
it('tests new feature', async () => {
  // Execute CLI command
  const { stdout, stderr, exitCode } = await execa('node', [
    cliPath,
    'command',
    '--flag',
    'value'
  ]);

  // Assert results
  expect(exitCode).toBe(0);
  expect(stdout).toContain('expected output');
});
```

### BATS Pattern

```bash
@test "test description" {
  check_cli_built
  run node "$CLI" command --flag value
  [ "$status" -eq 0 ]
  [[ "$output" =~ "expected pattern" ]]
}
```

## Best Practices

1. **Always build before testing:**
   ```bash
   pnpm build && pnpm test:shell
   ```

2. **Use temp directories:**
   - Tests automatically create temp directories
   - No need to clean up manually

3. **Test exit codes:**
   - Success: `exitCode === 0`
   - Errors: `exitCode !== 0`

4. **Check both stdout and stderr:**
   - Normal output: `stdout`
   - Error messages: `stderr` (or sometimes `stdout`)

5. **Use descriptive test names:**
   - Good: `"executes mcp sync with --dry-run flag"`
   - Bad: `"test sync"`

6. **Test cross-platform when possible:**
   - Use `process.platform` checks
   - Skip platform-specific tests with `skip`

## References

- [Vitest Documentation](https://vitest.dev/)
- [Execa Documentation](https://github.com/sindresorhus/execa)
- [BATS Documentation](https://bats-core.readthedocs.io/)
- [ShellSpec](https://shellspec.info/) (Alternative to BATS)
