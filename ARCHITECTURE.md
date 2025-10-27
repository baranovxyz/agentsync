# AgentSync Architecture

This document describes the technical architecture, design decisions, and key modules of AgentSync.

> **Note**: For implementation guides and development workflows, see [CLAUDE.md](CLAUDE.md). For architectural decision records (ADRs), see [../agentsync-docs/adr/](../agentsync-docs/adr/).

## Table of Contents

- [Overview](#overview)
- [Configuration Files](#configuration-files)
- [Directory Structure](#directory-structure)
- [Core Modules](#core-modules)
- [Design Principles](#design-principles)

## Overview

**AgentSync** is a CLI tool built with TypeScript that provides two main features:

1. **MCP Context Optimizer** (v0.2.0-alpha ✅) - Project-specific MCP server selection
2. **AGENTS.md Sync** (v0.3.0-beta ⏳) - Unified AGENTS.md sync to all AI coding tools

### Technology Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+
- **Build**: Vite (ESM-only)
- **CLI Framework**: Commander.js
- **Testing**: Vitest + BATS
- **Validation**: Zod schemas
- **File watching**: Chokidar
- **Markdown parsing**: unified + remark

## Configuration Files

AgentSync uses a convention-based configuration structure following common tool patterns:

### Team-Shared Configuration (Committed)

**`.agentsync/config.json`** - Project-level configuration

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "useSymlinks": true,
  "security": {
    "secretScanning": { "enabled": true },
    "unicodeDetection": { "enabled": true }
  }
}
```

Optionally can also define team-shared MCPs in `.agentsync/config.json`:

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "mcpServers": ["github"] // Available to all team members
}
```

### Local Configuration (Gitignored)

**`agentsync.local.json`** - Developer-specific MCP selections

```json
{
  "mcpServers": ["github", "postgres", "filesystem"]
}
```

**Loading Priority**: `agentsync.local.json` → `.agentsync/config.json`

**Merge Strategy**: Local config overrides team config for MCPs

### Global Configuration

**`~/.agentsync/mcp.json`** - Global MCP server registry

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
  },
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "POSTGRES_URL": "{DATABASE_URL}" }
  }
}
```

**Rationale**: See [ADR-001: Config File Locations](../agentsync-docs/adr/001-config-file-locations.md)

## Directory Structure

```
src/
├── cli.ts                        # Commander.js entry point
├── commands/
│   ├── init.ts                   # ✅ AGENTS.md: Interactive setup wizard
│   ├── mcp/                      # ✅ MCP: All commands (v0.2.0-alpha)
│   │   ├── sync.ts               # Sync MCPs to tools
│   │   ├── list.ts               # List available/active MCPs
│   │   ├── add.ts                # Add MCP to project
│   │   └── remove.ts             # Remove MCP from project
│   └── [future].ts               # 🔨 AGENTS.md commands (v0.3.0-beta)
├── core/
│   ├── mcp/                      # ✅ MCP engine (v0.2.0-alpha)
│   │   ├── registry.ts           # Global registry loader
│   │   ├── config.ts             # Project config loader + merger
│   │   ├── tokens.ts             # Token substitution engine
│   │   └── env.ts                # .env file parser
│   ├── parser.ts                 # ✅ AGENTS.md parser (remark-based)
│   ├── errors.ts                 # ✅ Typed error hierarchy
│   ├── audit.ts                  # ✅ JSONL audit logger
│   └── watcher.ts                # ✅ File watcher (chokidar)
├── security/
│   ├── scanner.ts                # ✅ Secret pattern detection (25+ patterns)
│   └── unicode-detector.ts       # ✅ CVE-2021-42574 protection
├── targets/                      # ✅ Per-tool converters (rules, commands, MCP)
│   ├── tools/                    # Converters
│   └── commands/                 # Command converters
├── translators/                  # 🔨 AGENTS.md translators (v0.3.0-beta)
├── utils/
│   └── debounce.ts               # Advanced debouncer
├── types/
│   ├── index.ts                  # Core interfaces
│   └── schemas.ts                # Zod validation schemas
└── templates/                    # AGENTS.md templates
    ├── default.md
    ├── typescript-react.md
    └── python-fastapi.md

tests/
├── unit/                         # Unit tests (166 tests)
│   ├── core/mcp/                 # MCP core logic (38 tests)
│   ├── commands/mcp/             # MCP commands (28 tests)
│   └── ...
├── integration/                  # Integration tests (16 tests)
│   └── targets/                  # MCP target tests
├── e2e/                          # End-to-end tests (21 tests)
│   ├── mcp-workflow.test.ts      # MCP workflow validation
│   └── install-test.test.ts      # Production package validation
└── shell/                        # Shell tests (26 BATS tests)
    └── cli.bats
