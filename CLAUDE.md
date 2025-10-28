# CLAUDE.md

**Purpose**: Quick reference for assistants. For comprehensive details, see REQUIREMENTS.md (source of truth).

## Critical Guardrails

- NEVER push to `main`. Always: branch → commit → PR → merge on GitHub.
- Preserve history: use `git mv` for renames; avoid `mv`.
- Use descriptive branches: `{type}/{brief-description}` (e.g., `fix/init-local-config`).
- After PR merge: checkout `main`, pull latest, verify clean tree.

See: ./CONTRIBUTING.md#git-workflow

## Quick Command Cheat Sheet

```bash
# Development
pnpm dev                                      # Start dev with hot reload
pnpm build                                    # Build CLI (dist/)
pnpm test                                     # Run all tests
pnpm test:e2e                                 # E2E tests only

# Main sync command
pnpm cli sync                                 # Sync (use cache)
pnpm cli sync --pull                          # Pull latest presets
pnpm cli sync [--dry-run] [--tool cursor]

# Gitignore management
pnpm cli gitignore                            # Update .gitignore for current tools

# Preset management
pnpm cli preset list|cache-clear|select|remove

# MCP servers
pnpm cli mcp add|remove|list
```

See: ./docs/cli.md for full reference

## Key Concepts (Links to Source)

- **Configuration**: `.agentsync/config.json` (project), `agentsync.local.json` (user local) → ./docs/configuration.md
- **Presets**: GitHub-based preset sharing with namespacing → ./REQUIREMENTS.md#preset-system
- **AGENTS.md**: Optional supplementary documentation (symlinked) → ./REQUIREMENTS.md#agentsmdstandard-integration
- **MCP**: Model Context Protocol integration with local-replaces strategy → ./REQUIREMENTS.md#model-context-protocol-mcp-integration
- **Security**: Secret scanning, Unicode detection → ./SECURITY.md

## Implementation Notes

- Favor natural workflows in tests (don't bypass with manual setup)
- Use typed errors with recovery guidance
- Keep changes atomic and commits well-described
- Handle CommanderError types: when using `exitOverride()`, check for `'commander.version'` and `'commander.helpDisplayed'` codes, exit with 0
- Main module detection: prefer `import.meta.main`; fallback to `es-main` for older Node
- MCP config merging: local `mcpServers` completely replaces project `mcpServers`
- Empty MCP configs (`[]`) are valid; local config overrides project config entirely

See also: ./ARCHITECTURE.md, ./TESTING.md, ./docs/debugging.md, ./docs/releasing.md
