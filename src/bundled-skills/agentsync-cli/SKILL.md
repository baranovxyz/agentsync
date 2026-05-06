---
name: agentsync-cli
description: Guide for using AgentSync CLI commands effectively
---

# AgentSync CLI Guide

You are helping a user work with the AgentSync CLI tool for managing AI coding agent configurations.

## Core Commands (8 leaf commands)

### `agentsync init`
Initialize AgentSync in a project. Creates `.agents/agentsync.toml` and directory structure.
- `--tools <tools>` — Comma-separated list of tools (defaults to claude,opencode,codex)
- `--json` — Structured JSON output

### `agentsync sync`
Sync all content (skills, commands, agents, docs, MCP servers) to configured tools.
- `--dry-run` — Preview changes without writing
- `--tool <name>` — Sync to specific tool only
- `--json` — Structured JSON output (use this for programmatic access)
- `--ci` — CI/CD mode (non-interactive, implies `--json`)
- `--profile <name>` — Apply specific profile overrides
- `--link` — Use symlinks for tool outputs
- `--copy` — Use file copies for tool outputs

### `agentsync doctor`
Run diagnostics to debug configuration issues.
- `--json` — Structured JSON output

### `agentsync clean`
Remove all synced/generated files from tool directories.
- `--dry-run` — Preview what would be removed
- `--json` — Structured JSON output

### `agentsync config add <type> <name>`
Add a tool, MCP server, preset, skill, or command to config.
- `--mcp-config <config>` — MCP server config as JSON string (for `mcp` type)
- `--description <desc>` — Description for skill/command
- `--json` — Structured JSON output

Types: `tool`, `mcp`, `preset`, `skill`, `command`

### `agentsync config rm <type> <name>`
Remove a tool, MCP server, preset, skill, or command from config.
- `--json` — Structured JSON output

### `agentsync config ls [type]`
List all config entries, or filter by type.
- `--json` — Structured JSON output

### `agentsync config show`
Dump resolved config as JSON.
- `--json` — Structured JSON output (default for show)

## Directory Structure

```
.agents/
├── agentsync.toml       # Main configuration (TOML)
├── skills/              # Skills (SKILL.md in subdirectories)
│   └── my-skill/SKILL.md
├── commands/            # Slash commands (*.md)
├── agents/              # Agent definitions (*.md)
└── backups/             # Pre-sync backups
```

## Config Format (v1 TOML)

```toml
tools = ["claude", "opencode", "codex"]

extends = ["github:company/standards"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
```

## Examples

```bash
# Add an MCP server
agentsync config add mcp github --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'

# Add a preset
agentsync config add preset github:company/standards

# Add a tool
agentsync config add tool opencode

# Sync with profile
agentsync sync --profile frontend
AGENTSYNC_PROFILE=ci agentsync sync
```

## Interpreting --json Output

When using `--json`, the output structure is:
```json
{
  "success": true,
  "tools": ["claude", "opencode", "codex"],
  "skills": 5,
  "commands": 3,
  "agents": 1,
  "mcpServers": 2
}
```

On error, `success` is `false` and `errors` array contains messages.
