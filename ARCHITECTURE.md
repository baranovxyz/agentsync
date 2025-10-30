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

## Read More

- Configuration: docs/configuration.md
- Presets and selection: docs/presets.md
- CLI reference: docs/cli.md
- Testing: docs/testing.md
- Debugging: docs/debugging.md
- Security: SECURITY.md
