# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgentSync** is the missing infrastructure layer for AI coding agent configuration management with three main features:

1. **MCP Context Optimizer** (Phase 1 ✅) - Project-specific MCP server selection to reduce AI context bloat
2. **GitHub Preset System** (v0.2.0-alpha (Testing) 🧪) - Share rules, commands, and MCPs via GitHub repositories
3. **AGENTS.md Sync** (Phase 2 ⏳) - Unified AGENTS.md sync to all AI coding tools

**Current Status**:

- **Phase 1 (MCP)**: ✅ COMPLETE - 293 tests passing (272 unit/integration + 21 E2E), >90% coverage, CI validated on 9 platforms, production-ready
- **v0.2.0-alpha (GitHub Presets)**: ✅ 100% COMPLETE - 86 tests passing (82 unit/integration + 4 E2E), example preset published, alpha testing phase
- **Phase 2 (AGENTS.md)**: Foundation + Security complete, only `init` command fully implemented

**v0.2.0-beta Progress**:

- ✅ Config schema updated with `extends` and `mcpServers` fields
- ✅ GitHub source parser (github:org/repo format)
- ✅ Cache manager for cloned repos
- ✅ GitHub resolver with SSH/HTTPS fallback
- ✅ Preset loader (rules/commands/MCPs)
- ✅ Namespace-based merger
- ✅ Registry orchestrator
- ✅ Init command creates new config format
- ✅ Rules sync to Cursor/Claude
- ✅ Commands sync to Cursor/Claude
- ✅ Main sync command
- ✅ Preset list and cache-clear commands
- ✅ Documentation and examples (7 comprehensive examples)
- ✅ E2E tests with real GitHub repo (@agentsync/example-typescript)

## Common Commands

### Development

```bash
# Start development with hot reload
pnpm dev

# Build for production (creates dist/cli.js)
pnpm build

# Run CLI directly in TypeScript
pnpm cli --help

# Type checking only (no emit)
pnpm lint

# Format code with Prettier
pnpm lint:fix
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode for TDD
pnpm test:watch

# Generate coverage report (target: >80%)
pnpm test:coverage

# Run e2e tests only
pnpm test:e2e

# Run specific test file
pnpm test src/security/scanner.test.ts
```

#### Test Design Philosophy

**Natural Flow Over Manual Setup:**

- Tests should follow user workflows, not bypass them
- Use `init` command in tests instead of manually creating config files
- Create helper functions for common setup patterns

**E2E Test Requirements:**

- Complete CLI environment: `dist/`, `package.json`, `templates/`, `node_modules/`
- Templates directory required for `init` command to work properly
- Symlink approach for `node_modules` due to ESM limitations

**Example helper pattern:**

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

### CI/CD

```bash
# GitHub Actions tests on 9 platforms: Ubuntu/macOS/Windows × Node 18/20/22
# Hierarchical timeouts: 5s unit tests, 10s hooks (2x multiplier on CI)
# Windows requires both HOME and USERPROFILE env vars for os.homedir()
# Coverage target: >80% (Phase 1 achieved 90%+)

# E2E Test Strategy (install-test.yml):
# - Runs ONLY on-demand (manual trigger + weekly cron)
# - NOT triggered on push (saves ~90% CI minutes for E2E tests)
# - Cost: ~5-9 CI minutes per run (9 platforms × 30-60s)
# - Trigger manually: gh workflow run "Install Test"
# - Use regular tests (test-with-bats.yml) for push validation

# Lockfile Policy:
# - ALL workflows use --frozen-lockfile (no exceptions)
# - Ensures pnpm-lock.yaml matches package.json
# - Prevents dependency drift between local/CI
```

### CLI Commands (via pnpm cli)

```bash
# Main Sync (v0.2.0-beta - IMPLEMENTED)
pnpm cli sync                      # Sync all: presets, rules, commands, MCPs
pnpm cli sync --update             # Update GitHub caches and sync
pnpm cli sync --dry-run            # Preview changes without applying
pnpm cli sync --tool cursor        # Sync only to Cursor

# Preset Management (v0.2.0-beta - IMPLEMENTED)
pnpm cli preset list              # List configured presets
pnpm cli preset cache-clear       # Clear project preset caches
pnpm cli preset cache-clear --all # Clear all preset caches

# MCP Commands (Phase 1 - FULLY IMPLEMENTED)
# Note: Empty MCP configs (0 servers) are valid for starting fresh or cleanup
pnpm cli mcp sync                  # Sync MCPs to tools
pnpm cli mcp sync --dry-run        # Preview without applying
pnpm cli mcp sync --tool cursor    # Sync only to Cursor
pnpm cli mcp list                  # Show available/active MCPs
pnpm cli mcp add github            # Add MCP to project
pnpm cli mcp remove postgres       # Remove MCP (can remove all)

# Init Command (Phase 2 - PARTIALLY IMPLEMENTED)
pnpm cli init                      # ✅ Initialize with template

# Phase 2 Commands (NOT IMPLEMENTED - Hidden from CLI help)
# The following commands are planned but not yet available:
# - watch, validate, diff, migrate, doctor, status, audit, tree
# These were removed from CLI help to avoid user confusion
```

