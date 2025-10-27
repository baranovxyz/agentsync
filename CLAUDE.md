# CLAUDE.md

Assistant-facing guide for working in this repo. Keep this file short: guardrails, quick commands, config truth, and links to deeper docs.

## Overview

AgentSync is the infra layer for AI coding agent configuration:

- MCP Context Optimizer (v0.2.0-alpha ✅)
- GitHub Preset System (v0.2.0-alpha) 🧪
- AGENTS.md Sync (v0.3.0-beta ⏳)

## Do/Don’t (Critical Guardrails)

- NEVER push to `main`. Always: branch → commit → PR → merge on GitHub.
- Preserve history: use `git mv` for renames; avoid `mv`.
- Use descriptive branches: `{type}/{brief-description}` (e.g., `fix/init-local-config`).
- After PR merge: checkout `main`, pull latest, verify clean tree.

Details: ./CONTRIBUTING.md#git-workflow

## Quick Commands

- pnpm dev — start dev with hot reload
- pnpm build — build CLI (dist/)
- pnpm test — run tests; pnpm test:e2e — E2E only
- pnpm cli sync [--dry-run|--update|--tool cursor]
- pnpm cli preset list|cache-clear
- pnpm cli mcp add|remove|list (sync via main `sync`)

More: ./docs/cli.md

## Configuration Truth

- Project config (shared): `.agentsync/config.json`
- Local overrides (personal): `agentsync.local.json`
- Loading order: local overrides project
- Empty MCP configs are valid (e.g., `{"mcpServers": []}`) and will clear tool configs

Details: ./docs/configuration.md

## Presets

- Extend presets via `extends` with optional `namespace`, `include`, `exclude`
- Namespaced merging prevents collisions; MCP enablement via `mcpServers`

Details: ./docs/presets.md

## AGENTS.md (v0.3.0-beta)

- `init` implemented; translators and full sync pending
- Parser detects major sections; translators will emit tool formats

Details: ./docs/agents-md.md

## What’s Implemented

- ✅ v0.2.0-alpha (MCP Context Optimizer): Complete with 289 tests passing
- ✅ v0.2.x-alpha (GitHub Preset System): Complete with include/exclude filtering
- ✅ v0.2.x-alpha (Interactive Selection): Complete with file-level selections
- 🔨 v0.3.0-beta (AGENTS.md Sync): `init` complete; translators pending

## Security

- Secret scanning (>25 patterns), Unicode attack protection, atomic writes

Details: ./SECURITY.md

## Architecture

- High-level module layout and entry points

Details: ./ARCHITECTURE.md

## Testing

- Unit, integration, E2E, shell, install tests; isolation via symlinked node_modules

Details: ./TESTING.md and ./docs/testing/automated.md

## Debugging

- Use `DEBUG=true`, audit logs, dry-run; ESM gotchas documented

Details: ./docs/debugging.md

## Releasing

- Version bump, changelog, tag, push, build, test, publish; install test workflow

Details: ./docs/releasing.md

## Notes for Assistants

- Favor natural workflows in tests (don’t bypass with manual setup)
- Use typed errors with recovery guidance
- Keep changes atomic and commits well-described
- Handle CommanderError types properly: when using exitOverride(), check for 'commander.version' and 'commander.helpDisplayed' codes and exit with 0
- Fix main module detection: prefer native `import.meta.main`, with `es-main` fallback for older Node versions
