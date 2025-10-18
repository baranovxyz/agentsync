# Scenario 00: Setup and Prerequisites

**Purpose**: Prepare environment for manual testing

**Duration**: ~2 minutes

**Prerequisites**: None (this is the first step)

---

## Test 00.1: Verify Project State

### Commands

```bash
cd <PROJECT_ROOT>  # Navigate to your agentsync directory

# Check for uncommitted changes
git status

# Check current version
cat package.json | grep '"version"'
```

### Expected Output

```
On branch main
nothing to commit, working tree clean

  "version": "0.2.0-alpha.2",
```

### Pass Criteria

- ✅ No uncommitted changes
- ✅ Version is 0.2.0-alpha.2

---

## Test 00.2: Run Automated Tests

### Commands

```bash
# Run all Vitest tests
pnpm test

# Run BATS tests
pnpm test:bats
```

### Expected Output

```
Test Files  12 passed (12)
Tests  125 passed (125)

1..26
ok 1 CLI shows version
...
ok 26 supports multiple MCPs
```

### Pass Criteria

- ✅ All 125 Vitest tests pass
- ✅ All 26 BATS tests pass
- ✅ No errors or warnings

---

## Test 00.3: Clean Build

### Commands

```bash
# Remove old build
rm -rf dist

# Fresh build
pnpm build
```

### Expected Output

```
> agentsync@0.2.0-alpha.2 build
> tsc && vite build

vite v7.1.10 building for production...
✓ built in XXXms

> agentsync@0.2.0-alpha.2 postbuild
> node scripts/add-shebang.js

✅ Shebang already present in dist/cli.js
```

### Pass Criteria

- ✅ Build completes without errors
- ✅ dist/ directory created
- ✅ dist/cli.js exists and is executable

---

## Test 00.4: Verify Build Output

### Commands

```bash
# Check CLI file exists
ls -lh dist/cli.js

# Check shebang
head -1 dist/cli.js

# Check permissions
stat -f "%A %N" dist/cli.js || stat -c "%a %n" dist/cli.js
```

### Expected Output

```
-rwxr-xr-x  ... dist/cli.js

#!/usr/bin/env node

755 dist/cli.js
```

### Pass Criteria

- ✅ CLI file exists
- ✅ Has correct shebang
- ✅ Is executable (755 permissions)

---

## Test 00.5: Link Global Install

### Commands

```bash
# Remove old link if exists
pnpm unlink --global agentsync 2>/dev/null || true

# Create new global link
pnpm link --global

# Verify link created
which agentsync

# Check version
agentsync --version
```

### Expected Output

```
<PATH_TO_PNPM_BIN>/agentsync  # e.g., /Users/username/Library/pnpm/agentsync

0.2.0-alpha.2
```

### Pass Criteria

- ✅ agentsync command available globally
- ✅ Version matches package.json
- ✅ Points to local development version

---

## Test 00.6: Test Basic Commands

### Commands

```bash
# Test --help
agentsync --help

# Test mcp subcommand
agentsync mcp --help

# Test invalid command
agentsync invalid-command 2>&1
```

### Expected Output

```
Usage: agentsync [options] [command]
...

Usage: agentsync mcp [options] [command]
...

error: unknown command 'invalid-command'
```

### Pass Criteria

- ✅ Help output displays correctly
- ✅ MCP subcommand works
- ✅ Invalid command shows error

---

## Test 00.7: Prepare Test Environment

### Commands

```bash
# Create test workspace
mkdir -p /tmp/agentsync-manual-tests

# Set working directory
cd /tmp/agentsync-manual-tests

# Verify location
pwd
```

### Expected Output

```
/tmp/agentsync-manual-tests
```

### Pass Criteria

- ✅ Test directory created
- ✅ Working directory is correct

---

## Test 00.8: Backup Existing Registry (Optional)

### Commands

```bash
# Check if registry exists
if [ -f ~/.agentsync/mcp.json ]; then
  echo "Registry exists, creating backup"
  cp ~/.agentsync/mcp.json ~/.agentsync/mcp.json.backup
  echo "Backup created"
else
  echo "No existing registry"
fi

# List backups
ls -la ~/.agentsync/*.backup 2>/dev/null || echo "No backups"
```

### Expected Output

```
Registry exists, creating backup
Backup created

OR

No existing registry
```

### Pass Criteria

- ✅ Backup created if registry exists
- ✅ No errors

---

## Setup Completion Checklist

Before proceeding to scenario tests, verify:

- [ ] All automated tests passing
- [ ] Clean build completed
- [ ] Global link created
- [ ] agentsync --version shows correct version
- [ ] Test workspace created
- [ ] Existing registry backed up (if applicable)

## Summary

Record your results:

- **Test 00.1 - Project State**: ✅ ❌ ⚠️
- **Test 00.2 - Automated Tests**: ✅ ❌ ⚠️
- **Test 00.3 - Clean Build**: ✅ ❌ ⚠️
- **Test 00.4 - Build Output**: ✅ ❌ ⚠️
- **Test 00.5 - Global Link**: ✅ ❌ ⚠️
- **Test 00.6 - Basic Commands**: ✅ ❌ ⚠️
- **Test 00.7 - Test Environment**: ✅ ❌ ⚠️
- **Test 00.8 - Backup Registry**: ✅ ❌ ⚠️

**Overall Setup Status**: ✅ READY | ❌ NOT READY

---

## Troubleshooting

### Issue: Tests failing

```bash
# Clean install
rm -rf node_modules
pnpm install
pnpm test
```

### Issue: Link not working

```bash
# Check pnpm bin directory in PATH
echo $PATH | grep pnpm

# Re-link
pnpm unlink --global agentsync
pnpm link --global
```

### Issue: Permission denied

```bash
# Fix permissions
chmod +x dist/cli.js
pnpm build
```

---

**Next**: Proceed to [01-scenario-no-registry.md](01-scenario-no-registry.md)
