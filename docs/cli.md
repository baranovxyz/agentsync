# CLI Commands and Usage

For testing commands, see TESTING.md.

## Development

```bash
# Start development with hot reload
pnpm dev

# Build for production (creates dist/cli.js)
pnpm build

# Type checking
pnpm lint

# Format and lint
pnpm lint:fix
```

## CLI Commands

```bash
# Main Sync (v0.2.0-beta - IMPLEMENTED)
pnpm cli sync                      # Sync all: presets, rules, commands, MCPs
pnpm cli sync --pull               # Pull latest presets from sources
pnpm cli sync --dry-run            # Preview changes without applying
pnpm cli sync --tool cursor        # Sync only to Cursor

# Gitignore Management (v0.2.0+)
pnpm cli gitignore                 # Update .gitignore based on current config

# Preset Management (v0.2.0-beta - IMPLEMENTED)
pnpm cli preset list               # List configured presets
pnpm cli preset cache-clear        # Clear project preset caches
pnpm cli preset cache-clear --all  # Clear all preset caches
pnpm cli preset select             # Interactive: include/exclude filters, MCP picks
pnpm cli preset remove             # Interactive: remove from include/exclude or mcpServers

# MCP Commands (updated)
# MCP sync is merged into main sync. Use `agentsync sync`.
pnpm cli mcp list                  # Show available/active MCPs
pnpm cli mcp add github            # Add MCP to project
pnpm cli mcp remove postgres       # Remove MCP (can remove all)

# Init Command (v0.3.0-beta - PARTIALLY IMPLEMENTED)
pnpm cli init                      # Initialize with template
```

## Notes

- Commands run with `pnpm cli COMMAND` in development or `agentsync COMMAND` after install
- Use `--dry-run` for safe preview of changes
- Use `--help` on any command for detailed options