### Available Slash Commands

```bash
/smart-commit        # Intelligent atomic commits grouped by type
/extract-learnings   # Document session insights to CLAUDE.md
/release             # Complete release workflow (PR → publish → GitHub release)
/adapt-command       # Adapt commands for repo context
```

## Git Workflow - CRITICAL RULES

### NEVER Push to Main

**This is an absolute rule with NO exceptions:**

- ❌ NEVER `git push origin main`
- ❌ NEVER commit directly on main branch
- ❌ NEVER merge without PR review

**Correct workflow:**

1. Create feature/fix/release branch
2. Make changes and commit
3. Push branch to origin
4. Create PR for review
5. Merge PR on GitHub (not locally)
6. Pull merged main

**Why this matters:**

- Ensures code review on all changes
- Maintains clean git history
- Prevents accidental production updates
- Allows CI/CD validation before merge

**What I did wrong in session (2025-10-20):**

- Pushed commits directly to main (init fix + docs)
- Should have created `fix/init-local-config` branch first
- Should have created PR before merging

**Use `/release` command for releases** - it enforces this workflow automatically.

### Post-Merge Workflow

**Always checkout to main after PR merge:**

- ✅ Use `gh pr merge --merge --delete-branch` for automatic cleanup
- ✅ Verify you're on main branch: `git branch` should show `* main`
- ✅ Pull latest changes: `git pull origin main`
- ✅ Confirm clean working tree: `git status` should show "up to date with origin/main"

**Branch naming convention:**

- Use descriptive names: `fix/config-architecture-consistency`
- Pattern: `{type}/{descriptive-name}` (fix/, feat/, chore/, etc.)

## v0.2.0-beta: GitHub Preset System

### Overview

The GitHub preset system allows teams to share rules, commands, and MCPs via GitHub repositories. Presets are cloned to `~/.agentsync/cache/` and merged using namespace-based conflict prevention.

### Core Components

```
src/core/registry/
├── github-source.ts          # Parse github:org/repo[@ref] format
├── cache-manager.ts          # Manage cloned repos in ~/.agentsync/cache/
├── github-resolver.ts        # Clone repos (SSH/HTTPS fallback)
├── preset-loader.ts         # Load rules/commands/MCPs from repos
├── merger.ts                 # Namespace-based merging
└── registry-orchestrator.ts  # End-to-end workflow orchestration
```

### Config Format (v0.2.0-beta)

```json
{
  "version": "1.0",
  "extends": [
    "github:company/standards",
    {
      "source": "github:team/backend-rules",
      "namespace": "backend",
      "include": ["rules/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "postgres"],
  "tools": ["cursor", "claude"],
  "useSymlinks": true,
  "createdAt": "..."
}
```

### Preset Repository Structure

```
github:company/standards/
├── .agentsync/
│   └── preset.json          # Optional metadata
├── commands/
│   ├── commit.md             # Generate commit messages
│   ├── review.md             # Code review checklist
│   └── test.md               # Run tests
├── rules/
│   ├── typescript.md         # TypeScript rules
│   ├── testing.md            # Testing guidelines
│   └── security.md           # Security patterns
├── mcp.json                  # Recommended MCPs for this preset
└── README.md
```

### Namespace-Based Merging

Presets are merged with namespace prefixes to prevent collisions:

```
company:commit.md    → .cursor/commands/company:commit.md
team:commit.md       → .cursor/commands/team:commit.md
company:typescript.md → .cursor/rules/company:typescript.mdc
```

MCPs are merged without namespaces (last-wins):

- If two presets define `github` MCP, last preset wins
- Project-level `mcpServers` in config override preset MCPs

### Key Design Decisions

1. **@main only**: Version tags deferred to v0.3.0
2. **GitHub only**: No npm, no URLs (simplest for v0.2.0-beta)
3. **Namespace required**: Extracted from org name by default
4. **Cache reuse**: Clones stored in ~/.agentsync/cache/ for speed
5. **SSH/HTTPS fallback**: Try SSH first, fall back to HTTPS

### Usage Examples

#### Example 1: Company-Wide Standards Preset

**Scenario**: Your company has TypeScript coding standards you want all teams to use.

**Step 1: Create preset repo** `github:acme/coding-standards`

```
acme/coding-standards/
├── rules/
│   ├── typescript.md      # TypeScript style guide
│   ├── testing.md         # Testing requirements
│   └── security.md        # Security best practices
├── commands/
│   ├── commit.md          # Conventional commit helper
│   └── review.md          # PR checklist
└── README.md
```

**Step 2: Teams extend in their projects**

```json
// .agentsync/config.json
{
  "version": "1.0",
  "extends": ["github:acme/coding-standards"],
  "tools": ["cursor", "claude"]
}
```

**Step 3: Sync to tools**

```bash
agentsync sync
# Rules appear in .cursor/rules/acme:typescript.mdc
# Commands appear in .cursor/commands/acme:commit.md
```

#### Example 2: Multiple Presets with Filtering

**Scenario**: Use company standards + team-specific backend rules, but filter out deprecated content.

