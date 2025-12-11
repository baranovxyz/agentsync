# AgentSync Architecture

This page gives a high-level view of AgentSync’s architecture and points to deeper docs.

## Overview

AgentSync manages AI coding agent configuration through a three-layer system:

**Layer 1: GitHub Presets** (immutable, org-controlled)

- Shared rules, commands, MCPs via GitHub repositories
- Cached locally in `~/.agentsync/cache/`
- Pull latest with `agentsync sync --pull`

**Layer 2: Project Custom** (team-editable, in git)

- Project-specific rules and commands in `.agentsync/rules/` and `.agentsync/commands/`
- Coexists with preset files via namespace isolation
- Project custom files are NOT namespaced; preset files ARE namespaced
- Committed to git for team sharing

**Layer 3: Tool Outputs** (generated, gitignored)

- Synced to tool-specific directories (`.cursor/`, `.claude/`, `.clinerules/`)
- Regenerated on each `agentsync sync`
- Copied from Layers 1+2 (not symlinked)

**AGENTS.md** (optional supplement)

- Universal documentation format, read natively by some tools
- Symlinked to tool-specific locations where needed
- NOT the source of truth (configuration is in `.agentsync/config.json`)

## Technology

- Language: TypeScript (strict)
- Runtime: Node.js 18+
- Build: Vite (ESM)
- CLI: Commander.js
- Validation: Zod

## Key Directories

```
src/
  cli.ts           # CLI entry
  commands/        # init, mcp, preset, sync
  core/            # audit, errors, mcp loaders, env, tokens
  security/        # secret scanning, unicode protection
  targets/         # per-tool converters (rules, commands, MCP)
  templates/       # AGENTS.md templates
  types/           # shared types & schemas

docs/
  configuration.md
  presets.md
  cli.md
  testing.md
```

## Design Principles

- Security-first: secret scanning, unicode protections, atomic writes
- Deterministic behavior with clear, typed errors and recovery guidance
- Convention over configuration; empty configs are valid
- Cross-platform support (macOS, Linux, Windows)
- Parse once, serialize once: Use canonical format throughout pipeline

---

## Canonical Format Architecture

AgentSync uses a **canonical format** internally for all rules and commands, ensuring consistency and type safety throughout the system.

### Separated Structure

- **Frontmatter**: Parsed YAML as typed object (description, globs, priority, etc.)
- **Markdown**: Pure markdown content without frontmatter delimiters

### Benefits

- Parse once at entry, serialize once at exit
- Type-safe access to metadata throughout pipeline
- Simplified validation, merging, and duplicate resolution
- No repeated string parsing or format fragility

### Format Flow

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

### Canonical Types

- `CanonicalRule`: Object with separated frontmatter (RuleFrontmatter) and markdown content
- `CanonicalCommand`: Object with separated frontmatter (CommandFrontmatter) and markdown content
- All internal operations (loading, merging, syncing) use this format

---

## Bidirectional Codec System

Tool converters are bidirectional codecs that handle both reading from and writing to tool-specific formats, with all data flowing through a canonical format.

### ToolCodec Capabilities

Each codec implements both import (read) and export (write) operations:

**OUTPUT Operations** (Canonical → Tool Format):

- `syncAgentsMd`: Write AGENTS.md symlink/file for tool
- `syncRules`: Convert canonical rules to tool-specific format (.mdc, .md, nested/flat)
- `syncCommands`: Convert canonical commands to tool-specific format
- `syncMCP`: Generate tool-specific MCP configuration

**MCP Operations** (Direct tool config manipulation, ephemeral mode):

- `addMCP(name, config, cwd, force?)`: Add or update MCP server in tool config (merge by default, overwrite if force=true)
- `disableMCP(name, cwd)`: Remove MCP server from tool config
- `removeMCP(name, cwd)`: Remove MCP server from tool config (alias to disable)

**INPUT Operations** (Tool Format → Canonical):

- `detect`: Discover existing tool directories (global vs project scope)
- `importRules`: Read tool rules, normalize to canonical format
- `importCommands`: Read tool commands, normalize to canonical format
- `importMCP`: Read tool MCP configuration

### Import Always Validates

- No "read as-is" mode - all imports normalize and validate
- Tool format → Canonical format conversion always happens
- Missing frontmatter is auto-generated with intelligent defaults
- Format differences normalized (.mdc → .md conceptually)
- Type validation on all frontmatter fields
- Ensures consistency across all tools and sources

### Codec Architecture

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

## Directory Structure

### Project Layout

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
├── .clinerules/               # Generated for Cline (via ClineCodec)
│   ├── AGENTS.md              # Symlink to root AGENTS.md
│   └── *.md                   # Rules (flat structure)
└── .roo/                      # Generated for RooCode (via RooCodeCodec)
    ├── rules/*.md
    ├── commands/*.md
    └── mcp.json
```

### Global Data

```
~/.agentsync/
├── config.json              # User-level config (personal presets, rules)
├── rules/                   # User-level rules (available to all projects)
├── commands/                # User-level commands
├── backups/                 # User-level tool config backups
├── logs/                    # Audit logs
└── cache/                   # Preset cache
```

---

## Scope Isolation Principle

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

---

## Read More

- Configuration: docs/configuration.md
- Presets and selection: docs/presets.md
- CLI reference: docs/cli.md
- Testing: docs/testing.md
- Debugging: docs/debugging.md
- Security: SECURITY.md
- Requirements: REQUIREMENTS.md (high-level design and requirements)
