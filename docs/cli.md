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
# Main Sync
pnpm cli sync                      # Sync all: presets, rules, commands, MCPs
pnpm cli sync --pull               # Pull latest presets from sources
pnpm cli sync --dry-run            # Preview changes without applying
pnpm cli sync --tool cursor        # Sync only to Cursor

# Gitignore Management
pnpm cli gitignore                 # Update .gitignore based on current config

# Preset Management
pnpm cli preset list               # List configured presets
pnpm cli preset cache-clear        # Clear project preset caches
pnpm cli preset cache-clear --all  # Clear all preset caches
pnpm cli preset select             # Interactive: include/exclude filters, MCP picks
pnpm cli preset remove             # Interactive: remove from include/exclude or mcpServers

# MCP Commands
# MCP sync is merged into main sync. Use `agentsync sync`.

# Ephemeral mode (one-time sync to tool, no config save)
pnpm cli mcp enable tracker --tool claude --json '{"command":"npx","args":["-y","@org/tracker"]}'
pnpm cli mcp enable tracker --tool claude --transport stdio -- npx -y @org/tracker
pnpm cli mcp disable github --tool claude
pnpm cli mcp remove github --tool claude

# Persistent mode (save to config + auto-sync)
pnpm cli mcp enable tracker --json '...' --scope global
pnpm cli mcp enable tracker --json '...' --scope project

# Managed mode (registry lookup, existing behavior)
pnpm cli mcp enable github         # Enable MCP from registry in project
pnpm cli mcp disable postgres      # Disable MCP (adds to local config)
pnpm cli mcp list                  # Show available/active MCPs

# Init Command
pnpm cli init                      # Initialize with template
```

## Notes

- Commands run with `pnpm cli COMMAND` in development or `agentsync COMMAND` after install
- Use `--dry-run` for safe preview of changes
- Use `--help` on any command for detailed options
