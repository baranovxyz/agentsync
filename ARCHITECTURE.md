# AgentSync Architecture

This page gives a high-level view of AgentSync’s architecture and points to deeper docs.

## Overview

AgentSync is a TypeScript CLI for managing AI coding agent configuration.

- MCP Context Optimizer: select per-project MCP servers from a global registry
- GitHub Preset System: extend shared rules, commands, and MCPs via presets
- AGENTS.md Sync: unify configuration across tools (in progress)

## Technology

- Language: TypeScript (strict)
- Runtime: Node.js 18+
- Build: Vite (ESM)
- CLI: Commander.js
- Validation: Zod

## Configuration Truth

- Team config (committed): `.agentsync/config.json`
- Local overrides (gitignored): `agentsync.local.json`
- Global MCP registry: `~/.agentsync/mcp.json`
- Precedence: local overrides project for MCPs

Example precedence:

```jsonc
// .agentsync/config.json
{ "mcpServers": ["github"] }

// agentsync.local.json
{ "mcpServers": [] }

// Effective selection: []
```

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
  agents-md.md
  cli.md
```

## Design Principles

- Security-first: secret scanning, unicode protections, atomic writes
- Deterministic behavior with clear, typed errors and recovery guidance
- Convention over configuration; empty configs are valid
- Cross-platform support (macOS, Linux, Windows)

## Read More

- Configuration: docs/configuration.md
- Presets and selection: docs/presets.md
- AGENTS.md: docs/agents-md.md
- CLI reference: docs/cli.md
- Debugging: docs/debugging.md
- Security: SECURITY.md
