# Manual Testing Suite for AgentSync CLI

This directory contains a comprehensive manual testing suite designed for AI coding assistants to systematically validate AgentSync CLI before release.

## Purpose

Manual testing complements automated tests by:

- Testing real user workflows end-to-end
- Validating error messages and UX
- Checking cross-platform behavior
- Ensuring documentation accuracy
- Catching integration issues

## Structure

```
manual-tests/
├── README.md                           # This file (main coordinator)
├── INSTALLATION_METHODS.md            # Local installation methods guide
├── 00-setup.md                         # Environment setup and prerequisites
├── 01-scenario-no-registry.md         # New user without MCP registry
├── 02-scenario-first-time.md          # First-time user creating registry
├── 03-scenario-basic-workflow.md      # Standard MCP workflow
├── 04-scenario-error-handling.md      # Error cases and edge cases
├── 08-cleanup.md                       # Cleanup and teardown
└── test-results-template.md           # Template for recording results
```

**Note**: Scenarios 05-07 (multi-tool, env-vars, advanced) are integrated into scenarios 03-04.

## Testing Standards

### For AI Coding Assistants

When executing these tests:

1. **Sequential Execution**: Run scenarios in order (00 → 08)
2. **Clean Environment**: Start each scenario from scratch
3. **Record Results**: Document pass/fail and actual vs expected output
4. **Report Issues**: Note any discrepancies or unexpected behavior
5. **Complete Coverage**: Execute ALL test cases in each scenario
6. **Version Verification**: Confirm correct version before starting

### Test Result Format

For each test case, record:

```markdown
### Test: [Test Name]

**Status**: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL | ⏭️ SKIPPED

**Expected**:
```

[Expected output]

```

**Actual**:
```

[Actual output]

```

**Notes**: [Any observations or issues]
```

### Pass Criteria

- ✅ **PASS**: Output matches expected, command succeeds
- ❌ **FAIL**: Command fails unexpectedly or output wrong
- ⚠️ **PARTIAL**: Works but with warnings or minor issues
- ⏭️ **SKIPPED**: Test skipped (document reason)

## Quick Start for AI Assistants

```bash
# 1. Navigate to AgentSync project
cd <PROJECT_ROOT>  # e.g., ~/oss/agentsync

# 2. Build CLI
pnpm build

# 3. Link globally
pnpm link --global

# 4. Verify installation
agentsync --version  # Should show: 0.2.0-alpha.2

# 5. Start testing
# Follow scenarios in order: 00-setup.md → 08-cleanup.md
```

## Test Scenarios Overview

### 00. Setup (Required)

- Build and link CLI
- Verify installation
- Prepare test environment

### 01. No Registry Scenario

**Tests**: New user experience without global registry

- Error messages
- Help text quality
- First-run experience

### 02. First-Time Setup

**Tests**: Creating global registry

- Registry creation
- MCP configuration format
- Example MCPs

### 03. Basic Workflow

**Tests**: Standard user workflow

- List MCPs
- Add MCP to project
- Sync to targets
- Remove MCP

### 04. Error Handling

**Tests**: Error cases and edge cases

- Invalid MCP names
- Missing environment variables
- Permission errors
- Malformed JSON

### 05. Multi-Tool Support

**Tests**: Multiple targets

- Cursor + Claude sync
- Tool-specific sync
- Dry-run mode

### 06. Environment Variables

**Tests**: Token substitution

- .env file loading
- process.env fallback
- Missing var errors
- Token validation

### 07. Advanced Features

**Tests**: Flags and options

- --dry-run
- --tool <name>
- --help
- --version

### 08. Cleanup

**Tests**: Teardown and cleanup

- Unlink global install
- Remove test projects
- Restore environment

## Pre-Testing Checklist

Before starting manual tests:

- [ ] All automated tests passing: `pnpm test && pnpm test:bats`
- [ ] Clean build: `rm -rf dist && pnpm build`
- [ ] Correct version in package.json
- [ ] No uncommitted changes: `git status`
- [ ] Fresh terminal session (clean PATH)