```json
{
  "version": "1.0",
  "extends": [
    "github:acme/coding-standards",
    {
      "source": "github:acme/backend-team",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**", "commands/old-*.md"]
    }
  ],
  "tools": ["cursor", "claude"]
}
```

**Result**:

```
.cursor/rules/
├── acme:typescript.mdc        # From coding-standards
├── acme:testing.mdc           # From coding-standards
└── backend:api-design.mdc     # From backend-team (filtered)

.cursor/commands/
├── acme:commit.md             # From coding-standards
└── backend:deploy.md          # From backend-team (filtered)
```

#### Example 3: Preview Changes Before Applying

**Scenario**: You want to see what will be synced before actually writing files.

```bash
# Dry run shows what would happen
agentsync sync --dry-run

# Output:
📋 Dry run mode - no files will be written

Tools to sync: cursor, claude
Presets: 2
MCP servers: 0

  Rules: 5
  Commands: 3

Would sync 5 rules
Would sync 3 commands

✓ Dry run complete - no files were written
```

#### Example 4: Update Preset Caches

**Scenario**: Presets have been updated on GitHub, pull latest changes.

```bash
# Update all preset caches and sync
agentsync sync --update

# Output:
Loading configuration...
✔ Configuration loaded
Loading GitHub presets...
✔ Loaded 2 presets  # Re-cloned from GitHub
  Rules: 5
  Commands: 3

Syncing rules...
✔ Synced 5 rules
Syncing commands...
✔ Synced 3 commands

✅ Sync complete!
```

#### Example 5: Sync Only to Specific Tool

**Scenario**: You use both Cursor and Claude, but only want to update Cursor.

```bash
agentsync sync --tool cursor
# Only updates .cursor/ directory, not .claude/
```

#### Example 6: View Configured Presets

**Scenario**: Check what presets are extended and their cache status.

```bash
agentsync preset list

# Output:
📚 Extended Presets

github:acme/coding-standards
  Namespace: acme
  ✓ Cached (2.4MB, last updated: 1/15/2025)

github:acme/backend-team
  Namespace: backend
  Include: rules/*.md, commands/*.md
  Exclude: rules/deprecated/**, commands/old-*.md
  ✓ Cached (1.8MB, last updated: 1/15/2025)
```

#### Example 7: Clear Preset Caches

**Scenario**: Free up disk space by clearing cached presets.

```bash
# Clear only current project's preset caches
agentsync preset cache-clear

# Clear all preset caches system-wide
agentsync preset cache-clear --all
```

### Test Coverage

- 82 total tests (61 existing + 21 new)
- 12 unit tests for sync command
- 9 integration tests for sync workflow
- 29 unit tests for registry system (github-source, cache-manager, merger)
- All tests passing

## Architecture Overview

### Core Implementation Structure

```
src/
├── cli.ts                        # Commander.js entry
├── commands/
│   ├── init.ts                   # ✅ AGENTS.md: Interactive setup wizard
│   ├── mcp/                      # ✅ MCP: All commands (Phase 1 COMPLETE)
│   │   ├── sync.ts               # ✅ Sync MCPs to tools
│   │   ├── list.ts               # ✅ List available/active MCPs
│   │   ├── add.ts                # ✅ Add MCP to project
│   │   └── remove.ts             # ✅ Remove MCP from project (allows removing all)
│   └── [others].ts               # 🔨 AGENTS.md commands (TODO)
├── core/
│   ├── mcp/                      # ✅ MCP engine (Phase 1 COMPLETE)
│   │   ├── registry.ts           # ✅ Load ~/.agentsync/mcp.json
│   │   ├── config.ts             # ✅ Load agentsync.local.json
│   │   ├── tokens.ts             # ✅ Token substitution
│   │   └── env.ts                # ✅ .env file loader
│   ├── parser.ts                 # ✅ AGENTS.md: Remark-based parser
│   ├── errors.ts                 # ✅ Typed error hierarchy
│   ├── audit.ts                  # ✅ JSONL audit logger
│   ├── watcher.ts                # ✅ Chokidar file watcher
│   └── error-handler.ts          # Deprecated, use errors.ts
├── security/
│   ├── scanner.ts                # ✅ 25+ secret patterns
│   └── unicode-detector.ts       # ✅ CVE-2021-42574 protection
├── targets/                      # ✅ MCP targets (Phase 1 COMPLETE)
│   ├── mcp-base.ts               # ✅ Target interface
│   ├── cursor.ts                 # ✅ Cursor implementation
│   ├── claude.ts                 # ✅ Claude Code implementation
│   └── mcp-index.ts              # ✅ Target registry
├── translators/                  # 🔨 AGENTS.md translators (TODO)
├── utils/
│   └── debounce.ts               # ✅ Advanced debouncer
├── types/
│   ├── index.ts                  # Core interfaces and types
│   └── schemas.ts                # Zod validation schemas
└── templates/                    # AGENTS.md templates
    ├── default.md
    ├── typescript-react.md
    └── python-fastapi.md

tests/
├── unit/core/mcp/                # ✅ 38 tests
├── integration/targets/          # ✅ 16 tests
├── unit/commands/mcp/            # ✅ 28 tests
└── e2e/                          # ✅ 5 tests
Total: 87 MCP tests passing, >90% coverage
```

