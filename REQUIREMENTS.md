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

- `.agentsync/config.json` as canonical source of truth
- `AGENTS.md` at repository root as optional supplementary documentation
- AgentSync does not extract configuration from AGENTS.md content
- AgentSync does create, template, symlink, and security-scan AGENTS.md
- AgentSync symlinks AGENTS.md to tool-specific locations for convenience (e.g., `.clinerules/AGENTS.md`)

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

**Purpose**: Optionally provide universal documentation format via symlinks

**Behavior**:

- AgentSync creates symlinks to root `AGENTS.md` for tool-specific locations
- Tools with native AGENTS.md support (Cursor, RooCode) read from repository root directly
- Tools requiring specific paths have symlinks created (e.g., `.clinerules/AGENTS.md` → `../AGENTS.md`)

**Important**: AGENTS.md is optional supplementary documentation. The source of truth is `.agentsync/config.json` + `agentsync.local.json` + presets.

### 2. Rules & Commands Sync

**Architecture**: Three-layer system

**Layer 1: GitHub Presets** (immutable, org-controlled)

- Cached in `~/.agentsync/cache/github-org-repo/`
- Pull latest: `agentsync sync --pull`
- Version-controlled by organization

**Layer 2: Project Custom** (team-editable, in git)

- Located: `.agentsync/rules/*.md`, `.agentsync/commands/*.md`
- Can have frontmatter for cross-tool metadata
- Coexists with preset files via namespace isolation
- Project custom files are NOT namespaced, distinguishing them from preset files which are always namespaced
- Example: `.agentsync/rules/custom-auth.md` coexists with `company/typescript.md` from presets (or `company_typescript.md` for flat tools)

**Layer 3: Tool Outputs** (generated, gitignored)

- `.cursor/rules/*.mdc`, `.cursor/commands/*.md`
- `.claude/commands/*.md`
- `.clinerules/*.md`
- Regenerated on each `agentsync sync`
- Copied from Layers 1+2 (not symlinked)

**Sync flow**:

```
GitHub Presets + Project Custom → Merge → Copy to Tools
   (Layer 1)       (Layer 2)             (Layer 3)
```

**Merge strategy**: Project custom rules and commands coexist with preset rules/commands

- **Preset rules/commands**: Always namespaced (e.g., `company/typescript.md`, `team/react.md`)
- **Project custom rules/commands**: Never namespaced (e.g., `typescript.md`, `auth.md`)
- **Coexistence**: Both can exist side-by-side without collision
- **Namespace prefixes**: Prevent conflicts between multiple presets

**Namespace output format**:

Files use namespace formatting in tool outputs based on each tool's capabilities:

**Nested directory tools** (Cursor, Claude Code, RooCode):

```
Preset file: rules/typescript.md
Namespace: company
Tool output (Cursor): .cursor/rules/company/typescript.mdc
Tool output (Claude):  .claude/rules/company/typescript.md
Tool output (RooCode): .roo/rules/company/typescript.md
```

**Flat structure tools** (Cline):

```
Preset file: rules/typescript.md
Namespace: company
Tool output: .clinerules/company_typescript.md
```

Project custom files are NOT namespaced:

```
Project file: rules/auth.md
Tool output (Cursor): .cursor/rules/auth.mdc
Tool output (Cline):  .clinerules/auth.md
```

**Rules**: AI agent instructions and guidelines (e.g., coding standards, security practices, testing patterns)

- Stored in `.agentsync/rules/` or loaded from presets
- Synced to tool-specific formats:
  - Cursor: `.cursor/rules/*.mdc` (nested: `company/typescript.mdc`)
  - Claude: `.claude/rules/*.md` (nested: `company/typescript.md`)
  - Cline: `.clinerules/*.md` (flat: `company_typescript.md`)
- Namespace-formatted to prevent conflicts between presets

**Commands**: Slash commands for AI agents (e.g., `/commit`, `/test`, `/review`)

- Stored in `.agentsync/commands/` or loaded from presets
- Synced to tool-specific formats:
  - Cursor: `.cursor/commands/*.md` (nested: `company/commit.md`)
  - Claude: `.claude/commands/*.md` (nested: `company/commit.md`)
- Namespace-formatted to prevent conflicts between presets

**Sync behavior**:

- Single `agentsync sync` command syncs all content
- Namespace isolation prevents conflicts between presets
- Deterministic output (same input = same output)
- Files are always rewritten on each sync for simplicity (no timestamp comparison or change detection)

### 3. Preset Selection from GitHub

**Purpose**: Select which MCP servers to enable from preset-defined options

**Selection levels**:

