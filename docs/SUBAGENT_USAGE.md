# Subagent Usage Guide

This document explains how to use the AgentSync subagents for automated testing and workflows.

## What Are Subagents?

Subagents are specialized AI assistants in Claude Code that:

- Have their own context window (separate from main conversation)
- Are configured with specific tools and instructions
- Can be invoked automatically or explicitly
- Work autonomously and return results

See [Claude Code Subagents Documentation](https://docs.claude.com/en/docs/claude-code/subagents) for details.

## Available Subagents

### 🧪 manual-tester

**Location**: [.claude/agents/manual-tester.md](../.claude/agents/manual-tester.md)

**Purpose**: Execute comprehensive manual test suite using production-like installation (pnpm pack)

**Configuration**:

```yaml
name: manual-tester
tools: Bash, Read, Write, Grep, Glob, TodoWrite
model: sonnet
```

## Using the manual-tester Subagent

### Quick Start

In Claude Code, simply say:

```
Use the manual-tester subagent to run the complete manual test suite
```

Or more explicitly:

```
Execute manual tests using the manual-tester subagent
```

### What It Does

1. **Builds and Packages** - Creates production tarball with `pnpm pack`
2. **Installs Globally** - Tests real npm install experience
3. **Runs All Scenarios** - Executes 48+ tests across 6 scenarios
4. **Tracks Progress** - Uses TODO list to show real-time progress
5. **Validates Output** - Compares actual vs expected results
6. **Tests Errors** - Validates error handling and edge cases
7. **Generates Report** - Creates comprehensive test results document
8. **Cleans Up** - Removes test artifacts and global install

### Test Scenarios Covered

- ✅ **Scenario 00**: Setup and Prerequisites (8 tests)
- ✅ **Scenario 01**: No Registry Experience (9 tests)
- ✅ **Scenario 02**: First-Time Setup (6 tests)
- ✅ **Scenario 03**: Basic Workflow (10 tests)
- ✅ **Scenario 04**: Error Handling (10 tests)
- ✅ **Scenario 08**: Cleanup and Teardown (5 tests)

**Total**: 48+ individual tests

### Expected Output

The subagent will provide:

1. **Real-time Progress** via TODO list:

   ```
   ✅ Scenario 00: Setup (8/8 tests)
   🔄 Scenario 01: No Registry (3/9 tests)
   ⏳ Scenario 02: First-Time Setup (0/6 tests)
   ...
   ```

2. **Test Results Summary**:

   ```
   Manual Test Run Complete: 48/48 tests passed
   - Passed: 45
   - Failed: 2
   - Partial: 1
   - Skipped: 0
   ```

3. **Generated Files** in `/tmp/agentsync-manual-tests/`:
   - `test-results.md` - Complete test report
   - `test-execution-log.md` - Command history
   - `issues-found.md` - Issue tracker (if any)

4. **Release Recommendation**:
   ```
   ✅ READY FOR RELEASE
   or
   ❌ NOT READY - 2 blocker issues found
   ```

### When to Use

**✅ DO USE for**:

- Pre-release validation before `npm publish`
- Post-feature comprehensive testing
- Regression testing after bug fixes
- Quality gate before git tags
- Validating packaging and distribution

**❌ DON'T USE for**:

- Active development (use `pnpm test` instead)
- Quick smoke tests (run commands directly)
- Unit testing (use Vitest)
- Debugging specific issues (run scenarios manually)

### Expected Duration

- **Full test suite**: 15-20 minutes
- **Individual scenario**: 2-5 minutes each

### Viewing Results

After completion, read the generated reports:

```bash
# View summary
cat /tmp/agentsync-manual-tests/test-results.md

# View execution log
cat /tmp/agentsync-manual-tests/test-execution-log.md

# View issues (if any)
cat /tmp/agentsync-manual-tests/issues-found.md
```

## Manual Invocation (Without Subagent)

If you want to run tests manually without the subagent:

```bash
# 1. Build and pack
cd <PROJECT_ROOT>
pnpm build
pnpm pack

# 2. Install globally
pnpm add -g ./agentsync-0.2.0-alpha.2.tgz

# 3. Verify
which agentsync
agentsync --version

# 4. Run scenarios manually
cd manual-tests
# Follow each scenario file...

# 5. Cleanup
pnpm remove -g agentsync
rm agentsync-0.2.0-alpha.2.tgz
```

See [manual-tests/README.md](../manual-tests/README.md) for detailed manual execution steps.

## Comparison: Subagent vs Manual

| Aspect            | Subagent               | Manual               |
| ----------------- | ---------------------- | -------------------- |
| **Speed**         | 15-20 min              | 30-40 min            |
| **Consistency**   | Always follows process | Prone to human error |
| **Documentation** | Auto-generates reports | Manual note-taking   |
| **Repeatability** | Perfect                | Variable             |
| **Best For**      | Pre-release validation | Learning/debugging   |

## Troubleshooting

### Subagent not found

```
Error: No subagent named 'manual-tester'
```

**Solution**: Ensure file exists at `.claude/agents/manual-tester.md`

### Subagent doesn't have access to tools

```
Error: Permission denied for tool 'Bash'
```

**Solution**: Check that `tools` field in YAML frontmatter includes required tools

### Tests failing unexpectedly

The subagent will document failures in the report. Check:

1. `/tmp/agentsync-manual-tests/test-results.md` for summary
2. `/tmp/agentsync-manual-tests/issues-found.md` for details
3. Whether this is a real bug or test environment issue

### Cleanup not working

If test artifacts remain:

```bash
# Manual cleanup
pnpm remove -g agentsync
rm -rf /tmp/agentsync-manual-tests
rm agentsync-*.tgz
which agentsync  # Should return nothing
```

## Creating Custom Subagents

To create your own testing subagent:

1. **Create file**: `.claude/agents/your-agent.md`

2. **Add YAML frontmatter**:

```yaml
---
name: your-agent
description: When to use this agent
tools: Bash, Read, Write
model: sonnet
---
```

3. **Write system prompt**: Detailed instructions for the agent

4. **Test it**: `Use the your-agent subagent to [task]`

See [.claude/agents/README.md](../.claude/agents/README.md) for more details.

## Integration with CI/CD

While the subagent is designed for interactive use, you can integrate manual testing into CI/CD:

```yaml
# .github/workflows/pre-release.yml
- name: Run manual tests
  run: |
    pnpm build
    pnpm pack
    pnpm add -g ./agentsync-*.tgz
    # Run test scripts
    agentsync --version
    # ... run scenarios programmatically
    pnpm remove -g agentsync
```

For full automation, consider converting scenarios to E2E tests using Vitest or Playwright.

## Best Practices

1. **Use Method 3 (pnpm pack)** - Most production-like
2. **Run before releases** - Always validate before `npm publish`
3. **Check generated reports** - Don't just look at pass/fail counts
4. **Investigate failures** - Every failure is valuable feedback
5. **Keep subagent updated** - Sync with changes to test scenarios

## Related Documentation

- [Manual Tests README](../manual-tests/README.md) - Test scenario details
- [Installation Methods](../manual-tests/INSTALLATION_METHODS.md) - Install options
- [Test Results Template](../manual-tests/test-results-template.md) - Report format
- [Claude Code Subagents](https://docs.claude.com/en/docs/claude-code/subagents) - Official docs

## Support

For issues with:

- **Subagent behavior**: Check `.claude/agents/manual-tester.md`
- **Test scenarios**: See `manual-tests/` directory
- **AgentSync bugs**: Create GitHub issue

---

**Quick Reference**:

```bash
# Use the subagent (in Claude Code)
> Use the manual-tester subagent to run tests

# Check subagent exists
ls .claude/agents/

# View subagent configuration
cat .claude/agents/manual-tester.md

# Check generated reports
ls /tmp/agentsync-manual-tests/
```