### Key Modules Explained

#### 1. **Parser Module** (`src/core/parser.ts`)

- **Class**: `AgentsMdParser`
- **Dependencies**: unified, remark-parse, gray-matter
- **Key Methods**:
  - `parse(content, filePath)`: Parses AGENTS.md to AST
  - `extractSections(ast)`: Extracts hierarchical sections
  - `sectionsToAgentsMd(sections)`: Converts to typed structure
  - `validate(agentsMd)`: Validates against Zod schema
- **Section Recognition**: Detects overview, build/test commands, code style, structure, git workflow, permissions, MCP servers

#### 2. **Secret Scanner** (`src/security/scanner.ts`)

- **Patterns**: 25+ regex patterns for API keys, tokens, passwords
- **Entropy Detection**: Shannon entropy threshold of 4.5
- **False Positive Filtering**: Ignores "example", "test", "demo", "<", ">"
- **Severity Levels**: critical > high > medium > low
- **Key Patterns**:
  - AWS: `AKIA*`, `AGPA*`, AWS secret keys
  - GitHub: `gh[ps]_*`, 40-char tokens
  - Google: `AIza*` API keys, OAuth client IDs
  - Database: MongoDB, PostgreSQL, MySQL connection strings
  - JWT tokens, private keys, OAuth tokens

#### 3. **Unicode Detector** (`src/security/unicode-detector.ts`)

- **CVE-2021-42574 Protection**: Trojan Source attacks
- **Dangerous Patterns**:
  - Zero-width characters: U+200B, U+200C, U+200D, U+FEFF
  - Bidirectional overrides: U+202A-E, U+2066-9
  - Homoglyphs: Cyrillic lookalikes (а, е, о, р, с, х, у)
- **Detection Logic**:
  - Suspicious sequences: 10+ zero-width chars
  - Mixed scripts in single line
  - Context extraction: 50 chars before/after

#### 4. **Audit Logger** (`src/core/audit.ts`)

- **Singleton Pattern**: Single instance per process
- **Format**: JSONL (one JSON per line)
- **Rotation**: 10MB files, 90-day retention
- **Event Types**:
  - INIT_WORKSPACE, CONFIG_CHANGE
  - FILE_CREATE, FILE_MODIFY, FILE_DELETE
  - SECURITY_SCAN, UNICODE_DETECTION
  - SYNC_START, SYNC_COMPLETE, SYNC_ERROR
- **Session Tracking**: UUID per CLI session

#### 5. **Init Command** (`src/commands/init.ts`)

- **Interactive Flow**:
  1. Template selection (default, typescript-react, python-fastapi)
  2. Tool selection (multi-select: cursor, claude, cline, windsurf, copilot)
  3. Symlink vs copy option
  4. .gitignore update prompt
- **Creates**:
  - AGENTS.md from template
  - .agentsync/config.json
  - .agentsync/{logs,backups,cache}/ directories
  - Tool-specific symlinks/copies
- **Tool Paths**:
  - Cursor: `.cursor/agents.md`, `.cursor/AGENTS.md`
  - Claude: `.claude/AGENTS.md`, `claude_project.md`
  - Cline: `.cline/AGENTS.md`, `.cline/instructions.md`
  - Windsurf: `.windsurf/AGENTS.md`, `.windsurf/instructions.md`
  - Copilot: `.github/copilot/AGENTS.md`, `.github/copilot-instructions.md`
- **Source of Truth**: `.agentsync/config.json` (not AGENTS.md)
  - Init fails only if config.json exists (without `--force`)
  - Skips AGENTS.md creation if file already exists (unless `--force`)
  - Enables adding AgentSync to projects with existing AGENTS.md files
  - Use cases: existing AGENTS.md projects, mature codebases, template projects

#### 6. **Error System** (`src/core/errors.ts`)

- **Base Class**: `AgentSyncError` with metadata
- **Specialized Classes**:
  - `SecurityError`: Secret/Unicode violations
  - `ValidationError`: Schema/format issues
  - `FileSystemError`: File operations
  - `ParseError`: Markdown parsing
  - `ConfigError`: Configuration problems
  - `SyncError`: Sync operations
- **Error Recovery**: `RetryStrategy` with exponential backoff

#### 7. **Type System** (`src/types/`)

- **Tool Types**: `'cursor' | 'claude' | 'cline' | 'windsurf' | 'copilot'`
- **Core Interfaces**:
  - `AgentsMd`: Main data structure
  - `Translator`: Tool converter interface
  - `SyncOperation`: File operation tracking
  - `ParseResult`: Parser output
- **Zod Schemas**: Runtime validation for all data structures
- **Workspace Types**: Monorepo support (nx, turborepo, pnpm, npm, yarn)

### MCP Modules (Phase 1 - COMPLETE)

#### 8. **MCP Registry Loader** (`src/core/mcp/registry.ts`)

