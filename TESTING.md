# Testing Strategy

> **Quick Links:** [Automated Tests](#automated-testing) · [Manual Testing](#manual-testing) · [Pre-Release Checklist](#pre-release-checklist) · [Detailed Docs](docs/testing/)

## Overview

AgentSync uses a comprehensive, multi-layered testing strategy to ensure CLI reliability, UX quality, and production readiness.

**Test Philosophy:**
- **Automated tests** catch regressions and validate functionality
- **Shell tests** ensure real-world CLI execution works
- **Manual tests** validate user workflows and error messages

---

## Quick Start

```bash
# Install and build
pnpm install
pnpm build

# Run all automated tests (2 seconds)
pnpm test

# Run specific test suites
pnpm test:shell      # Shell execution tests (Vitest + execa)
pnpm test:bats       # Shell script tests (BATS)
pnpm test:coverage   # With coverage report

# Manual testing (30 minutes)
cd manual-tests
# Follow scenarios 00 → 08
```

---

## Test Types

| Type | Count | Speed | Coverage | Purpose | Documentation |
|------|-------|-------|----------|---------|---------------|
| **Vitest (Unit/Integration)** | 125 | ~2s | >90% | Core functionality | [automated.md](docs/testing/automated.md) |
| **Shell Tests (Vitest + execa)** | 24 | ~2s | - | Real CLI execution | [shell-implementation.md](docs/testing/shell-implementation.md) |
| **BATS (Shell Scripts)** | 26 | ~5s | - | Shell validation | [shell-implementation.md](docs/testing/shell-implementation.md) |
| **Manual Scenarios** | 48 | ~30m | - | UX workflows | [manual-testing.md](docs/testing/manual-testing.md) |
| **Total** | **223** | - | - | Complete coverage | - |

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

---

## Manual Testing

Systematic, scenario-based testing for UX validation.

**Location:** [`manual-tests/`](manual-tests/)

**Scenarios:**
1. **Setup** (2 min) - Build, link, verify
2. **No Registry** (3 min) - New user without MCP registry
3. **First-Time Setup** (5 min) - Creating global registry
4. **Basic Workflow** (10 min) - Add → Sync → Remove
5. **Error Handling** (8 min) - Edge cases and validation
6. **Cleanup** (2 min) - Teardown

**Run:**
```bash
# Build and link CLI
pnpm build
pnpm link --global

# Execute manual test scenarios
cd manual-tests
# Follow: 00-setup.md → ... → 08-cleanup.md

# Record results in test-results-template.md
```

**Details:** [docs/testing/manual-testing.md](docs/testing/manual-testing.md)

---

## Pre-Release Checklist

Before publishing to npm:

### 1. Automated Tests ✅
- [ ] All tests pass: `pnpm test`
- [ ] Shell tests pass: `pnpm test:shell`
- [ ] BATS tests pass: `pnpm test:bats` (if installed)
- [ ] Coverage >80%: `pnpm test:coverage`
- [ ] No TypeScript errors: `pnpm lint`

### 2. Manual Testing ✅
- [ ] Execute all 6 scenarios in `manual-tests/`
- [ ] Record results in `test-results-template.md`
- [ ] All tests pass or documented
- [ ] Error messages are helpful

### 3. Build & Package ✅
- [ ] Clean build: `rm -rf dist && pnpm build`
- [ ] Pack tarball: `pnpm pack`
- [ ] Install from tarball: `npm install -g agentsync-*.tgz`
- [ ] Test installed CLI: `agentsync --version`, `agentsync mcp --help`

### 4. Documentation ✅
- [ ] README.md updated
- [ ] CHANGELOG.md updated with version changes
- [ ] Version number correct in `package.json`
- [ ] Examples work correctly

### 5. Git ✅
- [ ] All changes committed
- [ ] Git status clean
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
- **[Manual Testing Guide](docs/testing/manual-testing.md)** - Manual test suite reference
- **[Manual Test Scenarios](manual-tests/)** - Step-by-step test scenarios
- **[Installation Methods](manual-tests/INSTALLATION_METHODS.md)** - Local install options

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
2. ✅ Add shell tests if CLI-related
3. ✅ Update manual test scenarios if UX changes
4. ✅ Ensure all tests pass: `pnpm test`
5. ✅ Document testing approach

---

**Version**: 0.2.0-alpha.2
**Last Updated**: 2025-10-18
**Test Coverage**: 90%+ (MCP Phase 1)
