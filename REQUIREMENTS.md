# Requirements

**This is the canonical source of truth for AgentSync architecture, features, and design.** Other docs (CLAUDE.md, ARCHITECTURE.md, docs/) cross-reference this document. For quick reference, see CLAUDE.md.

## Problem Statement

Teams use multiple AI coding agents (Cursor, Claude Code, Cline, Windsurf, GitHub Copilot, and other code assistants) but lack a unified way to share:

- Rules/configurations
- Slash commands
- Prompts
- MCP server configurations
- Documentation

**The Pain**:

- Manual file copying between tools
- Configuration drift across projects
- Duplicate effort maintaining tool-specific formats
- No single source of truth
- Security risks from copying configs with secrets

**The Goal**: Create a tool that provides a single source of truth for AI coding agent configurations across different tools, using industry-standard formats (AGENTS.md, JSON, MCP).

---

## Standards Compliance

### AGENTS.md Standard Integration

Emerging cross-tool format; see [AGENTS.md](https://agents.md).

**Why AGENTS.md**:

- Supported by multiple tools (Cursor, Claude Code, GitHub Copilot, Zed, Phoenix, Aider, Gemini CLI)
- Encourages modular documentation for monorepos
- Deterministic, machine-readable Markdown format
- Tool-agnostic; avoids vendor lock-in

**Implementation approach**:

- `.agentsync/` as configuration root
- `AGENTS.md` at repository root as universal human/machine-readable format
- `.agentsync/config.json` as canonical orchestrator with preset composition
- Tools with native AGENTS.md support use root file directly
- Tools requiring specific locations use symlinks (e.g., `.clinerules/AGENTS.md`)

### Model Context Protocol (MCP) Integration

Industry-standard for tool integration; see [modelcontextprotocol.io](https://modelcontextprotocol.io).

**Requirements**:

- Centralized MCP server configuration management
- Support for tool-specific MCP formats (`.cursor/mcp.json`, `.claude/mcp.json`)
- Organization-level MCP server definitions
- Token substitution for environment variables: `{VAR_NAME}`
- Security policies for MCP tools

---

## Core Features

### 1. AGENTS.md Symlink Management

- Tools with native AGENTS.md support (e.g., Claude Code, Cursor) read from repository root directly
- Tools requiring specific locations (e.g., Cline) get symlinks created automatically
- Example: `.clinerules/AGENTS.md` → `AGENTS.md` (symlink)
- No conversion or translation, just symlinks where needed

### 2. Rules & Commands Sync

**Rules**: AI agent instructions and guidelines (e.g., coding standards, security practices, testing patterns)

- Stored in `.agentsync/rules/` or loaded from presets
- Synced to tool-specific formats:
  - Cursor: `.cursor/rules/*.mdc`
  - Claude: `.claude/commands/*.md`
- Namespace-prefixed to prevent conflicts (e.g., `company:typescript.mdc`)

**Commands**: Slash commands for AI agents (e.g., `/commit`, `/test`, `/review`)

- Stored in `.agentsync/commands/` or loaded from presets
- Synced to tool-specific formats:
  - Cursor: `.cursor/commands/*.md`
  - Claude: `.claude/commands/*.md`
- Namespace-prefixed (e.g., `company:commit.md`)

**Sync behavior**:

- Single `agentsync sync` command syncs all content
- Namespace isolation prevents conflicts between presets
- Deterministic output (same input = same output)

### 3. MCP Selection from Presets

**Purpose**: Select which MCP servers to enable from preset-defined options

**Selection levels**:

- **Project level** (`.agentsync/config.json`): Team-shared MCP selection via `mcpServers`
- **User level** (`agentsync.local.json`): Personal overrides (widen/narrow selection)
- Local overrides win over project config

**How it works**:

- Presets define available MCP servers in their `mcp.json`
- Project config enables subset: `"mcpServers": ["github", "postgres"]`
- User can override locally: `"mcpServers": []` (disable all)
- Token substitution for environment variables: `{VAR_NAME}`

### 4. Preset System

**Purpose**: Share rules, commands, and MCP configs across teams via extensible source plugins.

**Key features**:

- **Extends**: Reference presets via plugin URIs (e.g., `github:org/repo`, `fs:./local/path`)
- **Namespaces**: Required for all presets to prevent naming conflicts
- **File filtering**: `include`/`exclude` globs for selective sync
- **Caching**: Sources cached in `~/.agentsync/cache/` for performance
- **Plugin architecture**: Extensible system (GitHub v0.2.x, filesystem/custom planned)

**Preset structure**:

```
github:company/standards/
├── commands/
│   ├── commit.md
│   └── review.md
├── rules/
│   ├── typescript.md
│   └── security.md
└── mcp.json                  # Available MCPs (project/user enables subset)
```

**Merging behavior**:

- Rules/commands: Namespace-based (e.g., `company:commit.md`, `team:commit.md`)
- MCPs: Definitions merge last-wins; enablement via `mcpServers`

---

## Core Use Case

Configuration showing key patterns: organization presets, team-specific rules, namespace isolation, and local overrides.

**Example** (`.agentsync/config.json`):

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "extends": [
    { "source": "github:company/standards", "namespace": "company" },
    {
      "source": "github:team/frontend-rules",
      "namespace": "frontend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "context7"]
}
```

**Local override** (`agentsync.local.json`):

```json
{
  "mcpServers": []
}
```

**What this demonstrates**:

- Organization-wide standards (company namespace)
- Team-specific rules (frontend namespace) with filtering
- Local MCP override (personal preference, git-ignored)
- Multi-tool support (works in Cursor, Claude, Cline)

---

## Agent Compatibility

- **Cursor**: `.cursor/rules/*.mdc`, `.cursor/commands/*.md`, `mcp.json`
- **Claude Code**: `.claude/commands/*.md`, symlink `CLAUDE.md` to `AGENTS.md`
- **Cline**: `.clinerules/*.md` (rules), symlink `.clinerules/AGENTS.md` to `AGENTS.md`

---

## Configuration Architecture

### JSON Configuration Format

**Core config file**: `.agentsync/config.json`

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "extends": [
    { "source": "github:company/base", "namespace": "company" },
    {
      "source": "github:team/backend-rules",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["context7"],
  "security": {
    "secretScanning": { "enabled": true, "blockOnHighSeverity": true },
    "unicodeDetection": { "enabled": true, "blockOnHighRisk": true }
  }
}
```

**Configuration notes**:

- Presets define MCP servers; projects enable via `mcpServers`
- File filtering: `extends[].include` and `extends[].exclude` (globs relative to preset root)
- MCP priority: `agentsync.local.json` → `.agentsync/config.json` (local wins)
- Preset sources: `github:` in v0.2.0, generic `git:` planned

### Local Overrides

**File**: `agentsync.local.json` (git-ignored, user-specific)

**Purpose**: MCP selection and environment overrides only (v0.2.0)

**Merge strategy**: Local may widen/narrow `mcpServers`; other keys ignored in v0.2.0

### Interactive Selection (TUI)

- Users choose sync targets without knowing schema
- File selections persist as `extends[].include`/`extends[].exclude` globs
- MCP selections persist to project or local config
- Preview/confirm step required

### Directory Structure

```
<project-root>/
├── agentsync.local.json       # Git-ignored local overrides
├── .agentsync/
│   ├── config.json            # Main config (canonical)
│   ├── commands/              # Custom slash commands
│   ├── rules/                 # Custom rules
│   └── backups/               # Pre-sync backups
├── AGENTS.md                  # Universal format
├── .cursor/                   # Generated for Cursor
│   ├── rules/*.mdc
│   ├── commands/*.md
│   └── mcp.json
├── .claude/                   # Generated for Claude
│   ├── CLAUDE.md
│   ├── commands/*.md
│   └── mcp.json
└── .clinerules/               # Generated for Cline
    ├── AGENTS.md              # Symlink to root
    └── *.md                   # Rules

Global data:
~/.agentsync/logs/            # Audit logs
~/.agentsync/cache/           # Preset cache
```

---

## Monorepo Support

### Cascading Configuration

**Pattern**: Nearest-file-wins (OpenAI uses 88 AGENTS.md files in their monorepo)

```
monorepo/
├── .agentsync/config.json       # Root config
└── packages/
    ├── frontend/
    │   └── .agentsync/config.json # Extends + overrides root
    └── backend/
        └── .agentsync/config.json # Extends + overrides root
```

### Workspace Detection (Future)

**Supported monorepo types**:

- Nx (`nx.json`)
- Turborepo (`turbo.json`)
- pnpm workspace (`pnpm-workspace.yaml`)
- npm/yarn workspaces (`package.json` workspaces field)

Selective sync CLI flags planned. `--scope` reserved for config write target (`project|local|user`).

---

## Success Criteria

**Key metrics**:

- Sync latency: <5 seconds from change to propagation
- Tool compatibility: 95%+ feature parity across supported tools
- Onboarding speed: <10 minutes from install to working
- Migration accuracy: 100% for supported features

**Functional requirements**:

- Single command sync: `agentsync sync` syncs all configs
- Cross-tool commands: Define once, works in all tools
- Preset composition: Extends system with namespaces
- User privacy: Local preferences don't leak to team
- Multi-tool support: Cursor, Claude Code, Cline
- Easy onboarding: `agentsync init` + interactive wizard
- MCP integration: Shared configs with token substitution
- Security: Secret scanning and Unicode attack detection (on by default)

---

## Security Requirements

### Threat Model

AgentSync protects against three critical attack vectors:

**1. Secret Leakage**

- Prevention: Pre-sync scanning (25+ patterns)
- Enforcement: Blocks high-severity findings
- Status: ✅ Implemented (src/security/scanner.ts)

**2. Unicode Backdoor Attacks** (CVE-2021-42574)

- Prevention: Detects zero-width chars, bidirectional overrides, homoglyphs
- Enforcement: Blocks high-risk findings
- Status: ✅ Implemented (src/security/unicode-detector.ts)

**3. Configuration Tampering**

- Prevention: Immutable audit logging (JSONL)
- Detection: 90-day retention for forensics
- Status: ✅ Implemented (src/core/audit.ts)

### Security-by-Default Principles

- All security checks run by default (configurable)
- Clear, actionable error messages with remediation
- Local-first: No data leaves user's machine
- Configurable patterns and thresholds
- Performance: <5% overhead on sync operations

---

## Market Positioning

### Market Gap

Despite broad adoption of AI coding tools, **no mature platform provides centralized configuration management across multiple tools from a single source**.

**Current fragmented approaches**:

- Manual file copying (error-prone, time-consuming)
- Symbolic links (doesn't work in all environments)
- Tool-specific solutions (vendor lock-in)
- Parallel configuration systems (drift over time)

**Our differentiator**: True cross-tool configuration synchronization using industry standards (AGENTS.md, JSON, MCP).

---

## Implementation Principles

### 1. Standards-First

- AGENTS.md as universal format
- JSON for configuration (portable)
- MCP for tool integration

### 2. Local-First

- All operations work offline
- No cloud dependency for core features
- Optional `github:` sources
- User data stays on user's machine

### 3. Security by Default

- Secret scanning before every sync
- Unicode attack detection
- Audit logging for compliance

### 4. Developer Experience

- <10 minute setup time
- Clear, actionable error messages
- Interactive CLI with good defaults
- Dry-run mode for safety

### 5. Extensibility

- Plugin architecture for new tools
- Community presets
- Preset composition (via `extends`)

---

## References

**Standards**:

- AGENTS.md: https://agents.md
- Model Context Protocol: https://modelcontextprotocol.io