- **Purpose**: Load global MCP server registry from `~/.agentsync/mcp.json`
- **Key Functions**:
  - `loadGlobalRegistry()`: Loads and validates global registry
  - `getGlobalRegistryPath()`: Returns path to registry file
- **Validation**: Ensures each MCP has `command` and `args` fields
- **Error Handling**: Helpful error messages with examples if registry missing

#### 9. **MCP Config Loader** (`src/core/mcp/config.ts`)

- **Purpose**: Load project MCP configuration and filter selected servers
- **Key Functions**:
  - `loadProjectConfig()`: Loads `agentsync.local.json`
  - `filterSelectedMCPs()`: Filters global registry to selected servers
- **Supports Two Formats**:
  - Array: `{"mcpServers": ["github", "postgres"]}`
  - Object: `{"mcpServers": {"github": true, "postgres": {...}}}`
- **Override Support**: Project-specific env var overrides
- **Empty Config Support**: Both `{"mcpServers": []}` and `{"mcpServers": {}}` are valid. Useful for: fresh starts, cleanup/testing, template projects. Running `mcp sync` with empty config clears all MCPs from tools (idempotent).

#### 10. **Token Substitution** (`src/core/mcp/tokens.ts`)

- **Purpose**: Replace `{VAR}` placeholders with actual environment values
- **Key Functions**:
  - `substituteTokens()`: Replaces tokens in single MCP
  - `substituteAllMCPs()`: Replaces tokens in all MCPs
  - `validateTokens()`: Ensures no tokens remain unsubstituted
- **Security**: Deep cloning to prevent mutations, never commits actual tokens
- **Pattern**: `/\{([A-Z_][A-Z0-9_]*)\}/g` for uppercase env vars

#### 11. **Environment Loader** (`src/core/mcp/env.ts`)

- **Purpose**: Load environment variables from `.env` file
- **Key Functions**:
  - `loadEnv()`: Parses .env and merges with process.env
- **Format**: Simple `KEY=value` format
- **Priority**: .env values override process.env

#### 12. **MCP Targets** (`src/targets/`)

- **Cursor Target** (`cursor.ts`):
  - Writes `.cursor/mcp.json`
  - Format: `{"mcpServers": {...}}` wrapper
- **Claude Target** (`claude.ts`):
  - Writes `.claude/mcp.json`
  - Format: Direct object (no wrapper)
- **Target Registry** (`mcp-index.ts`):
  - `detectMCPTargets()`: Auto-detect available tools
  - `getMCPTarget()`: Get target by name
- **Interface** (`mcp-base.ts`):
  - `detect()`: Check if tool is available
  - `syncMCP()`: Write MCP config to tool

#### 13. **MCP Commands** (`src/commands/mcp/`)

- **sync.ts**: Main sync workflow (load → filter → substitute → validate → sync)
- **list.ts**: Show available vs active MCPs
- **add.ts**: Add MCP to project config
- **remove.ts**: Remove MCP from project config
- **Test Coverage**: 90.28% with 28 unit tests + 5 E2E tests

## Development Patterns

### Test-Driven Development (TDD) Workflow

**Preferred approach for bug fixes and new features:**

1. **Write failing test first** - Demonstrate the issue or expected behavior
2. **Fix implementation** - Make the code work correctly
3. **Verify test passes** - Confirm the fix works
4. **Run full test suite** - Ensure no regressions

**Example pattern:**

```typescript
// 1. Write failing test
it("should write to .agentsync/config.json", async () => {
  await addMCP("github");
  const configExists = await fs.pathExists(".agentsync/config.json");
  expect(configExists).toBe(true);
});

// 2. Fix implementation
const configPath = path.join(process.cwd(), ".agentsync", "config.json");

// 3. Verify test passes
// 4. Run full suite
```

**Key principle:** Tests should follow natural user workflows, not bypass them with manual setup.

### Commit Strategy

**Atomic Commits:**

- Group related changes into single logical commits
- Each commit represents one complete change
- Avoid mixing features with refactoring or fixes

**Comprehensive Commit Messages:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Example:**

```
fix(config): standardize config file priority and improve error messages

- Establish .agentsync/config.json as primary team config (committed)
- Clarify agentsync.local.json as personal override (gitignored)
- Update error messages to guide users to correct config creation
- Improve code formatting and import organization
- Update tests to reflect new architecture priorities
- Fix test merge conflicts and ensure proper directory creation

This ensures consistent config file handling across all MCP commands
and provides clearer guidance for users setting up projects.
```

### Architecture Verification Pattern

**When analyzing commits or implementing changes:**

1. **Analyze the source** - Review commits, PRs, or requirements
2. **Check implementation status** - Verify what's actually implemented
3. **Create comprehensive summary** - Document findings with evidence
4. **Use TODO tracking** - Track analysis progress for complex tasks

**Verification workflow:**

- Extract ideas from commits/PRs
- Search codebase for implementation evidence
- Verify all ideas are fully implemented
- Document status with specific file locations and line numbers

### Adding a New Command

1. Create handler in `src/commands/[name].ts`
2. Export class implementing command pattern
3. Add command registration in `src/cli.ts`:
   ```typescript
   program.command('name')
     .description('...')
     .option(...)
     .action(async (options) => {
       const { handler } = await import('./commands/name.js');
       await handler(options);
     });
   ```
