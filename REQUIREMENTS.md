# Requirements

**This is the canonical source of truth for AgentSync architecture, features, and design.** Other docs (ARCHITECTURE.md, docs/) cross-reference this document. For implementation details, see ARCHITECTURE.md.

## Problem Statement

Teams use multiple AI coding agents (Cursor, Claude Code, Cline, GitHub Copilot, and other code assistants) but lack a unified way to share:

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
- AgentSync symlinks AGENTS.md to tool-specific locations for convenience if tools do not support it natively (e.g., `.clinerules/AGENTS.md`)

### Model Context Protocol (MCP) Integration

Industry-standard for tool integration; see [modelcontextprotocol.io](https://modelcontextprotocol.io).

**Requirements**:

- Centralized MCP server configuration management
- Support for tool-specific MCP formats (`.cursor/mcp.json`, `.claude/mcp.json`)
- Organization-level MCP server definitions
- Token substitution for environment variables: `{VAR_NAME}`
- Security policies for MCP tools

### Canonical Format Architecture

AgentSync uses a **canonical format** internally for all rules and commands, ensuring consistency and type safety throughout the system.

**Separated Structure**:

- **Frontmatter**: Parsed YAML as typed object (description, globs, priority, etc.)
- **Markdown**: Pure markdown content without frontmatter delimiters

**Benefits**:

- Parse once at entry, serialize once at exit
- Type-safe access to metadata throughout pipeline
- Simplified validation, merging, and duplicate resolution
- No repeated string parsing or format fragility

**Format Flow**:

```
┌─────────────┐                           ┌──────────────────┐                           ┌─────────────┐
│ Tool Format │ ──── Codec Import ───────>│ Canonical Format │ ──── Codec Export ──────>│ Tool Format │
│             │                           │                  │                           │             │
│ .mdc files  │    Parse frontmatter      │  { frontmatter,  │    Serialize to tool     │ .mdc files  │
│ .md files   │    Normalize paths        │    markdown }    │    Handle namespacing    │ .md files   │
│ Nested dirs │    Validate structure     │                  │    Tool-specific format  │ Flat files  │
└─────────────┘                           └──────────────────┘                           └─────────────┘
                                                    │
                                                    │ Type-safe operations:
                                                    │ • Duplicate detection
                                                    │ • Validation
                                                    │ • Merging
                                                    │ • Filtering
```

**Canonical Types**:

- `CanonicalRule`: Object with separated frontmatter (RuleFrontmatter) and markdown content
- `CanonicalCommand`: Object with separated frontmatter (CommandFrontmatter) and markdown content
- All internal operations (loading, merging, syncing) use this format

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
- **Must have frontmatter** for cross-tool metadata:
  - **Commands**: `description` (required), `argument-hint` (optional, defaults to `[optional arguments]`)
  - **Rules**: `description` (required), other fields optional (e.g., `globs`, `alwaysApply`, `priority`)
  - Files without proper frontmatter will show validation warnings but still sync
- Coexists with preset files via namespace isolation
- Project custom files are NOT namespaced, distinguishing them from preset files which are always namespaced
- Example: `.agentsync/rules/custom-auth.md` coexists with `company/typescript.md` from presets (or `company_typescript.md` for flat tools)

**Layer 3: Tool Outputs** (generated via bidirectional codecs, gitignored)

- `.cursor/rules/*.mdc`, `.cursor/commands/*.md`
- `.claude/commands/*.md`
- `.clinerules/*.md`
- Regenerated on each `agentsync sync`
- **Bidirectional Codecs**: Each tool has a codec that:
  - **Import**: Reads tool format → Converts to canonical format (separated frontmatter + markdown)
  - **Export**: Writes canonical format → Converts to tool-specific format
- All data flows through canonical format ensuring consistency
- Codecs handle format differences (.mdc vs .md, nested vs flat structures)

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

- **Extends**: Reference presets via plugin URIs (e.g., `github:org/repo`, `fs:./local/path`, `fs:~/.cursor`)
- **Namespaces**: Required for all presets to prevent naming conflicts
- **File filtering**: `include`/`exclude` globs for selective sync
- **Caching**: Sources cached in `~/.agentsync/cache/` for performance
- **Plugin architecture**: Extensible system (GitHub + filesystem sources)
- **Tool directories as sources**: Existing tool configs (e.g., `~/.cursor/`) can be referenced as read-only preset sources

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

### 5. Onboarding & Migration

**Purpose**: Enable safe adoption of AgentSync for users with existing tool configurations without data loss or commitment.

**Key principles**:

- **Non-destructive**: Never automatically delete user files
- **Safety first**: Automatic backups before all destructive operations
- **Progressive enhancement**: Start lightweight (reference mode) → upgrade to full features (import mode) when ready
- **Flexible source of truth**: User chooses which tool/config is authoritative

**Onboarding modes**:

**Reference Mode** (lightweight adoption):

- Existing tool directory referenced as read-only preset source via filesystem plugin
  - Global: `~/.cursor/` (user-level, applies to all projects)
  - Project: `./.cursor/` (project-level, this project only)
- Config: `{ "extends": [{ "source": "fs:~/.cursor", "namespace": "cursor" }] }`
- No file copying required
- Files read and normalized via codec on each sync
- Validation runs with warnings (doesn't block sync)
- Custom rules in `.agentsync/` coexist with referenced rules
- User explicitly controls which tools sync via `tools` array
- Best for: Users trying AgentSync without commitment, or maintaining existing tool as primary

**Import Mode** (full management):

- Existing configs copied to `.agentsync/` directory via codec importers
- Format conversion (`.mdc` → `.md`) and frontmatter generation via codecs
- All tools synced equally from `.agentsync/` source of truth
- Full AgentSync features enabled (presets, MCPs, etc.)
- Original files backed up automatically
- Best for: Teams adopting AgentSync fully, centralized config management

**Global + Project Setup**:

- User-level config: `~/.agentsync/config.json` (personal rules, always available)
- Project-level config: `.agentsync/config.json` (team rules, per-project)
- Both created on first init, global setup offered on every init
- Project config extends/overrides global config
- Duplicate preset sources: project version replaces global automatically
- User controls namespaces (can use different namespaces to keep both versions)

**Preset Deduplication**:

When the same preset source appears in both global and project configs:

- **Behavior**: Project version completely replaces global version
- **Detection**: By source URL (e.g., `github:company/standards`)
- **User notification**: Info message logged during sync
- **To keep both**: Use different namespaces in each config

**Example**:

```json
// Both configs reference same source - project wins:
Global:  { "source": "github:company/standards", "namespace": "company" }
Project: { "source": "github:company/standards", "namespace": "company" }
Result:  Only project version syncs

// Different namespaces - both kept:
Global:  { "source": "github:company/standards", "namespace": "company-global" }
Project: { "source": "github:company/standards", "namespace": "company" }
Result:  Both sync with different namespaces
```

**Backup & Restore**:

- Automatic backup before: `sync`, `init` (with existing files), `preset add`
- Backup location: `.agentsync/backups/YYYY-MM-DD-HH-MM-SS/`
- User-level backups: `~/.agentsync/backups/`
- Retention: Last 10 backups, 30 days (whatever has more)
- Restoration: `agentsync restore` with interactive selection

**Import workflow**:

- Detect existing tool directories (`~/.cursor/`, `~/.claude/`, etc.) via codec detection
- Offer mode selection: Reference / Import / Fresh
- Handle duplicates: Automatic last-wins resolution (most recently modified file wins)
- Show warnings for detected duplicates with clear resolution information
- Convert formats and generate frontmatter via codecs
- Verify with preview before applying

**See**: `research/research-plan.md` for detailed implementation plan.

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

## Bidirectional Codec System

**Architecture**: Tool converters are now bidirectional codecs that handle both reading from and writing to tool-specific formats, with all data flowing through a canonical format.

**ToolCodec Capabilities**:

Each codec implements both import (read) and export (write) operations:

**OUTPUT Operations** (Canonical → Tool Format):

- `syncAgentsMd`: Write AGENTS.md symlink/file for tool
- `syncRules`: Convert canonical rules to tool-specific format (.mdc, .md, nested/flat)
- `syncCommands`: Convert canonical commands to tool-specific format
- `syncMCP`: Generate tool-specific MCP configuration

**INPUT Operations** (Tool Format → Canonical):

- `detect`: Discover existing tool directories (global vs project scope)
- `importRules`: Read tool rules, normalize to canonical format
- `importCommands`: Read tool commands, normalize to canonical format
- `importMCP`: Read tool MCP configuration

**Import Always Validates**:

- No "read as-is" mode - all imports normalize and validate
- Tool format → Canonical format conversion always happens
- Missing frontmatter is auto-generated with intelligent defaults
- Format differences normalized (.mdc → .md conceptually)
- Type validation on all frontmatter fields
- Ensures consistency across all tools and sources

**Use Cases**:

1. **Import Mode**: One-time import from tool directory, files written to `.agentsync/`
2. **Reference Mode**: Read on each sync via filesystem source plugin (no file copying)
3. **Tool Detection**: Discover existing tool configurations during `init`
4. **Migration**: Convert between tool formats via canonical format as intermediary

**Scope Isolation Principle**:

- Global sources (`~/.cursor/`) import ONLY to global config (`~/.agentsync/`)
- Project sources (`./.cursor/`) import ONLY to project config (`./.agentsync/`)
- No cross-scope imports (maintains clear boundaries)
- Each `sync` suggests missing configs unless `--programmatic` flag is used

```
Import Sources:                  AgentSync Destinations:
┌──────────────┐                ┌──────────────────┐
│ ~/.cursor/   │ ──────────────>│ ~/.agentsync/    │  (Global config)
│ (global)     │   Import only  │                  │
└──────────────┘   to global    └──────────────────┘

┌──────────────┐                ┌──────────────────┐
│ ./.cursor/   │ ──────────────>│ ./.agentsync/    │  (Project config)
│ (project)    │   Import only  │                  │
└──────────────┘   to project   └──────────────────┘
```

**Codec Architecture**:

```
src/targets/tools/
├── cursor-codec.ts     # Bidirectional: .mdc format, nested directories
├── claude-codec.ts     # Bidirectional: .md format, nested directories
├── cline-codec.ts      # Bidirectional: .md format, flat structure
└── roocode-codec.ts    # Bidirectional: .md format, nested directories

Data Flow:
Tool Format → codec.import() → Canonical Format → codec.sync() → Tool Format
  (.mdc)         Parse & validate    {frontmatter,      Serialize         (.mdc)
                                       markdown}
```

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

**Purpose**: User-specific MCP configuration and selection overrides

**Merge strategy**:

- `mcpServers`: Simple override by key (last level wins per server)
- `mcpInclude`: Union across levels (accumulates selections)
- `mcpExclude`: Union across levels (accumulates exclusions)

**MCP Configuration Structure**:

Each level (global/project/local) can define:

1. **Registry** (`mcpServers`): Available MCP server definitions
2. **Selection** (`mcpInclude`/`mcpExclude`): Which servers to activate

**Example: Complete Flow**:

Global (`~/.agentsync/config.json`):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": { "ROOT_PATH": "{HOME}" }
    }
  }
}
```

Project (`.agentsync/config.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": ["exec", "postgres-mcp"],
      "env": { "POSTGRES_URL": "{POSTGRES_URL}" }
    }
  },
  "mcpInclude": ["github", "postgres"],
  "mcpExclude": ["filesystem"]
}
```

Local (`agentsync.local.json`):

```json
{
  "mcpServers": {
    "my-custom": {
      "command": "node",
      "args": ["./my-mcp.js"],
      "env": {}
    }
  },
  "mcpExclude": ["postgres"]
}
```

**Result**:

- **Merged Registry**: `{ github, filesystem, postgres, my-custom }` (all defined servers)
- **Merged Include**: `["github", "postgres"]` (from project, default if none specified is all registry)
- **Merged Exclude**: `["filesystem", "postgres"]` (union from project + local)
- **Active Servers**: `github, my-custom`
  - `github`: from global, included by project
  - `filesystem`: from global, excluded by project
  - `postgres`: from project, excluded by local
  - `my-custom`: from local, auto-included (all defined are included by default)

**Server Definition Format** (Cursor-compatible):

Command-based (local process):

```json
{
  "command": "npx",
  "args": ["-y", "mcp-server"],
  "env": { "API_KEY": "value" }
}
```

URL-based (HTTP remote):

```json
{
  "url": "http://localhost:3000/mcp",
  "headers": { "API_KEY": "value" }
}
```

**Merge Rules**:

- Registry merge: `{ ...global, ...project, ...local }` (per-key override)
- Include merge: Union of all include arrays across levels
- Exclude merge: Union of all exclude arrays across levels
- Default: If no `mcpInclude` specified at any level, all defined servers are included
- Final active: (Included servers) minus (Excluded servers)

**Rationale**:

- Matches Cursor/Claude MCP config format (industry standard)
- Flexible: Can inherit and extend, or override specific servers
- Explicit control: Include/exclude patterns familiar from VSCode, Docker Compose
- No field conflicts: Doesn't use `enabled`/`disabled` which tools may use

### Interactive Selection (TUI)

- Users choose sync targets without knowing schema
- File selections persist as `extends[].include`/`extends[].exclude` globs
- MCP selections persist to project or local config
- Preview/confirm step required

### Agent Compatibility

- **Cursor**: `.cursor/rules/*.mdc`, `.cursor/commands/*.md`, `mcp.json`
- **Claude Code**: `.claude/rules/*.md`, `.claude/commands/*.md`
- **Cline**: `.clinerules/*.md` (rules only, commands not supported)
- **Roocode**: `.roo/rules/*.md`, `.roo/commands/*.md`

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
├── .cursor/                   # Generated for Cursor (via CursorCodec)
│   ├── rules/*.mdc
│   ├── commands/*.md
│   └── mcp.json
├── .claude/                   # Generated for Claude (via ClaudeCodec)
│   ├── rules/*.md             # Rules (nested dirs)
│   ├── commands/*.md          # Commands (nested dirs)
│   └── mcp.json
└── .clinerules/               # Generated for Cline (via ClineCodec)
    ├── AGENTS.md              # Symlink to root AGENTS.md
    └── *.md                   # Rules (flat structure)

Global data:
~/.agentsync/
├── config.json              # User-level config (personal presets, rules)
├── rules/                   # User-level rules (available to all projects)
├── commands/                # User-level commands
├── backups/                 # User-level tool config backups
├── logs/                    # Audit logs
└── cache/                   # Preset cache

Codec Architecture:
src/targets/tools/           # Bidirectional codecs for each tool
├── cursor-codec.ts          # Import from / Export to Cursor (.mdc, nested)
├── claude-codec.ts          # Import from / Export to Claude (.md, nested)
├── cline-codec.ts           # Import from / Export to Cline (.md, flat)
└── roocode-codec.ts         # Import from / Export to RooCode (.md, nested)
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
- Non-destructive by default (automatic backups)
- Progressive adoption (reference → import modes)
- Safe experimentation (easy rollback via restore)

### 5. Extensibility

- Plugin architecture for new tools
- Community presets
- Preset composition (via `extends`)

### 6. Parse Once, Serialize Once

- Parse frontmatter at entry point (import/load from any source)
- Use structured canonical format throughout entire pipeline
- Serialize frontmatter only at exit point (write/sync to tools)
- No repeated parsing or string manipulation during processing
- Type safety via structured data (frontmatter as typed objects)
- Operations (merge, validate, filter) work on parsed objects, not strings

---

## Core Requirements

**Functional requirements**:

- Single command sync: `agentsync sync` syncs all configs
- Cross-tool commands: Define once, works in all tools
- Preset composition: Extends system with namespaces
- User privacy: Local preferences don't leak to team
- Multi-tool support: Cursor, Claude Code, Cline, RooCode
- Easy onboarding: `agentsync init` + interactive wizard with mode selection
- Safe migration: Reference mode (no file copying) and import mode (full features)
- Automatic backups: Before all destructive operations, with easy restore
- Global + project configs: User-level and project-level configuration layers
- MCP integration: Shared configs with token substitution
- Security: Secret scanning and Unicode attack detection (on by default)
- Bidirectional codecs: Read from and write to tool formats via canonical format
- Scope isolation: Global sources → global config, project sources → project config only
- Auto-validation: All imports normalize to canonical format and validate
- Smart suggestions: Each sync suggests missing configs (unless `--programmatic` flag)

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
