# CLI Usage and Commands

This document consolidates development, testing, and CLI command usage.

## Development

```bash
# Start development with hot reload
pnpm dev

# Build for production (creates dist/cli.js)
pnpm build

# Run CLI directly in TypeScript
pnpm cli --help

# Type checking only (no emit)
pnpm lint

# Format and lint code with Biome
pnpm lint:fix
```

## Testing

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

### CI/CD Notes

```bash
# GitHub Actions tests on 9 platforms: Ubuntu/macOS/Windows × Node 18/20/22
# Hierarchical timeouts: 5s unit tests, 10s hooks (2x multiplier on CI)
# Windows requires both HOME and USERPROFILE env vars for os.homedir()
# Coverage target: >80% (Phase 1 achieved 90%+)

# E2E Test Strategy (install-test.yml):
# - Runs ONLY on-demand (manual trigger + weekly cron)
# - NOT triggered on push (saves ~90% CI minutes for E2E tests)
# - Cost: ~5-9 CI minutes per run (9 platforms × 30-60s)
# - Trigger manually: gh workflow run "Install Test"
# - Use regular tests (test-with-bats.yml) for push validation

# Lockfile Policy:
# - ALL workflows use --frozen-lockfile (no exceptions)
# - Ensures pnpm-lock.yaml matches package.json
# - Prevents dependency drift between local/CI
```

## CLI Commands

```bash
# Main Sync (v0.2.0-beta - IMPLEMENTED)
pnpm cli sync                      # Sync all: presets, rules, commands, MCPs
pnpm cli sync --update             # Update GitHub caches and sync
pnpm cli sync --dry-run            # Preview changes without applying
pnpm cli sync --tool cursor        # Sync only to Cursor

# Preset Management (v0.2.0-beta - IMPLEMENTED)
pnpm cli preset list               # List configured presets
pnpm cli preset cache-clear        # Clear project preset caches
pnpm cli preset cache-clear --all  # Clear all preset caches
pnpm cli preset select             # Interactive: include/exclude filters, MCP picks
pnpm cli preset remove             # Interactive: remove from include/exclude or mcpServers

# MCP Commands (Phase 1 - FULLY IMPLEMENTED)
# Note: Empty MCP configs (0 servers) are valid for starting fresh or cleanup
pnpm cli mcp sync                  # Sync MCPs to tools
pnpm cli mcp sync --dry-run        # Preview without applying
pnpm cli mcp sync --tool cursor    # Sync only to Cursor
pnpm cli mcp list                  # Show available/active MCPs
pnpm cli mcp add github            # Add MCP to project
pnpm cli mcp remove postgres       # Remove MCP (can remove all)

# Init Command (Phase 2 - PARTIALLY IMPLEMENTED)
pnpm cli init                      # Initialize with template
```

## Slash Commands

```bash
/smart-commit        # Intelligent atomic commits grouped by type
/extract-learnings   # Document session insights to CLAUDE.md
/release             # Complete release workflow (PR → publish → GitHub release)
/adapt-command       # Adapt commands for repo context
```
