# Configuration

How to configure AgentSync. For architectural overview, see REQUIREMENTS.md.

## Files

### `.agentsync/config.json` (Project-level, committed)

Team-shared settings. Created by `agentsync init`, modified by `agentsync mcp add/remove`.

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude", "cline"],
  "mcpServers": ["github", "postgres"],
  "extends": ["github:company/standards"],
  "useSymlinks": true,
  "security": {
    "secretScanning": { "enabled": true, "blockOnHighSeverity": true },
    "unicodeDetection": { "enabled": true, "blockOnHighRisk": true },
    "auditLogging": { "enabled": true, "retentionDays": 90 }
  }
}
```

### `agentsync.local.json` (User-level, gitignored)

Personal MCP overrides. Created manually for local development.

```json
// Array format (simple selection)
{ "mcpServers": ["github", "postgres"] }

// Object format (with overrides)
{
  "mcpServers": {
    "github": true,
    "postgres": { "env": { "POSTGRES_URL": "custom_value" } }
  }
}

// Empty config (clears all MCPs)
{ "mcpServers": [] }
```

## Precedence

Local overrides project: `agentsync.local.json` wins over `.agentsync/config.json` for MCP selection.

## Project Custom Rules & Commands

Override or supplement preset content with project-specific rules and commands.

**Location**:

- `.agentsync/rules/*.md` - Custom rules
- `.agentsync/commands/*.md` - Custom commands

**Behavior**:

- Files in these directories are merged with preset content
- Same filename overrides preset version
- Can use frontmatter for cross-tool metadata
- Committed to git (team-shared)

**Example**:

`.agentsync/rules/custom-auth.md`:

```markdown
---
tags: [security, auth]
scope: project
---

# Authentication Rules

Use JWT tokens for all API authentication...
```

On `agentsync sync`, this becomes:

- `.cursor/rules/custom-auth.mdc`
- `.claude/rules/custom-auth.md`
- `.clinerules/custom-auth.md`

## Paths

- Global MCP registry: `~/.agentsync/mcp.json`
- Project config: `.agentsync/config.json`
- Local overrides: `agentsync.local.json`
- Environment variables: `.env`
- Project custom rules: `.agentsync/rules/`
- Project custom commands: `.agentsync/commands/`

## Notes

- Empty MCP configs (`[]` or `{}`) are valid and clear tool configs
- v0.2.0 writes to `.agentsync/config.json` only
- Future: `--scope` flag for write targets
