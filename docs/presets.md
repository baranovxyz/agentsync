# Preset System

How to use presets. For implementation details, see ARCHITECTURE.md.

Presets let teams share rules, commands, and MCPs via multiple source types. AgentSync uses a plugin architecture to support different sources:

- **GitHub repositories** - Remote presets cached locally
- **Filesystem directories** - Local presets for development
- **Future**: Generic git repositories, HTTP downloads

Files are merged using namespace prefixes to prevent conflicts.

## Source Types

### GitHub Sources

Remote presets hosted on GitHub. Cloned to `~/.agentsync/cache/` on first use.

```json
{
  "extends": [{ "source": "github:company/standards", "namespace": "company" }]
}
```

**Features:**

- Format: `github:org/repo[@ref]`
- Uses `@main` by default
- SSH/HTTPS fallback
- Cached locally
- Update with `--pull` flag

### Filesystem Sources

Local directory presets for rapid development and private presets.

```json
{
  "extends": [
    { "source": "fs:./local-presets", "namespace": "local" },
    { "source": "/Users/shared/team-rules", "namespace": "team" },
    { "source": "./presets/company", "namespace": "company" }
  ]
}
```

**Supported formats:**

- `fs:./path` - Explicit filesystem prefix
- `/absolute/path` - Absolute paths
- `./relative/path` - Relative with dot
- `relative/path` - Simple relative paths

**Use cases:**

- Developing presets before publishing to GitHub
- Private presets not suitable for GitHub
- Symlinks to shared network drives
- Team presets in monorepo

**Requirements:**

- Must be a directory
- Should contain `rules/`, `commands/`, or `mcp.json`
- Must be accessible and readable

### Tool Directories as Preset Sources (Reference Mode)

**New in v0.3.0**: AgentSync can use existing tool directories (`.cursor/`, `.claude/`, etc.) as read-only preset sources. This enables **Reference Mode** - a safe, non-destructive way to adopt AgentSync:

```json
{
  "tools": ["claude", "cline"],
  "extends": [{ "source": "fs:~/.cursor", "namespace": "cursor" }]
}
```

#### How Reference Mode Works

1. **Automatic Detection**: AgentSync detects tool directories and marks them with `tool:` prefix
2. **Read-Only**: Source files are never copied or modified
3. **Per-Sync Import**: Rules and commands are imported fresh on each sync
4. **Namespace Isolation**: Content is namespaced to prevent conflicts
5. **Coexistence**: Works alongside custom rules and other presets

#### Setup Example

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude", "cline"],
  "extends": [
    {
      "source": "fs:~/.cursor",
      "namespace": "cursor"
    },
    {
      "source": "fs:github:company/standards",
      "namespace": "company"
    }
  ]
}
```

Run sync:

```bash
agentsync sync
```

AgentSync will:

- Detect `.cursor/` directory
- Read rules, commands, and MCPs from source
- Import to canonical format
- Sync to all tools in `tools` array
- Apply namespace prefixes (`cursor/`, `company/`)

#### Namespace Handling

Tool directories are always namespaced:

```
Source: fs:~/.cursor (namespace: cursor)
├─ Cursor output: .cursor/rules/cursor/typescript.mdc
├─ Claude output: .claude/rules/cursor/typescript.md
└─ Cline output: .clinerules/cursor_typescript.md
```

Custom namespace:

```json
{
  "source": "fs:~/.cursor",
  "namespace": "my-standards"
}
```

#### Global vs Project Tool Directories

Use tool directories at different scopes:

```json
{
  "extends": [
    { "source": "fs:~/.cursor", "namespace": "global-cursor" },
    { "source": "fs:./.cursor", "namespace": "project-cursor" }
  ]
}
```

- **Global** (`~/.cursor/`): Apply to all projects
- **Project** (`./.cursor/`): Project-specific only

#### MCP Support

Tool directories can include MCP configuration:

```json
{
  "source": "fs:~/.cursor",
  "namespace": "cursor"
}
```

AgentSync will read `~/.cursor/mcp.json` and include it in synced MCPs (subject to `mcpServers` selection).

#### Disabling Auto-Detection

To prevent tool directory detection (e.g., for debugging):

```bash
agentsync sync --no-tool-detection
```

Tool directories will be treated as standard presets and validation will require `rules/`, `commands/`, or `mcp.json`.

#### When to Use Reference Mode

**Good for:**

- Safe onboarding (no data loss risk)
- Trying AgentSync without commitment
- Maintaining existing tool as primary (no file copying)
- Gradual adoption (can upgrade to import mode later)
- Multi-source sharing (Cursor rules + GitHub standards)

**Not ideal for:**

- Full centralized management (use Import Mode instead)
- Projects requiring tool-specific configurations (consider Import Mode)
- Offline-first workflows (source must be accessible on each sync)

## Configuration

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "extends": [
    {
      "source": "github:company/standards",
      "namespace": "company"
    },
    {
      "source": "fs:./team-presets",
      "namespace": "team"
    },
    {
      "source": "github:team/backend-rules",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "postgres"]
}
```

### File Filtering

- `include` - globs relative to preset root (rules/commands only)
- `exclude` - globs to subtract from included set
- MCP enablement controlled via top-level `mcpServers` field

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

Rules and commands use namespace formatting based on tool capabilities.

**Internal format** (used in AgentSync registry):

```
company_commit.md     (commands)
company_typescript.md (rules)
```

**Tool output format** varies by tool:

**Nested directory tools** (Cursor, Claude Code, RooCode):

```
company_commit.md     → .cursor/commands/company/commit.md
team_commit.md        → .cursor/commands/team/commit.md
company_typescript.md → .cursor/rules/company/typescript.mdc
```

**Flat structure tools** (Cline):

```
company_typescript.md → .clinerules/company_typescript.md
team_security.md      → .clinerules/team_security.md
```

MCPs merge without namespaces (last-wins per server name). Enablement controlled via `mcpServers`.

## Namespace Requirements

- Namespace must be explicitly specified in config (no automatic extraction)
- Namespace must be unique across all presets
- Namespace must be a valid identifier (alphanumeric, hyphens, underscores)
- Namespace must not be reserved (e.g., `github`, `postgres`, `cursor`, `claude`)

## Example

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "extends": [
    {
      "source": "github:acme/coding-standards",
      "namespace": "acme"
    },
    {
      "source": "github:acme/backend-team",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**"]
    }
  ],
  "mcpServers": ["github", "postgres"]
}
```

Result:

**Nested directory tools** (Cursor, Claude):

```
.cursor/rules/
├── acme/
│   ├── typescript.mdc
│   └── testing.mdc
└── backend/
    └── api-design.mdc

.cursor/commands/
├── acme/
│   └── commit.md
└── backend/
    └── deploy.md
```

**Flat structure tools** (Cline):

```
.clinerules/
├── acme_typescript.md
├── acme_testing.md
└── backend_api-design.md
```

## Commands

See [CLI documentation](cli.md) for detailed usage:

- `agentsync sync` - Sync presets to tools (uses cache)
- `agentsync sync --pull` - Pull latest presets from sources
- `agentsync sync --dry-run` - Preview changes
- `agentsync preset list` - Show configured presets
- `agentsync preset cache-clear` - Clear caches

## Implementation Notes

- GitHub-only in v0.2.0 (`github:org/repo`)
- Namespace required (extracted from org by default)
- Caches in `~/.agentsync/cache/`
- SSH/HTTPS fallback
- Version tags planned for future
