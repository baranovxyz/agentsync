# Manual Testing Guide

> **Parent:** [Testing Strategy](../../TESTING.md)

## Overview

The manual testing suite provides systematic, scenario-based testing for AgentSync CLI before release. It's designed for AI coding assistants to execute methodically.

## Structure

```
manual-tests/
├── README.md                      # Main coordinator & standards
├── INSTALLATION_METHODS.md        # Local installation guide
├── 00-setup.md                    # Setup (8 tests, ~2 min)
├── 01-scenario-no-registry.md     # No registry (9 tests, ~3 min)
├── 02-scenario-first-time.md      # First-time setup (6 tests, ~5 min)
├── 03-scenario-basic-workflow.md  # Basic workflow (10 tests, ~10 min)
├── 04-scenario-error-handling.md  # Error cases (10 tests, ~8 min)
├── 08-cleanup.md                  # Cleanup (5 tests, ~2 min)
└── test-results-template.md       # Results template
```

**Total**: 6 scenarios, ~48 tests, ~30 minutes

## Quick Start

```bash
# 1. Build and link
cd <PROJECT_ROOT>
pnpm build
pnpm link --global

# 2. Run scenarios in order
cd manual-tests
# Follow: 00 → 01 → 02 → 03 → 04 → 08

# 3. Record results
# Use test-results-template.md
```

## Scenarios

### 00. Setup (Required)

Verify build, link CLI, prepare environment

- **Duration**: ~2 minutes
- **Tests**: 8
- **Required**: Yes

### 01. No Registry

Test new user without MCP registry

- **Duration**: ~3 minutes
- **Tests**: 9
- **Focus**: Error messages, UX

### 02. First-Time Setup

Create global MCP registry

- **Duration**: ~5 minutes
- **Tests**: 6
- **Focus**: Registry creation, validation

### 03. Basic Workflow

Standard MCP workflow (add → sync → remove)

- **Duration**: ~10 minutes
- **Tests**: 10
- **Focus**: Happy path, token substitution

### 04. Error Handling

Error cases and edge conditions

- **Duration**: ~8 minutes
- **Tests**: 10
- **Focus**: Error quality, validation

### 08. Cleanup (Required)

Teardown and cleanup

- **Duration**: ~2 minutes
- **Tests**: 5
- **Required**: Yes

## Key Features

### For AI Coding Assistants

✅ **Sequential Execution**: Run scenarios in order
✅ **Clear Pass/Fail Criteria**: Every test has explicit criteria
✅ **Comprehensive Coverage**: New users to advanced workflows
✅ **Result Template**: Structured reporting format
✅ **Standards-Based**: Consistent testing approach

### Test Standards

1. **Clean Environment**: Each scenario starts fresh
2. **Complete Coverage**: Execute ALL test cases
3. **Record Results**: Document pass/fail for each test
4. **Report Issues**: Note discrepancies and bugs
5. **Version Verification**: Confirm correct version

## Testing Checklist

Before starting:

- [ ] All automated tests passing: `pnpm test && pnpm test:bats`
- [ ] Clean build: `rm -rf dist && pnpm build`
- [ ] Correct version in package.json
- [ ] No uncommitted changes

During testing:

- [ ] Run scenarios sequentially (00 → 08)
- [ ] Execute ALL tests in each scenario
- [ ] Record results for each test
- [ ] Document any issues found

After testing:

- [ ] Complete test results template
- [ ] Assess release readiness
- [ ] Update CHANGELOG if needed
- [ ] Fix blocker issues (if any)

## Expected Results

### All Tests Pass ✅

```
✅ Ready for Release

- All 48 tests passed
- No blocker issues
- Error messages clear
- Documentation accurate
- Ready to publish
```

### Tests Fail ❌

```
❌ Not Ready for Release

Issues found:
- [List blocker issues]

Action required:
- Fix issues
- Re-run affected scenarios
- Update documentation
```

## Integration with Development

### Complements Automated Tests

| Type       | Count     | Purpose                |
| ---------- | --------- | ---------------------- |
| **Vitest** | 125 tests | Automated, fast, CI/CD |
| **BATS**   | 26 tests  | Shell validation       |
| **Manual** | 48 tests  | UX, workflows, E2E     |
| **Total**  | 199 tests | Comprehensive coverage |

### When to Run

Run manual tests:

- ✅ Before every release
- ✅ After major features
- ✅ When changing CLI UX
- ✅ Before publishing to npm

## Files Reference

| File                          | Purpose               | Tests | Time |
| ----------------------------- | --------------------- | ----- | ---- |
| README.md                     | Main coordinator      | -     | -    |
| INSTALLATION_METHODS.md       | Install methods guide | -     | -    |
| 00-setup.md                   | Prerequisites         | 8     | 2m   |
| 01-scenario-no-registry.md    | No registry           | 9     | 3m   |
| 02-scenario-first-time.md     | First-time setup      | 6     | 5m   |
| 03-scenario-basic-workflow.md | Basic workflow        | 10    | 10m  |
| 04-scenario-error-handling.md | Error cases           | 10    | 8m   |
| 08-cleanup.md                 | Cleanup               | 5     | 2m   |
| test-results-template.md      | Results template      | -     | -    |

## Support

- **Main README**: [../../manual-tests/README.md](../../manual-tests/README.md)
- **Installation Methods**: [../../manual-tests/INSTALLATION_METHODS.md](../../manual-tests/INSTALLATION_METHODS.md)
- **Automated Tests**: [automated.md](automated.md)
- **Shell Testing**: [shell-implementation.md](shell-implementation.md)
- **Testing Strategy**: [../../TESTING.md](../../TESTING.md)
- **Issues**: https://github.com/baranovxyz/agentsync/issues

---

**Version**: 0.2.0-alpha.2
**Created**: 2025-10-18
**For**: AI Coding Assistants & Manual Testers
