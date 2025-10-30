---
name: extract-learnings
description: Extract important learnings from conversation and update project documentation
---

# Extract Learnings - Capture Important Session Insights for Future LLM Sessions

## Overview

This command analyzes the current conversation to extract important information, patterns, preferences, and technical decisions that should be preserved for future LLM sessions. It proposes documentation updates and applies them only after user confirmation.

## Process

### 1. Conversation Analysis Phase

I'll analyze the conversation to identify:

- **User Preferences**: Workflow choices, coding conventions, testing approaches
- **Technical Decisions**: Architecture choices, library selections, implementation patterns
- **Problem Solutions**: Issues encountered and their resolutions
- **MCP Patterns**: Reusable patterns and best practices for MCP servers/clients
- **Configuration Changes**: Important setup or configuration modifications
- **Common Pitfalls**: Things to avoid based on user feedback

### 2. Categorization Phase

I'll categorize findings into:

- **CLI Development Patterns**: Commander.js patterns, command structure, option handling
- **MCP Context Optimization**: Registry management, token substitution, target syncing (Cursor, Claude Code)
- **Security Patterns**: Secret scanning, unicode detection (CVE-2021-42574), audit logging
- **Tooling & Configuration**: pnpm workflows, TypeScript patterns, Vitest testing (>80% coverage)
- **Workflow Preferences**: Git practices (conventional commits), documentation style, code organization
- **Phase-Specific Decisions**: Phase 1 (MCP - complete) vs Phase 2 (AGENTS.md - in progress) architecture

### 3. Proposal Phase (NEW)

I'll present a numbered list of proposed changes, grouped by target file:

```
## Proposed Documentation Updates

### AGENTS.md
1. Add MCP sync workflow pattern (after "MCP Commands" section)
   - Document token substitution flow: load → filter → substitute → validate → sync
   - Add dry-run testing approach with --dry-run flag

2. Update testing requirements (Testing section)
   - Document 223 total tests (125 Vitest, 24 Shell/Vitest, 26 BATS, 48 Manual)
   - Add manual testing workflow using manual-tests/ scenarios

### TESTING.md
3. Add decision about coverage targets
   - Document >80% target for Phase 1 (currently 90%+)
   - Phase 2 coverage expectations

Total: 3 changes across 2 files

Confirm changes? (yes/no)
```

### 4. Documentation Update Phase

**Only after user confirmation**, I'll update relevant documentation:

- **AGENTS.md**: Primary source for session-to-session continuity
  - User preferences and conventions (pnpm, no `as any`, conventional commits)
  - Technical patterns and anti-patterns (Phase 1 vs Phase 2 architecture)
  - Workflow and tooling preferences (Vitest, Commander.js, Zod schemas)
- **Project-specific docs**: When appropriate
  - Testing strategy in [TESTING.md](../../../TESTING.md)
  - Testing implementation in [docs/testing/](../../../docs/testing/)
  - Version history in [CHANGELOG.md](../../../CHANGELOG.md)
  - Subagent patterns in [docs/SUBAGENT_USAGE.md](../../../docs/SUBAGENT_USAGE.md)

### 5. Validation Phase

I'll ensure:

- No redundant information is added
- Updates are concise and actionable
- Format remains consistent with existing documentation
- Critical learnings are prominently placed

## Categories of Information Extracted

### User Preferences

- Code style preferences (e.g., no `as any`, no ignoring unused vars with `_`)
- Testing approaches and patterns
- Documentation style (concise, no unnecessary examples)
- Commit message conventions

### Technical Patterns

- MCP registry and config management (`~/.agentsync/mcp.json`, `.agentsync.json`)
- Token substitution with validation (`{VAR}` placeholders → actual env values)
- CLI command structure (Commander.js with async action handlers)
- Security-first patterns (secret scanning, unicode detection before file operations)
- Multi-target syncing (Cursor, Claude Code with tool-specific formats)

### Configuration & Setup

- Build tool configurations (pnpm, TypeScript strict mode, Vite for building)
- Testing setup (Vitest with 223 tests: 125 unit/integration, 24 shell, 26 BATS, 48 manual)
- CLI packaging (shebang `#!/usr/bin/env node`, executable permissions, npm publish)
- Development workflow (hot reload with `pnpm dev`, coverage targets >80%)

### Problem Resolutions

- MCP registry and config loading edge cases (missing files, invalid JSON)
- Token substitution validation (unsubstituted tokens cause failures)
- Init command issues in non-interactive environments (CI/CD compatibility)
- Cross-tool syncing differences (Cursor uses wrapper format, Claude doesn't)
- Shell testing challenges (executable permissions, shebang handling, exit codes)

## Output Format

After extraction, I'll:

1. Show a summary of key learnings identified
2. **Present numbered proposals grouped by file with line references**
3. **Wait for user confirmation (yes/no)**
4. Apply the updates to appropriate files (only if confirmed)
5. Confirm successful documentation update

## Example Usage

```
/extract-learnings
```

The command will:

1. Analyze the entire conversation history
2. Extract important patterns and decisions
3. **Propose numbered changes with file locations**
4. **Wait for user approval**
5. Update AGENTS.md and other docs as confirmed
6. Provide a summary of what was captured

## Example Proposal Output

```
## Proposed Documentation Updates

### AGENTS.md
1. Add MCP command workflow detail (after "MCP Commands" section)
   - Document the 5-step sync flow: load → filter → substitute → validate → sync
   - Add example: `pnpm cli mcp sync --dry-run --tool cursor`

2. Update Testing section (Common Commands → Testing)
   - Add manual testing reference: "See manual-tests/ for 48 scenario-based tests"
   - Document 223 total tests breakdown

3. Add to Code Standards (TypeScript section)
   - "Never commit actual secrets or tokens (use {VAR} placeholders)"
   - "Validate with --dry-run before actual sync operations"

### TESTING.md
4. Add Phase 2 testing expectations
   - Document coverage targets for AGENTS.md sync (when implemented)
   - Note: Phase 1 achieved 90%+, Phase 2 target >80%

Total: 4 changes across 2 files

Apply these changes? Reply 'yes' to confirm or 'no' to cancel.
```

## Important Notes

- Focuses on actionable, specific information
- Avoids generic or obvious patterns
- Preserves user's exact preferences and feedback
- Maintains documentation conciseness
- Updates are additive - doesn't remove existing important information
- **Changes are only applied after explicit user confirmation**
- **Never mentions in commit messages that code was generated/co-authored by Claude** (per user's global AGENTS.md)
- Particularly useful after:
  - Complex problem-solving sessions (MCP sync debugging, token substitution issues)
  - User preference clarifications (testing approach, code style, commit conventions)
  - New CLI patterns discovered (Commander.js options, error handling strategies)
  - Configuration troubleshooting (registry loading, target detection, env var handling)
  - Testing strategy refinements (adding shell tests, improving coverage, manual test scenarios)
  - Security implementation decisions (secret patterns, unicode detection, audit logging)
