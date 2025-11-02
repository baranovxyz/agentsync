# Configuration

How to configure AgentSync. For implementation details, see ARCHITECTURE.md.

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

**Note**: Security scanning is enabled by default. Set `"enabled": false` to opt out.

```json
// Minimal config (security enabled by default)
{
  "version": "1.0",
  "tools": ["cursor"]
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

#### Tool Directories as Sources (Reference Mode)

AgentSync automatically detects tool directories and can use them as read-only preset sources through **Reference Mode**. This enables safe onboarding without copying files:

```json
{
  "tools": ["claude", "cline"],
  "extends": [{ "source": "fs:~/.cursor", "namespace": "cursor" }]
}
```

**How it works**:

- Tool directories (`.cursor/`, `.claude/`, `.cline/`, `.roo/`) are automatically detected
- Rules and commands are read and imported on each sync
- Source files remain unchanged (read-only)
- Content is namespaced in outputs to prevent conflicts
- Custom rules in `.agentsync/rules/` coexist with tool directory rules

**Global and project tool directories**:

```json
{
  "extends": [
    { "source": "fs:~/.cursor", "namespace": "cursor" },
    { "source": "fs:./.cursor", "namespace": "project-cursor" }
  ]
}
```

- Global: `~/.cursor/` - User-level config (applies to all projects)
- Project: `./.cursor/` - Project-level config (this project only)

**Namespace handling**:

- Tool directories are always namespaced (e.g., `cursor/typescript.md`)
- Tool name used as default namespace if not specified
- Supports custom namespaces for flexibility

**Benefits of Reference Mode**:

- Non-destructive adoption (existing tool config unchanged)
- Zero file copying
- Safe experimentation (easy to remove)
- Progressive enhancement (can upgrade to full management later)
- Mix sources from different tools in single project

**Disabling tool detection**:

```bash
agentsync sync --no-tool-detection
```

Use `--no-tool-detection` flag to disable automatic tool directory detection for debugging or if you want to treat tool directories as standard presets.

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

Add project-specific rules and commands that coexist with preset content via namespace isolation.

**Location**:

- `.agentsync/rules/*.md` - Custom rules
- `.agentsync/commands/*.md` - Custom commands

**Behavior**:

- Files in these directories coexist with preset content (no overriding)
- Project custom files are NOT namespaced
- Preset files use namespace formatting (e.g., `company/file.md` or `company_file.md`)
- Namespace isolation prevents conflicts between project and preset files
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
