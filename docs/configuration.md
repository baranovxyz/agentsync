# Configuration

How to configure AgentSync. For implementation details, see [architecture.md](architecture.md).

## Config Format

AgentSync uses **TOML** as its configuration format, stored at `.agents/agentsync.toml`. TOML keys use **snake_case** per TOML convention.

## Files

### `.agents/agentsync.toml` (Project-level, committed)

Team-shared settings. Created by `agentsync init`, modified by `agentsync config add/rm`.

```toml
tools = ["claude", "opencode", "codex"]

extends = [
  "github:company/standards",
  "fs:./local-presets",
]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"

[mcp.postgres]
command = "docker"
args = ["exec", "postgres-mcp"]

[mcp.postgres.env]
POSTGRES_URL = "{POSTGRES_URL}"
```

Minimal config:

```toml
tools = ["claude"]
```

## Preset Sources

AgentSync supports multiple preset source types through a plugin architecture:

### GitHub Sources

Remote presets hosted on GitHub (fetched fresh on each sync):

```toml
extends = ["github:company/standards"]
```

**Format**: `github:org/repo[@ref]`

- Uses `@main` by default
- Always fetched fresh (no local cache)

### Filesystem Sources

Local directory presets for development or private presets:

```toml
extends = [
  "fs:./local-presets",
  "/Users/shared/team-rules",
  "./relative/path",
]
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
- Directory should contain at least one of: `commands/`, `skills/`, `agents/`, `mcp.json`
- Path must be accessible and readable

#### Tool Directories as Sources (Reference Mode)

AgentSync automatically detects tool directories and can use them as read-only preset sources through **Reference Mode**. This enables safe onboarding without copying files:

```toml
tools = ["claude", "codex"]

extends = ["fs:~/.claude"]
```

**How it works**:

- Tool directories (`.claude/`, `.codex/`, `.cursor/`, `.roo/`, etc.) are automatically detected
- Skills and commands are read and imported on each sync
- Source files remain unchanged (read-only)
- Content is namespaced in outputs to prevent conflicts
- Custom content in `.agents/commands/` and `.agents/skills/` coexists with tool directory content

**Global and project tool directories**:

```toml
extends = [
  "fs:~/.claude",
  "fs:./.claude",
]
```

- Global: `~/.claude/` - User-level config (applies to all projects)
- Project: `./.claude/` - Project-level config (this project only)

**Namespace handling**:

- Tool directories are always namespaced (e.g., `claude--typescript.md` in flat outputs)
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

All presets are namespaced to prevent conflicts. Namespaces are derived automatically from the source (e.g., repo name, directory name):

```toml
extends = [
  "github:company/standards",
  "github:team/frontend",
  "fs:./local-rules",
]
```

Files from each preset are namespaced in tool outputs using the `--` separator:

- **Flat format**: `company--typescript.md`
- **Tool outputs**: Namespace separator is `--` across all tools

### `agentsync.local.toml` (User-level, gitignored)

Personal MCP overrides. Created manually for local development.

```toml
# Add a local MCP server (defined = enabled)
[mcp.my-local]
command = "node"
args = ["./my-mcp.js"]