```

## Core Modules

### 1. Parser Module (`src/core/parser.ts`)

**Purpose**: Parse AGENTS.md files into structured data

**Class**: `AgentsMdParser`

**Key Methods**:

- `parse(content, filePath)`: Parses AGENTS.md to AST
- `extractSections(ast)`: Extracts hierarchical sections
- `sectionsToAgentsMd(sections)`: Converts to typed structure
- `validate(agentsMd)`: Validates against Zod schema

**Section Recognition**: Overview, build/test commands, code style, structure, git workflow, permissions, MCP servers

**Dependencies**: unified, remark-parse, gray-matter

### 2. Secret Scanner (`src/security/scanner.ts`)

**Purpose**: Detect hardcoded secrets before file operations

**Features**:

- 25+ regex patterns for API keys, tokens, passwords
- Shannon entropy detection (threshold: 4.5)
- False positive filtering (ignores "example", "test", "demo", "<", ">")
- Severity levels: critical > high > medium > low

**Key Patterns**:

- AWS: `AKIA*`, `AGPA*`, AWS secret keys
- GitHub: `gh[ps]_*`, 40-char tokens
- Google: `AIza*` API keys, OAuth client IDs
- Database: MongoDB, PostgreSQL, MySQL connection strings
- JWT tokens, private keys, OAuth tokens

### 3. Unicode Detector (`src/security/unicode-detector.ts`)

**Purpose**: CVE-2021-42574 (Trojan Source) protection

**Dangerous Patterns**:

- Zero-width characters: U+200B, U+200C, U+200D, U+FEFF
- Bidirectional overrides: U+202A-E, U+2066-9
- Homoglyphs: Cyrillic lookalikes (а, е, о, р, с, х, у)

**Detection Logic**:

- Suspicious sequences: 10+ zero-width chars
- Mixed scripts in single line
- Context extraction: 50 chars before/after

### 4. Audit Logger (`src/core/audit.ts`)

**Purpose**: Comprehensive audit trail of all operations

**Implementation**: Singleton pattern with JSONL format

**Features**:

- One JSON per line for streaming parsers
- 10MB file rotation
- 90-day retention
- UUID session tracking

**Event Types**:

- `INIT_WORKSPACE`, `CONFIG_CHANGE`
- `FILE_CREATE`, `FILE_MODIFY`, `FILE_DELETE`
- `SECURITY_SCAN`, `UNICODE_DETECTION`
- `SYNC_START`, `SYNC_COMPLETE`, `SYNC_ERROR`

### 5. Init Command (`src/commands/init.ts`)

**Purpose**: Interactive project setup wizard

**Flow**:

1. Template selection (default, typescript-react, python-fastapi)
2. Tool selection (multi-select: cursor, claude, cline, roocode)
3. Symlink vs copy option
4. .gitignore update prompt

**Creates**:

- `AGENTS.md` from template
- `.agentsync/config.json` (project configuration, committed to git)
- `.agentsync/{logs,backups,cache}/` directories
- Tool-specific symlinks/copies

**Does NOT Create:**

- `agentsync.local.json` - User creates manually (v0.3.0) or via `--scope local` (v0.4.0+)

**Tool Paths**:

- Cursor: `.cursor/agents.md`, `.cursor/AGENTS.md`
- Claude: `.claude/AGENTS.md`, `claude_project.md`
- Cline: `.cline/AGENTS.md`, `.cline/instructions.md`
- RooCode: `.roo/AGENTS.md`, `.roo/instructions.md`

**Source of Truth**: `.agentsync/config.json` (not AGENTS.md)

- Init fails only if config.json exists (without `--force`)
- Skips AGENTS.md creation if file already exists (unless `--force`)
- Enables adding AgentSync to projects with existing AGENTS.md files
- Does not prompt or create MCP configuration (user responsibility)

### 6. Release Workflow

**Command**: Use `/release` slash command

**Critical Rule**: NEVER push to main branch

**Workflow**:

1. Create release branch: `release/v{version}`
2. Run pre-publish checks (build, tests, clean git)
3. Bump version: `npm version prerelease --preid=alpha`
4. Push branch + tags
5. Create PR with auto-generated changelog
6. **Manual review and merge PR**
7. Publish to npm: `npm publish`
8. Create GitHub release
9. Cleanup branches

**Two-Step Process**:

```bash
/release              # Creates PR
/release --publish    # After PR merged, publishes
```

**Safety Features**:

- Never pushes to main (always uses feature/release branch)
- Pre-publish checks ensure quality
- Manual PR review gate prevents accidents
- Rollback possible if publish fails

### 7. Error System (`src/core/errors.ts`)

**Purpose**: Typed error hierarchy with recovery strategies

**Base Class**: `AgentSyncError` with metadata

**Specialized Classes**:

- `SecurityError`: Secret/Unicode violations
- `ValidationError`: Schema/format issues
- `FileSystemError`: File operations
- `ParseError`: Markdown parsing
- `ConfigError`: Configuration problems
- `SyncError`: Sync operations

**Error Recovery**: `RetryStrategy` with exponential backoff

### 8. Type System (`src/types/`)

**Tool Types**: `'cursor' | 'claude' | 'cline' | 'roocode'`

**Core Interfaces**:

- `AgentsMd`: Main AGENTS.md data structure
- `Translator`: Tool converter interface
- `SyncOperation`: File operation tracking
- `ParseResult`: Parser output with metadata

**Validation**: All data structures validated with Zod schemas at runtime

**Workspace Types**: Monorepo support (nx, turborepo, pnpm, npm, yarn)

### 8. MCP Registry Loader (`src/core/mcp/registry.ts`)

**Purpose**: Load global MCP server registry

**Key Functions**:

- `loadGlobalRegistry()`: Loads and validates `~/.agentsync/mcp.json`
- `getGlobalRegistryPath()`: Returns registry file path

**Validation**: Ensures each MCP has `command` and `args` fields

**Error Handling**: Helpful error messages with examples if registry missing

### 9. MCP Config Loader (`src/core/mcp/config.ts`)

**Purpose**: Load and merge project MCP configurations

**Key Functions**:

- `loadProjectConfig()`: Loads `agentsync.local.json` (with fallback)
- `filterSelectedMCPs()`: Filters global registry to selected servers

**Supports Two Formats**:

- Array: `{"mcpServers": ["github", "postgres"]}`
- Object: `{"mcpServers": {"github": true, "postgres": {...}}}`

**Override Support**: Project-specific env var overrides

**Empty Config Support**: Both `[]` and `{}` are valid (useful for fresh starts, cleanup, templates)

### 10. Token Substitution (`src/core/mcp/tokens.ts`)

**Purpose**: Replace `{VAR}` placeholders with environment values

**Key Functions**:

- `substituteTokens()`: Replaces tokens in single MCP
- `substituteAllMCPs()`: Replaces tokens in all MCPs
- `validateTokens()`: Ensures no tokens remain unsubstituted

**Security**: Deep cloning to prevent mutations, never commits actual tokens

**Pattern**: `/\{([A-Z_][A-Z0-9_]*)\}/g` for uppercase env vars

### 11. Environment Loader (`src/core/mcp/env.ts`)

**Purpose**: Load environment variables from `.env` file

**Key Functions**:

- `loadEnv()`: Parses .env and merges with process.env

**Format**: Simple `KEY=value` format

**Priority**: .env values override process.env

### 12. Tool Converters (`src/targets/tools/`)

Unified per-tool converters for rules, commands, and MCPs. No legacy target base/registry.

### 13. MCP Commands (`src/commands/mcp/`)

**Implemented Commands**:

// `sync.ts` removed; MCP sync handled by main `sync` command

- `list.ts`: Show available vs active MCPs
- `add.ts`: Add MCP to project config
- `remove.ts`: Remove MCP from project config

**Test Coverage**: 90.28% with 28 unit tests + 5 E2E tests

## Design Principles

### 1. Security First

- All inputs validated with Zod schemas
- Secrets scanned before any file operation
- Unicode attacks detected and blocked
- Atomic file writes to prevent corruption
- Never commit actual tokens (only placeholders)

### 2. Type Safety

- TypeScript strict mode enabled
- Runtime validation with Zod
- No `any` types allowed
- Type-only imports where possible

### 3. Error Handling

- Typed error classes for all error categories
- Context and recovery suggestions included
- Errors logged to audit trail before throwing
- Never throw plain strings

### 4. Testing Strategy

- Unit tests for all public APIs
- Integration tests for command flows
- E2E tests for production workflows
- BATS tests for shell integration
- Coverage target: >80% (v0.2.0-alpha: 90%+)

### 5. Configuration Philosophy

- Convention over configuration
- Local overrides team config
- Empty configs are valid
- Gitignore local configs by default

### 6. Cross-Platform Support

- Tested on Ubuntu, macOS, Windows
- Node.js 18, 20, 22
- Both HOME and USERPROFILE env vars (Windows)
- Retry logic for file locking issues

### 7. Developer Experience

- Interactive CLI with helpful prompts
- Dry-run mode for safe testing
- Clear error messages with examples
- Comprehensive documentation

## Build Configuration

**TypeScript**:

- Strict mode enabled
- ES2022 target
- Path aliases (`@/*`)

**Vite**:

- ESM-only output
- Node 18+ target
- No minification (better debugging)

**Vitest**:

- Node environment
- v8 coverage provider
- 80% coverage threshold

## References

- [CLAUDE.md](CLAUDE.md) - Development guide
- [README.md](README.md) - User documentation
- [ADRs](../agentsync-docs/adr/) - Architecture decision records
- [AGENTS.md Spec](https://github.com/orgs/OpenAI/discussions/156)
- [CVE-2021-42574](https://trojansource.codes/) - Unicode vulnerability