- **Project level** (`.agentsync/config.json`): Team-shared MCP selection via `mcpServers`
- **User level** (`agentsync.local.json`): Personal overrides (widen/narrow selection)
- Local overrides win over project config

**How it works**:

- Presets provide full MCP server definitions (command, args, env) in their `mcp.json`
- Project config enables subset via `mcpServers`: `["github", "postgres"]`
- User can override locally: `"mcpServers": []` (disable all)
- Multiple presets can define the same MCP server (last-wins merge)
- Token substitution for environment variables: `{VAR_NAME}` (missing variables trigger warning)

### 4. Preset System

**Purpose**: Share presets, commands, and MCP configs across teams via extensible source plugins.

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
└── mcp.json                  # MCP server definitions (project/user selects which to enable)
```

**Merging behavior**:

- Rules/commands: Namespace-based, tool-appropriate formatting (nested dirs or flat with underscore)
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

**Security defaults**: Security features are enabled by default. Defaults apply when:

- Security section is present but fields are omitted
- Security section is entirely absent from config

Defaults only disabled if explicitly set to `false`.

**Configuration notes**:

- Presets define MCP servers; projects enable via `mcpServers`
- File filtering: `extends[].include` and `extends[].exclude` (globs relative to preset root)
- MCP priority: `agentsync.local.json` → `.agentsync/config.json` (local wins)
- Preset sources: `github:` in v0.2.0, generic `git:` planned

---

## Configuration Architecture

### JSON Configuration Format

**Core config file**: `.agentsync/config.json`

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
  "mcpServers": ["context7"],
  "security": {
    "secretScanning": { "enabled": true, "blockOnHighSeverity": true },
    "unicodeDetection": { "enabled": true, "blockOnHighRisk": true }
  }
}
```

**Security defaults**: Security features are enabled by default. Defaults apply when:

- Security section is present but fields are omitted
- Security section is entirely absent from config

Defaults only disabled if explicitly set to `false`.

**Configuration notes**:

- Presets define MCP servers; projects enable via `mcpServers`
- File filtering: `extends[].include` and `extends[].exclude` (globs relative to preset root)
- MCP priority: `agentsync.local.json` → `.agentsync/config.json` (local wins)
- Preset sources: `github:` in v0.2.0, generic `git:` planned

### Local Overrides

**File**: `agentsync.local.json` (git-ignored, user-specific)

**Purpose**: User-specific MCP server selection overrides

**Merge strategy (Option A)**: Local `mcpServers` replaces project `mcpServers` entirely

- If local config specifies `mcpServers: []` (empty array), all MCPs are disabled
- If local config doesn't specify `mcpServers`, project config is used
- Empty array `[]` is the only way to completely disable MCPs

**Example**:

Project (`.agentsync/config.json`):

```json
{ "mcpServers": ["github", "postgres"] }
```

Local (`agentsync.local.json`):

```json
{ "mcpServers": ["filesystem"] }
```

**Result**: Only `filesystem` MCP is enabled (local replaces project entirely)

**Rationale**: Simple and predictable. Users have full control over their local MCP selection without unexpected inheritance.

### Interactive Selection (TUI)

- Users choose sync targets without knowing schema
- File selections persist as `extends[].include`/`extends[].exclude` globs
- MCP selections persist to project or local config
- Preview/confirm step required

### Agent Compatibility

- **Cursor**: `.cursor/rules/*.mdc`, `.cursor/commands/*.md`, `mcp.json`
- **Claude Code**: `.claude/rules/*.md`, `.claude/commands/*.md`, `CLAUDE.md` at root (symlink to `AGENTS.md`)
- **Cline**: `.clinerules/*.md` (rules), symlink `.clinerules/AGENTS.md` to `AGENTS.md`

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
├── CLAUDE.md                  # Symlink to AGENTS.md (for Claude)
├── .cursor/                   # Generated for Cursor
│   ├── rules/*.mdc
│   ├── commands/*.md
│   └── mcp.json
├── .claude/                   # Generated for Claude
│   ├── rules/*.md             # Rules (nested dirs)
│   ├── commands/*.md          # Commands (nested dirs)
│   └── mcp.json
└── .clinerules/               # Generated for Cline
    ├── AGENTS.md              # Symlink to root AGENTS.md
    └── *.md                   # Rules (flat structure)

Global data:
~/.agentsync/logs/            # Audit logs
~/.agentsync/cache/           # Preset cache
```

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

- Security: Secret scanning and Unicode detection (enabled by default, opt-out via `false`)
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

## Core Requirements

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

## References

**Standards**:

- AGENTS.md: https://agents.md
- Model Context Protocol: https://modelcontextprotocol.io
