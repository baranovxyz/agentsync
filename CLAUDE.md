# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgentSync** is the missing infrastructure layer for AI coding agent configuration management with two main features:

1. **MCP Context Optimizer** (Phase 1 ✅) - Project-specific MCP server selection to reduce AI context bloat
2. **AGENTS.md Sync** (Phase 2 ⏳) - Unified AGENTS.md sync to all AI coding tools

**Current Status**:
- **Phase 1 (MCP)**: ✅ COMPLETE - 125 tests passing, >90% coverage, CI validated on 9 platforms, production-ready
- **Phase 2 (AGENTS.md)**: Foundation + Security complete, only `init` command fully implemented

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

### CI/CD
```bash
# GitHub Actions tests on 9 platforms: Ubuntu/macOS/Windows × Node 18/20/22
# Hierarchical timeouts: 5s unit tests, 10s hooks (2x multiplier on CI)
# Windows requires both HOME and USERPROFILE env vars for os.homedir()
# Coverage target: >80% (Phase 1 achieved 90%+)
```

### CLI Commands (via pnpm cli)
```bash
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
# - sync, watch, validate, diff, migrate, doctor, status, audit, tree
# These were removed from CLI help to avoid user confusion
```

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
5. Update manual tests in `manual-tests/` to match new behavior

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

### Project Configuration (`.agentsync/config.json`)
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

### MCP Configuration (`agentsync.local.json`)
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

**Use Cases for Empty Configs:**
- Starting a new project, planning to add MCPs later
- Temporarily removing all MCPs during testing/debugging
- Template projects with no MCPs configured initially
- Running `mcp sync` with empty config clears all MCPs from tools

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
- **E2E CLI tests**: Copy entire `dist/` folder to temp location in `beforeAll`
- **Why**: Prevents production CLI from being deleted during test execution
- **Required files**: Copy both `dist/` folder AND `package.json` (needed for --version)
- **Pattern**:
  ```typescript
  beforeAll(async () => {
    tempCliDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-cli-'));
    await fs.copy('dist', path.join(tempCliDir, 'dist'));
    await fs.copy('package.json', path.join(tempCliDir, 'package.json'));
    tempCliPath = path.join(tempCliDir, 'dist', 'cli.js');
  });
  ```
- **Cleanup**: Only in `afterAll`, never in `afterEach` (to preserve CLI across tests)

## Current Limitations

### Phase 1 (MCP) - COMPLETE ✅
- ✅ All 4 MCP commands implemented and tested
- ✅ Token substitution and validation
- ✅ Cursor and Claude Code targets
- ✅ Empty MCP configs supported (allows 0 servers for fresh start/cleanup)
- ✅ 166 Vitest tests: >90% coverage
- ✅ 21 Install tests: Production validation (includes init command with all templates)
- ✅ 26 BATS tests: Shell validation
- ✅ 48 Manual tests: Optional UX validation (mostly replaced by install test)
- ✅ 244 total automated tests

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

### fs-extra v11 Compatibility
- fs-extra v11+ removed `readJson` and `writeJson` methods
- **Solution**: Use native Node.js `readFile` from `node:fs/promises` + `JSON.parse`
- For writing with automatic directory creation: Use `fs.outputFile` from fs-extra
- **Pattern**:
  ```typescript
  // Reading JSON
  import { readFile } from 'node:fs/promises';
  const content = await readFile(path, 'utf-8');
  const data = JSON.parse(content);

  // Writing JSON (creates parent dirs)
  import { outputFile } from 'fs-extra';
  await outputFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  ```

## Debug Tips

1. **Verbose Output**: Set `DEBUG=true` environment variable
2. **Audit Logs**: Check `~/.agentsync/logs/audit-*.log` (JSONL format)
3. **Test Specific Module**: `pnpm test src/path/to/module.test.ts`
4. **Check Config**: Inspect `.agentsync/config.json` for issues
5. **Dry Run**: Always use `--dry-run` flag when testing sync
6. **Parser Testing**: Use `pnpm cli validate` to test parsing
7. **Empty Configs**: Valid for all MCP commands - use for fresh starts or cleanup
8. **Test Mocks**: When using `vi.mock('fs-extra')`, ensure all used methods are mocked:
   - Include `outputFile` if using it in source code
   - E2E tests use real fs-extra (not mocked), so they catch missing methods

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
  - `agentsync.local.json` - Project MCP selection
  - `.env` - Environment variables (gitignored)
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