# Override a server definition from project config
[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

[mcp.github.env]
GITHUB_TOKEN = "{MY_LOCAL_TOKEN}"
```

## MCP Configuration

MCP servers use a **defined = enabled** model. Any server defined in `[mcp.*]` is automatically active -- no separate enable/disable lists.

- Merges per-key across global -> project -> local (last wins per server key)
- Supports both command-based (local process) and URL-based (HTTP remote) formats
- To remove a server locally, omit it from your local config (it will not inherit from project)

**Example flow**:

Global: Defines `github`, `filesystem`
Project: Defines `postgres`, `github` (overrides global `github` definition)
Local: Defines `my-local`, `github` (overrides project `github` definition)

Result: Active servers = `github` (local version), `filesystem`, `postgres`, `my-local`

## Precedence

- MCP servers: Per-key override (local > project > global)

## Hierarchical Config Discovery

AgentSync walks from the current working directory up to the git root, collecting every `.agents/agentsync.toml` it finds. The walk stops when a `.git` directory is encountered. Additionally, the global config at `~/.agents/agentsync.toml` is always included as the outermost layer.

**Merge behavior across discovered configs**:

- `tools`: The most-specific config (deepest directory) wins -- it replaces the value from parent configs
- `skills`, `commands`, `agents`: Accumulated through all N layers (global + project hierarchy)
- `mcp`: Per-key merge -- deeper config wins for each server key, all servers accumulate
- `extends`: Accumulated across all discovered configs
- All other fields: Deeper config wins

**Example monorepo layout**:

```
my-monorepo/                        # git root
├── .git/
├── .agents/agentsync.toml          # Root config: tools = ["claude", "opencode"]
│                                   #              [mcp.github] defined
├── frontend/
│   ├── .agents/agentsync.toml      # Frontend config: tools = ["opencode", "codex"]
│   │                               #                  [mcp.storybook] defined
│   └── src/
└── backend/
    ├── .agents/agentsync.toml      # Backend config: tools = ["claude"]
    │                               #                 [mcp.postgres] defined
    └── src/
```

Running `agentsync sync` from `frontend/src/` discovers both `frontend/.agents/agentsync.toml` and the root `.agents/agentsync.toml`. The result:

- `tools`: `["opencode", "codex"]` (frontend wins -- replaces root)
- `mcp`: `github` + `storybook` (per-key merge across levels)

## Profiles

Profiles let a single config file define multiple role-specific overrides, selected at sync time. Define profiles in the `[profiles.*]` TOML section:

```toml
[profiles.frontend]
tools = ["claude", "opencode"]
mcp = ["storybook", "figma"]
paths = ["frontend/**"]

[profiles.backend]
tools = ["claude", "codex"]
mcp = ["postgres"]
paths = ["backend/**"]

[profiles.ci]
tools = ["codex", "claude"]
mcp = ["github"]
env = "CI"
```

**Profile fields**:

- `tools`: Replaces the base `tools` list when the profile is active
- `mcp`: Filters the base MCP servers to only those listed (restricts, does not accumulate)
- `skills`: Filters the base skills to only those listed (restricts, does not accumulate)
- `extends`: Filters the base extends to only those listed (restricts, does not accumulate)
- `paths`: Glob patterns -- profile auto-activates when CWD matches
- `env`: Environment variable name -- profile auto-activates when the variable is set

**Selection priority** (highest to lowest):

1. `--profile <name>` CLI flag
2. `AGENTSYNC_PROFILE=<name>` environment variable
3. Environment variable auto-detect (profile `env` field matches a set env var)
4. Path-based auto-select (CWD matches profile `paths` globs)

**Merge rules when a profile is active**:

- `tools`: Profile value replaces base config value
- `mcp`, `skills`, `extends`: Profile values filter (restrict) the base config to only listed items
- All other fields: Unchanged (base config value applies)

## Project Custom Skills & Commands

Add project-specific skills and commands that coexist with preset content via namespace isolation.

**Location**:

- `.agents/commands/*.md` - Custom slash commands
- `.agents/skills/*.md` - Custom skills (SKILL.md format)

**Behavior**:

- Files in these directories coexist with preset content (no overriding)
- Project custom files are NOT namespaced
- Preset files use namespace formatting (e.g., `company--file.md`)
- Namespace isolation prevents conflicts between project and preset files
- **Must include frontmatter** with required metadata (see format below)
- Committed to git (team-shared)

**Example**:

`.agents/commands/custom-auth.md`:

```markdown
---
description: Authentication command for this project
tags: [security, auth]
---

# Authentication Command

Use JWT tokens for all API authentication...
```

On `agentsync sync`, this becomes (for holdout tools):

- `.claude/commands/custom-auth.md`
- `.opencode/commands/custom-auth.md`

### Frontmatter Format

**Commands** (`.agents/commands/*.md`):

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

**Skills** (`.agents/skills/*.md`):

- `description` (required): What/when/why of the skill
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

## Global Content

User-level skills, commands, and agents live under `~/.agents/` and accumulate with project content on every sync:

- `~/.agents/skills/*.md` - Global skills (applied to all projects)
- `~/.agents/commands/*.md` - Global commands (available in all projects)
- `~/.agents/agents/*.md` - Global agents (available in all projects)

Global content is merged with project content -- it does not override. If a project defines a skill with the same name, both are included.

## Paths

- Global config: `~/.agents/agentsync.toml`
- Global skills: `~/.agents/skills/`
- Global commands: `~/.agents/commands/`
- Global agents: `~/.agents/agents/`
- Project config: `.agents/agentsync.toml`
- Local overrides: `agentsync.local.toml`
- Environment variables: `.env`
- Project custom commands: `.agents/commands/`
- Project custom skills: `.agents/skills/`
- Project custom agents: `.agents/agents/`

## Notes

- Omitting `[mcp]` entirely means no MCP servers are active
- MCP servers are defined = enabled; no separate enable/disable lists
- TOML is the only supported config format
- `version` and `source_dir` fields have been removed in the current config format