4. Add types to `src/types/index.ts`
5. Write tests in `tests/unit/commands/`

### Adding Security Patterns

1. Add to `SECRET_PATTERNS` in `src/security/scanner.ts`
2. Set severity and confidence levels
3. Add test cases with false positive checks
4. Update documentation

### Changing Validation Rules

1. Consider backward compatibility - prefer allowing more, not less
2. Update both implementation and tests simultaneously
3. Convert error tests to success tests when relaxing restrictions
4. Document use cases in CLAUDE.md, not just API changes
5. Add E2E tests to cover new behavior (all tests automated)

### Extending AGENTS.md Parser

1. Add section detection in `sectionsToAgentsMd()` method
2. Create parsing method like `parseNewSection()`
3. Update `AgentsMdSchema` in `src/types/schemas.ts`
4. Add to templates

### Implementing a Translator

1. Create `src/translators/[tool].ts`
2. Implement `Translator` interface:
   ```typescript
   export class CursorTranslator implements Translator {
     async translate(agentsMd: AgentsMd): Promise<FileOperation[]> {
       // Convert AgentsMd to tool-specific format
     }
     async validate(operations: FileOperation[]): Promise<void> {
       // Validate operations
     }
   }
   ```
3. Handle tool-specific config format
4. Test with dry-run mode

## Configuration

### Architecture Consistency

**Critical requirement:** All components must follow the documented file hierarchy consistently. Any deviation from `.agentsync/config.json` as primary is considered a bug.

### Config File Responsibilities

AgentSync uses separate config files with distinct purposes:

**`.agentsync/config.json`** (Project-level, committed):

- Created by: `agentsync init`
- Modified by: `agentsync mcp add/remove` (v0.2.0+)
- Purpose: Team-shared settings (tools, MCP servers, extends, security)
- Git: Committed to repository

**`agentsync.local.json`** (User-level, gitignored):

- Created by: User manually (v0.2.0) or `--scope local` (v0.3.0+)
- Modified by: User manually (v0.2.0) or MCP commands with `--scope local` (v0.3.0+)
- Purpose: Personal MCP overrides that differ from team config
- Git: NOT committed (in .gitignore)

**Loading Priority**: Project config loads first, then local file overrides `mcpServers` field if present.

**Use Case Example**:

- Team config has: `["github", "postgres"]`
- Developer adds locally: `["github", "postgres", "linear"]` (personal tool)
- Result: Developer gets all three, team only sees two in git

### 1. Project Configuration (`.agentsync/config.json`) - COMMITTED

**Created by:** `agentsync init` command
**Purpose:** Team-shared project settings
**Git:** Committed to repository

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude", "cline"],
  "useSymlinks": true,
  "security": {
    "secretScanning": {
      "enabled": true,
      "blockOnHighSeverity": true,
      "entropyThreshold": 4.5
    },
    "unicodeDetection": {
      "enabled": true,
      "blockOnHighRisk": true
    },
    "auditLogging": {
      "enabled": true,
      "retentionDays": 90,
      "maxFileSize": 10485760
    }
  }
}
```

This file is committed to git and shared with the team.

### 2. MCP Configuration (`agentsync.local.json`) - GITIGNORED

**Created by:** User manually (v0.2.0) or `agentsync mcp add --scope local` (v0.3.0+)
**Purpose:** User-specific/machine-specific MCP selections
**Git:** NOT committed (in .gitignore)

**IMPORTANT:** This file is **NOT** created by `agentsync init`. Each developer creates their own based on which MCPs they need.

The MCP configuration supports both array and object formats, and **empty configs are valid**:

```json
// Array format (simple selection)
{
  "mcpServers": ["github", "postgres"]
}

// Object format (with overrides)
{
  "mcpServers": {
    "github": true,
    "postgres": {
      "env": {
        "POSTGRES_URL": "custom_value"
      }
    }
  }
}