## Running the Test Suite

### Full Suite (All Scenarios)

```bash
# Execute all scenarios in order
cd <PROJECT_ROOT>/manual-tests

# Follow each file sequentially
1. Open 00-setup.md
2. Execute all commands
3. Record results
4. Move to 01-scenario-no-registry.md
5. Repeat until 08-cleanup.md
```

### Individual Scenario

```bash
# Run specific scenario
cd <PROJECT_ROOT>/manual-tests

# Example: Test error handling only
1. Run 00-setup.md (always required)
2. Run 04-scenario-error-handling.md
3. Run 08-cleanup.md
```

### Quick Smoke Test

```bash
# Minimal validation (5 minutes)
cd <PROJECT_ROOT>

pnpm build
pnpm link --global
agentsync --version
agentsync --help
agentsync mcp --help
pnpm unlink --global agentsync
```

## Test Execution Guidelines

### Environment Setup

Each test should:

1. Start in isolated temp directory
2. Not interfere with global state
3. Clean up after completion
4. Document state changes

### Command Execution

For each command:

1. Show full command with path
2. Capture both stdout and stderr
3. Record exit code
4. Note execution time if relevant

### Output Validation

Check for:

- Correct exit codes (0 = success, non-zero = error)
- Clear error messages
- Helpful suggestions in errors
- Proper formatting (colors, symbols)
- No typos or grammar issues

### Edge Cases

Test:

- Empty inputs
- Very long inputs
- Special characters in paths
- Unicode in filenames
- Concurrent execution
- Network issues (if applicable)

## Reporting Results

### Success Report Template

```markdown
# Manual Test Results: AgentSync v0.2.0-alpha.2

**Date**: 2025-10-18
**Tester**: Claude/Human Name
**Platform**: macOS Sequoia 24.3.0
**Node**: v20.x.x

## Summary

- Total Scenarios: 8
- Passed: 8
- Failed: 0
- Partial: 0
- Skipped: 0

## Detailed Results

### 00. Setup

✅ All checks passed

### 01. No Registry

✅ Error messages clear and helpful

### 02. First-Time Setup

✅ Registry created successfully

[... continue for all scenarios ...]

## Issues Found

None

## Recommendations

None

## Sign-off

Ready for release: ✅ YES | ❌ NO
```

### Failure Report Template

```markdown
# Manual Test Results: AgentSync v0.2.0-alpha.2

**Date**: 2025-10-18
**Tester**: Claude/Human Name

## Summary

- Total Scenarios: 8
- Passed: 6
- Failed: 2
- Partial: 0
- Skipped: 0

## Failed Tests

### Scenario 04: Error Handling

### Test: Invalid MCP name

**Expected**:
```

❌ Error: MCP server 'invalid' not found in global registry.
Available servers: github, postgres

```

**Actual**:
```

Error: undefined

```

**Issue**: Error message not showing available servers
**Severity**: Medium
**Action Required**: Fix error handling in mcp add command

## Blocker Issues

1. [Issue description]
   - Impact: [user experience, functionality, etc.]
   - Recommendation: [fix before release, document workaround, etc.]

## Sign-off

Ready for release: ❌ NO
Reason: 2 blocker issues need fixes
```

## Integration with CI/CD

While these are "manual" tests, they can be:

1. Converted to automated E2E tests
2. Used as acceptance criteria
3. Referenced in release checklists

## Version History

- v0.2.0-alpha.2: Initial manual test suite
  - 8 scenarios covering MCP Phase 1
  - Template for test results
  - Standards for AI assistants

## Next Steps

After completing manual tests:

1. ✅ Review test results
2. ✅ Fix any blocker issues
3. ✅ Update CHANGELOG.md
4. ✅ Create git tag
5. ✅ Publish to npm

## Support

- GitHub Issues: https://github.com/baranovxyz/agentsync/issues
- Documentation: README.md, TESTING.md
- Automated Tests: `pnpm test`, `pnpm test:bats`
