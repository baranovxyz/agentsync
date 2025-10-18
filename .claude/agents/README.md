# AgentSync Subagents

This directory contains specialized subagents for AgentSync development workflows.

## Available Subagents

### manual-tester

**Purpose**: Comprehensive manual testing specialist for CLI validation

**File**: [manual-tester.md](manual-tester.md)

**Use Cases**:
- Pre-release validation
- Post-feature testing
- Regression testing
- Quality assurance before npm publish

**How to Use**:

```
> Use the manual-tester subagent to execute the complete manual test suite
```

Or explicitly:

```
> Run manual tests using the manual-tester subagent
```

**What It Does**:

1. ✅ Installs AgentSync using Method 3 (pnpm pack) for production-like testing
2. ✅ Executes all 6 scenarios sequentially (48+ tests total)
3. ✅ Tracks progress with TODO list
4. ✅ Validates outputs against expected behavior
5. ✅ Tests error handling and edge cases
6. ✅ Generates comprehensive test report
7. ✅ Assesses release readiness
8. ✅ Cleans up test environment

**Tools Granted**:
- `Bash` - Execute CLI commands
- `Read` - Read test scenarios and documentation
- `Write` - Generate test reports
- `Grep` - Search for patterns in output
- `Glob` - Find test files
- `TodoWrite` - Track test progress

**Test Coverage**:
- Scenario 00: Setup and Prerequisites (8 tests)
- Scenario 01: No Registry (9 tests)
- Scenario 02: First-Time Setup (6 tests)
- Scenario 03: Basic Workflow (10 tests)
- Scenario 04: Error Handling (10 tests)
- Scenario 08: Cleanup (5 tests)

**Output Files** (in `/tmp/agentsync-manual-tests/`):
- `test-results.md` - Complete test report
- `test-execution-log.md` - Chronological command log
- `issues-found.md` - Detailed issue tracking

**Expected Duration**: 15-20 minutes

**When to Use**:
- ✅ Before publishing to npm
- ✅ After significant code changes
- ✅ Before creating release tags
- ✅ When validating bug fixes
- ✅ For regression testing

**When NOT to Use**:
- ❌ During active development (use `pnpm test` instead)
- ❌ For unit testing (use Vitest)
- ❌ For quick smoke tests (run commands directly)

## Configuration

Subagents are automatically detected by Claude Code when placed in:
- `.claude/agents/` (project-level, highest priority)
- `~/.claude/agents/` (user-level, lower priority)

These project-level subagents are checked into version control so the entire team benefits.

## Creating New Subagents

To add a new subagent:

1. Create a new `.md` file in this directory
2. Use YAML frontmatter with `name`, `description`, `tools`, `model`
3. Write detailed system prompt explaining behavior
4. Test with: `> Use the [name] subagent to [task]`

See [Claude Code Subagents Documentation](https://docs.claude.com/en/docs/claude-code/subagents) for details.

## Subagent Best Practices

- ✅ Keep single, focused responsibility
- ✅ Write detailed, specific prompts
- ✅ Limit tools to only what's needed
- ✅ Use `TodoWrite` for progress tracking
- ✅ Generate structured output reports
- ✅ Clean up test artifacts
- ✅ Document expected behavior clearly

## Related Documentation

- [Manual Tests README](../../manual-tests/README.md)
- [Installation Methods](../../manual-tests/INSTALLATION_METHODS.md)
- [Test Results Template](../../manual-tests/test-results-template.md)