// Empty config (valid - useful for fresh start or cleanup)
{
  "mcpServers": []
}
// or
{
  "mcpServers": {}
}
```

**How to create:**

1. **Manual:** Create file yourself: `echo '{"mcpServers": []}' > agentsync.local.json`
2. **Future (v0.3.0):** `agentsync mcp add --scope local` (creates file automatically)

**Use Cases for Empty Configs:**

- Starting a new project, planning to add MCPs later
- Temporarily removing all MCPs during testing/debugging
- Template projects with no MCPs configured initially
- Running `mcp sync` with empty config clears all MCPs from tools

**Why separate files?**

- Different developers need different MCPs (e.g., one works on backend with postgres, another on frontend with figma)
- Local file stays private (user preferences, not team requirements)
- Project config is shared (team agrees on tools and security settings)

### Build Configuration

- **TypeScript**: Strict mode, ES2022 target, path aliases (`@/*`)
- **Vite**: ESM-only, Node 18+, no minification for debugging
- **Vitest**: Node environment, v8 coverage, 80% target

## Code Standards

### TypeScript

- Strict mode enabled (`strict: true`)
- No implicit any (`noImplicitAny: true`)
- Use type-only imports when possible
- Prefer interfaces over types for objects
- Use const assertions for literals

### Error Handling

- Always use typed error classes
- Include context and recovery suggestions
- Log errors to audit before throwing
- Never throw plain strings

### Security

- All inputs validated with Zod
- Secrets scanned before any file operation
- Unicode attacks detected and blocked
- File operations use atomic writes

### Testing

- Unit tests for all public APIs
- Integration tests for command flows
- Coverage target: >80%
- Use test fixtures in `tests/fixtures/`

#### Install Test (Production Package Validation)

- New E2E test validates `pnpm pack` → `npm install -g` workflow
- 21 tests covering:
  - Tarball creation and global install
  - Full MCP workflow (add, sync, remove)
  - Init command with all 3 templates (validates template path resolution)
  - Production package quality checks
- Replaces manual QA agent testing
- Runs weekly in CI + before releases (not every PR due to ~30-60s runtime)
- File: `tests/e2e/install-test.test.ts`
- CI: `.github/workflows/install-test.yml`

#### When to Use Automated Tests vs Agents

**Use automated E2E tests for:**

- CLI tool installation workflows (pnpm pack, npm install -g)
- Repetitive validation that can be scripted
- Production package quality checks (tarball size, file inclusion)
- Cross-platform CLI execution (use execa for shell testing)

**Use agents only for:**

- Exploratory testing ("try to break this")
- Visual/GUI validation
- Complex external service integration
- One-time migration or analysis tasks

**Pattern**: If an agent repeats the same commands every time, convert to automated test.

### Cross-Platform Testing

- Set both `process.env.HOME` and `process.env.USERPROFILE` (Windows uses USERPROFILE)
- Use retry logic in cleanup (3 retries with 100ms delay for Windows file locking)
- Add trap handlers in BATS tests: `trap 'cleanup_trap' EXIT INT TERM`
- Skip file permission tests on CI (permissions don't persist through build)

### Test Isolation Best Practices

- **E2E CLI tests**: Copy `dist/` folder + create symlink to `node_modules/`
- **Why**: Vite externalizes all dependencies (not bundled into dist)
- **Critical**: NODE_PATH doesn't work with ESM (only works with CommonJS `require()`)
- **See**: ADR-002 (agentsync-docs/adr) for detailed rationale
- **Pattern**:

  ```typescript
  beforeAll(async () => {
    tempCliDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-cli-"));
    await fs.copy("dist", path.join(tempCliDir, "dist"));
    await fs.copy("package.json", path.join(tempCliDir, "package.json"));

    // Critical: Symlink node_modules (ESM can't use NODE_PATH)
    const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
    await fs.symlink(
      nodeModulesPath,
      path.join(tempCliDir, "node_modules"),
      "dir"
    );

    tempCliPath = path.join(tempCliDir, "dist", "cli.js");
  });

  // Helper function for cleaner tests
  function execaCli(args: string[], options: any = {}) {
    return execa("node", [tempCliPath, ...args], options);
  }
  ```

- **Cleanup**: Only in `afterAll`, never in `afterEach` (to preserve CLI across tests)

## Current Limitations

### Phase 1 (MCP) - COMPLETE ✅

- ✅ All 4 MCP commands implemented and tested
- ✅ Token substitution and validation
- ✅ Cursor and Claude Code targets
- ✅ Empty MCP configs supported (allows 0 servers for fresh start/cleanup)
- ✅ Apple-like UX: Helpful status messages, auto-recovery, guided workflows
- ✅ 166 Vitest unit tests: >90% coverage
- ✅ 22 Install tests: Production validation (includes init command + new UX)
- ✅ 26 BATS tests: Shell validation
- ✅ 11 Error scenario tests: Edge cases and error handling
- ✅ 207 total automated tests (no manual tests - all automated)

### Phase 2 (AGENTS.md) - IN PROGRESS ⏳

**Completed:**

- ✅ init command, parser, security, audit, errors, watcher

**Not Implemented Yet:**

- ❌ sync, watch, validate, diff, migrate, doctor, status, audit CLI, tree commands
- ❌ All 5 translator implementations (Cursor, Claude, Cline, Windsurf, Copilot)
- ❌ Atomic sync with rollback
- ❌ Conflict detection/resolution
- ❌ Remote audit shipping
- ❌ Monorepo workspace resolution

### Known Issues (AGENTS.md)

- Parser handles basic markdown only (no complex nested structures)
- Unicode sanitization not integrated into main flow
- Secret scanner doesn't persist findings between runs
- No actual AGENTS.md syncing occurs yet (only init creates files)

### Known Issues (CI/CD)

- Coverage thresholds disabled (caused false failures on some platforms - use Codecov instead)
- ShellCheck runs only on Linux (apt-get unavailable on macOS/Windows)
- Shebang tests skipped on CI (file permissions don't persist through pnpm build)

### ESM Module Resolution Gotchas

- **NODE_PATH doesn't work with ES modules**: Use symlinks or copy node_modules
- **Why**: NODE_PATH only affects CommonJS `require()`, not ESM `import` statements
- **Test isolation**: Create symlink to node_modules in temp CLI location (see Test Isolation Best Practices)
- **Alternative**: Copy node_modules (slow, ~500MB) or run from original location (loses isolation)
- **See**: ADR-002 (agentsync-docs/adr) for complete analysis

### Filesystem Utilities

- **Native Node.js APIs**: AgentSync uses native `node:fs/promises` APIs exclusively
- **Utility helpers**: Common operations wrapped in `src/utils/fs.ts`
- **Pattern**:

  ```typescript
  // Import from utils (wrappers for common operations)
  import { pathExists, outputFile, ensureDir, copy, remove } from './utils/fs.js';

  // Or use native Node.js APIs directly
  import { readFile, writeFile, symlink } from 'node:fs/promises';

  // Check if file exists
  if (await pathExists(path)) { ... }

  // Write file (creates parent dirs automatically)
  await outputFile(path, content);

  // Reading files/JSON
  const content = await readFile(path, 'utf-8');
  const data = JSON.parse(content);

  // Writing JSON
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  ```

## Debug Tips

1. **Verbose Output**: Set `DEBUG=true` environment variable
2. **Audit Logs**: Check `~/.agentsync/logs/audit-*.log` (JSONL format)
3. **Test Specific Module**: `pnpm test src/path/to/module.test.ts`
4. **Check Config**: Inspect `.agentsync/config.json` for issues
5. **Dry Run**: Always use `--dry-run` flag when testing sync
6. **Parser Testing**: Use `pnpm cli validate` to test parsing
7. **Empty Configs**: Valid for all MCP commands - use for fresh starts or cleanup
8. **Test Mocks**: When using `vi.mock('../utils/fs.js')`, ensure all used methods are mocked:
   - Common mocks: `pathExists`, `outputFile`, `ensureDir`, `copy`, `remove`
   - E2E tests use real filesystem (not mocked), so they catch missing methods

## TDD for Bug Fixes

When fixing bugs, follow TDD approach:

1. **Write failing tests first** - Create tests that demonstrate the bug
2. **Update implementation** - Fix the code to make tests pass
3. **Verify with real usage** - Test CLI in actual scenarios
4. **Test coverage patterns**:
   - Success case (new behavior works)
   - Error case (proper validation)
   - Skip logic (conditional behavior)
   - Force flag override (when applicable)

Example: Init command fix added 3 new tests + 1 updated test before implementation.

**Key Learning**: When upgrading dependencies, update test mocks BEFORE implementation to catch API changes early.

**See**: ADR-002 (agentsync-docs/adr) for complete details.

## npm Publishing Workflow

When releasing a new version:

1. **Update version**: Edit `package.json` version field
2. **Update changelog**: Add entry to `CHANGELOG.md` with date
3. **Commit**: `chore: bump version to X.Y.Z and update changelog`
4. **Tag**: `git tag vX.Y.Z`
5. **Push**: `git push origin main && git push origin vX.Y.Z`
6. **Build & Test**: `pnpm build && pnpm test`
7. **Publish**: `npm publish` (version string includes alpha/beta - no dist-tag needed)

Note: Pre-release versions like `0.2.0-alpha.5` don't need `--tag alpha` - the version string itself signals pre-release status.

## Important Files & Paths

### Configuration

- **MCP (Phase 1)**:
  - `~/.agentsync/mcp.json` - Global MCP registry
  - `.agentsync/config.json` - Project config (team-shared, committed)
  - `agentsync.local.json` - User overrides (personal, gitignored)
  - `.env` - Environment variables (gitignored)
- **Configuration Loading**:
  - Reading priority: `.agentsync/config.json` → `agentsync.local.json` → `.agentsync/config.local.json`
- Writing (v0.2.0): CLI always writes to `.agentsync/config.json`
- Writing (v0.3.0+): CLI respects `--scope` flag (local|user|project)
- **AGENTS.md (Phase 2)**:
  - `.agentsync/config.json` - Project configuration
  - `AGENTS.md` - Source of truth
  - Tool configs - `.cursor/`, `.claude/`, etc.

### Logs & Data

- `~/.agentsync/logs/audit-*.log` - Global audit logs
- `.agentsync/backups/` - Pre-sync backups
- `.agentsync/cache/` - Temporary files

### Source Entry Points

- **MCP (Phase 1)**:
  - `src/commands/mcp/sync.ts` - MCP sync command
  - `src/core/mcp/registry.ts` - Global registry loader
  - `src/core/mcp/tokens.ts` - Token substitution
  - `src/targets/cursor.ts` - Cursor target
- **AGENTS.md (Phase 2)**:
  - `src/cli.ts` - Main CLI application
  - `src/commands/init.ts` - Init command implementation
  - `src/core/parser.ts` - AGENTS.md parser
- **Shared**:
  - `src/security/scanner.ts` - Secret detection
  - `src/core/errors.ts` - Error handling

## References

- [AGENTS.md Spec](https://github.com/orgs/OpenAI/discussions/156)
- [CVE-2021-42574](https://trojansource.codes/) - Unicode vulnerability
- Package manager: Use `pnpm` (not npm/yarn)
