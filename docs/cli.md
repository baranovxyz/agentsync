# CLI Commands and Usage

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

AgentSync has 8 leaf commands: `init`, `sync`, `doctor`, `clean`, `config add`, `config rm`, `config ls`, `config show`. All commands support `--json` for structured output.

```bash
# Init — create .agents/agentsync.toml
pnpm cli init                       # Non-interactive init (detects tools)
pnpm cli init --tools claude,opencode,codex # Non-interactive init with specified tools
pnpm cli init --json                # Output structured JSON

# Sync — sync config to all enabled tools
pnpm cli sync                       # Sync all: skills, commands, agents, and MCPs
pnpm cli sync --dry-run             # Preview changes without applying
pnpm cli sync --tool opencode       # Sync only to OpenCode
pnpm cli sync --copy                # Use file copies for tool outputs (default)
pnpm cli sync --link                # Use symlinks instead of copying files
pnpm cli sync --profile frontend    # Apply specific profile overrides
pnpm cli sync --json                # Structured JSON output (for AI agents)
AGENTSYNC_PROFILE=ci pnpm cli sync  # Profile via environment variable

# Doctor — run diagnostics
pnpm cli doctor                     # Check config, tools, skills, MCP env vars, presets
pnpm cli doctor --json              # Structured JSON diagnostics

# Clean — remove all synced files
pnpm cli clean                      # Remove files written by agentsync sync
pnpm cli clean --dry-run            # Preview what would be removed
pnpm cli clean --json               # Structured JSON output

# Config — manage config entries
pnpm cli config add tool opencode        # Add a tool
pnpm cli config add mcp github --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'
pnpm cli config add preset github:company/standards
pnpm cli config add skill my-skill --description "Custom skill"
pnpm cli config add command my-cmd --description "Custom command"
pnpm cli config rm tool opencode         # Remove a tool
pnpm cli config rm mcp github            # Remove an MCP server
pnpm cli config rm preset github:company/standards
pnpm cli config ls                       # List all config entries (JSON)
pnpm cli config ls mcp                   # List MCP servers only
pnpm cli config ls tools                 # List enabled tools only
pnpm cli config show                     # Dump resolved config as JSON
pnpm cli config show --json              # Same (JSON is default for show)
```

## Notes

- Commands run with `pnpm cli COMMAND` in development or `agentsync COMMAND` after install
- All commands support `--json` for structured output (machine-readable for AI agents)
- Use `--dry-run` for safe preview of changes
- Use `--help` on any command for detailed options
- Config is stored in `.agents/agentsync.toml` (TOML format)
- MCP management: use `config add mcp` / `config rm mcp` (standalone `mcp` command removed)
- Preset management: use `config add preset` / `config rm preset` (standalone `preset` command removed)
- Gitignore updates are folded into `sync`
