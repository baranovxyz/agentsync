# GitHub Preset System

How to use presets. For architectural overview, see REQUIREMENTS.md#preset-system.

Presets let teams share rules, commands, and MCPs via GitHub repositories. Files are merged using namespace prefixes; caches live in `~/.agentsync/cache/`.

## Configuration

```json
{
  "version": "1.0",
  "extends": [
    "github:company/standards",
    {
      "source": "github:team/backend-rules",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "postgres"],
  "tools": ["cursor", "claude"]
}
```

### File Filtering

- `include` - globs relative to preset root (rules/commands only)
- `exclude` - globs to subtract from included set
- MCP enablement controlled via top-level `mcpServers` field

Examples: `rules/*.md`, `commands/deploy-*.md`, `rules/frontend/**`

## Preset Repository Structure

```
github:company/standards/
├── .agentsync/preset.json    # Optional metadata
├── commands/
│   ├── commit.md
│   ├── review.md
│   └── test.md
├── rules/
│   ├── typescript.md
│   ├── testing.md
│   └── security.md
├── mcp.json                  # Recommended MCPs
└── README.md
```

## Namespace-Based Merging

Rules and commands use namespace prefixes:

```
company:commit.md     → .cursor/commands/company:commit.md
team:commit.md        → .cursor/commands/team:commit.md
company:typescript.md → .cursor/rules/company:typescript.md
```

MCPs merge without namespaces (last-wins per server name). Enablement controlled via `mcpServers`.

## Example

```json
{
  "version": "1.0",
  "extends": [
    "github:acme/coding-standards",
    {
      "source": "github:acme/backend-team",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "postgres"],
  "tools": ["cursor", "claude"]
}
```

Result:

```
.cursor/rules/
├── acme:typescript.md
├── acme:testing.md
└── backend:api-design.md

.cursor/commands/
├── acme:commit.md
└── backend:deploy.md
```

## Commands

See [CLI documentation](cli.md) for detailed usage:

- `agentsync sync` - Sync presets to tools
- `agentsync sync --update` - Update caches and sync
- `agentsync sync --dry-run` - Preview changes
- `agentsync preset list` - Show configured presets
- `agentsync preset cache-clear` - Clear caches

## Implementation Notes

- GitHub-only in v0.2.0 (`github:org/repo`)
- Namespace required (extracted from org by default)
- Caches in `~/.agentsync/cache/`
- SSH/HTTPS fallback
- Version tags planned for future
