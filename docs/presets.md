# GitHub Preset System (v0.2.0-beta)

Presets let teams share rules, commands, and MCPs via GitHub repositories. Caches live in `~/.agentsync/cache/`. Files are merged using namespace prefixes to avoid collisions.

## Core Components

```
src/core/registry/
├── github-source.ts          # Parse github:org/repo[@ref] format
├── cache-manager.ts          # Manage cloned repos in ~/.agentsync/cache/
├── github-resolver.ts        # Clone repos (SSH/HTTPS fallback)
├── preset-loader.ts          # Load rules/commands/MCPs from repos
├── merger.ts                 # Namespace-based merging
└── registry-orchestrator.ts  # End-to-end workflow orchestration
```

## Config Format

```json
{
  "version": "1.0",
  "extends": [
    "github:company/standards",
    {
      "source": "github:team/backend-rules",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**", "commands/old-*.md"]
    }
  ],
  "mcpServers": ["github", "postgres"],
  "tools": ["cursor", "claude"],
  "useSymlinks": true
}
```

### File Filtering (include/exclude)

- include?: string[] — globs relative to the preset root for files under `rules/` and `commands/`
- exclude?: string[] — globs to subtract from the included set

Notes:

- Filtering applies to rules and commands only.
- MCP enablement is controlled separately via the top-level `mcpServers` field.

Glob examples:

- `rules/*.md` — all markdown files in rules directory
- `commands/deploy-*.md` — deploy-related command files
- `rules/frontend/**` — all files in frontend subdirectory

## Preset Repository Structure

```
github:company/standards/
├── .agentsync/
│   └── preset.json          # Optional metadata
├── commands/
│   ├── commit.md            # Generate commit messages
│   ├── review.md            # Code review checklist
│   └── test.md              # Run tests
├── rules/
│   ├── typescript.md        # TypeScript rules
│   ├── testing.md           # Testing guidelines
│   └── security.md          # Security patterns
├── mcp.json                 # Recommended MCPs for this preset
└── README.md
```

## Namespace-Based Merging

```
company:commit.md     → .cursor/commands/company:commit.md
team:commit.md        → .cursor/commands/team:commit.md
company:typescript.md → .cursor/rules/company:typescript.mdc
```

MCPs are merged without namespaces (last-wins):

- Presets may define MCP servers in `mcp.json`; definitions merge last-wins per server name
- Enablement is controlled solely via `mcpServers` (project or local)

## Key Design Decisions

1. @main only initially; version tags planned for a future version
2. Git provider scope: GitHub-only now (`github:org/repo`)
3. Namespace required (extracted from org by default)
4. Cache reuse in `~/.agentsync/cache/`
5. SSH/HTTPS fallback

## Usage Examples

### Example 1: Company-Wide Standards Preset

```json
// .agentsync/config.json
{
  "version": "1.0",
  "extends": ["github:acme/coding-standards"],
  "tools": ["cursor", "claude"]
}
```

```
$ agentsync sync
# Rules → .cursor/rules/acme:typescript.mdc
# Commands → .cursor/commands/acme:commit.md
```

### Example 2: Multiple Presets with Filtering

```json
{
  "version": "1.0",
  "extends": [
    "github:acme/coding-standards",
    {
      "source": "github:acme/backend-team",
      "namespace": "backend",
      "include": ["rules/*.md", "commands/*.md"],
      "exclude": ["rules/deprecated/**", "commands/old-*.md"]
    }
  ],
  "tools": ["cursor", "claude"]
}
```

Result:

```
.cursor/rules/
├── acme:typescript.mdc
├── acme:testing.mdc
└── backend:api-design.mdc

.cursor/commands/
├── acme:commit.md
└── backend:deploy.md
```

### Example 3: Preview Changes Before Applying

```bash
agentsync sync --dry-run
```

### Example 4: Update Preset Caches

```bash
agentsync sync --update
```

### Example 5: Sync Only to Specific Tool

```bash
agentsync sync --tool cursor
```

### Example 6: View Configured Presets

```bash
agentsync preset list
```

### Example 7: Clear Preset Caches

```bash
agentsync preset cache-clear
agentsync preset cache-clear --all
```

## Test Coverage (Presets Area)

- 12 unit tests for sync command
- 9 integration tests for sync workflow
- 29 unit tests for registry system
