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
  "extends": [
    { "source": "github:company/standards", "namespace": "company" },
    { "source": "fs:./local-presets", "namespace": "local" }
  ],
  "useSymlinks": true,
  "security": {
    "secretScanning": { "enabled": true, "blockOnHighSeverity": true },
    "unicodeDetection": { "enabled": true, "blockOnHighRisk": true },
    "auditLogging": { "enabled": true, "retentionDays": 90 }
  }
}
```

## Preset Sources

AgentSync supports multiple preset source types through a plugin architecture:

### GitHub Sources

Remote presets hosted on GitHub (requires git clone on first use):

```json
{
  "extends": [{ "source": "github:company/standards", "namespace": "company" }]
}
```

**Format**: `github:org/repo[@ref]`

- Uses `@main` by default
- Cached in `~/.agentsync/cache/github-org-repo/`
- Pull latest with `agentsync sync --pull`

### Filesystem Sources

Local directory presets for development or private presets:

```json
{
  "extends": [
    { "source": "fs:./local-presets", "namespace": "local" },
    { "source": "/Users/shared/team-rules", "namespace": "team" },
    { "source": "./relative/path", "namespace": "dev" }
  ]
}
```

**Supported formats**:

- `fs:./path` - Explicit filesystem prefix
- `/absolute/path` - Absolute paths
- `./relative/path` - Relative with dot prefix
- `relative/path` - Simple relative paths

**Benefits**:

- Fast iteration (no git clone)
- Private presets not on GitHub
- Symlink to shared network drives
- Local development of presets before publishing

**Requirements**:

- Path must be a directory
- Directory should contain at least one of: `rules/`, `commands/`, `mcp.json`
- Path must be accessible and readable

### Namespace Isolation

All presets require explicit namespaces to prevent conflicts:

```json
{
  "extends": [
    { "source": "github:company/standards", "namespace": "company" },
    { "source": "github:team/frontend", "namespace": "frontend" },
    { "source": "fs:./local-rules", "namespace": "local" }
  ]
}
```

Files from each preset are namespaced in tool outputs:

- **Nested tools** (Cursor, Claude): `company/typescript.mdc`
- **Flat tools** (Cline): `company_typescript.md`

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
- Project custom files coexist with preset files via namespace isolation
- Project custom files are NOT namespaced; preset files use namespace formatting (e.g., `company/file.md` or `company_file.md`)
- **Must include frontmatter** with required metadata (see format below)
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

### Frontmatter Format

**Commands** (`.agentsync/commands/*.md`):

- `description` (required): Brief description for UI/autocomplete
- `argument-hint` (optional): Expected argument format, e.g., `<provider> [scopes]`

Example:

```markdown
---
description: Authenticate user with OAuth
argument-hint: <provider> [scopes]
---

# Auth Command

Authenticate using the specified provider...
```

**Rules** (`.agentsync/rules/*.md`):

- `description` (required): What/when/why of the rule
- Other fields optional: `globs`, `alwaysApply`, `priority`, `tags`, etc.

Example:

```markdown
---
description: TypeScript coding standards
globs: "**/*.ts,**/*.tsx"
alwaysApply: false
priority: 1
---

# TypeScript Rules

Use strict null checks...
```

**Validation**: Files without proper frontmatter will show warnings during `agentsync sync` but will still be synced with default values.

## Paths

- Global MCP registry: `~/.agentsync/mcp.json`
- Project config: `.agentsync/config.json`
- Local overrides: `agentsync.local.json`
- Environment variables: `.env`
- Project custom rules: `.agentsync/rules/`
- Project custom commands: `.agentsync/commands/`

## Notes

- Empty MCP array `[]` disables all MCPs
- Optional field: if `mcpServers` is omitted, project config is used
- v0.2.0 writes to `.agentsync/config.json` only
- Future: `--scope` flag for write targets
