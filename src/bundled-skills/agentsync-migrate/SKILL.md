---
name: agentsync-migrate
description: Help users migrate existing AI tool configurations to AgentSync
---

# AgentSync Migration Assistant

You are helping a user migrate their existing AI tool configurations to AgentSync's centralized
format.

## What to look for

Check these directories for existing configurations:
- `.cursor/rules/` — Cursor rules (`.mdc` files with YAML frontmatter)
- `.cursor/commands/` — Cursor commands (`.md` files)
- `.claude/rules/` — Claude Code rules (`.md` files)
- `.claude/commands/` — Claude Code commands (`.md` files)
- `.roo/rules/` — RooCode rules (`.md` files)
- `.roo/commands/` — RooCode commands (`.md` files)
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — Documentation files

## Migration steps

1. **Initialize**: Run `agentsync init --tools claude,opencode,codex` to create the `.agents/`
   directory. Add optional adapters such as Cursor only when the user asks to keep syncing those
   tool directories.
2. **Copy content**: Manually copy skills from existing tool directories into `.agents/skills/` and
   `.agents/commands/`
3. **Configure MCP**: Run
   `agentsync config add mcp <name> --mcp-config '{"command":"...","args":[...]}'` for each MCP
   server
4. **Sync**: Run `agentsync sync` to generate configs for all tools
5. **Verify**: Check that each tool directory has the expected files

### TOML config format (v1)

```toml
tools = ["claude", "opencode", "codex"]

extends = ["github:company/standards"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
```

## Common patterns

- Cursor `.mdc` rules become `.md` skills in `.agents/skills/`
- MCP configs from `.cursor/mcp.json` or `.mcp.json` merge into `.agents/agentsync.toml`
- `AGENTS.md` content is used directly (no migration needed)

## Edge cases

- If a user has both `.cursor/rules/` and `.claude/rules/` with similar content, suggest
  deduplication
- Warn about files that may contain secrets (API keys in MCP configs)
- If `CLAUDE.md` exists but not `AGENTS.md`, suggest renaming via `git mv CLAUDE.md AGENTS.md`
