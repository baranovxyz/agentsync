# Configuration

AgentSync uses separate config files with distinct purposes. Local overrides take precedence over project configuration.

## Architecture Consistency

All components must follow the documented file hierarchy. `.agentsync/config.json` is the primary team-shared configuration; deviations are bugs.

## File Responsibilities

### `.agentsync/config.json` (Project-level, committed)

- Created by: `agentsync init`
- Modified by: `agentsync mcp add/remove` (v0.2.0+)
- Purpose: Team-shared settings (tools, MCP servers, extends, security)
- Git: Committed to repository

Example:

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude", "cline"],
  "useSymlinks": true,
  "security": {
    "secretScanning": {
      "enabled": true,
      "blockOnHighSeverity": true,
      "entropyThreshold": 4.5
    },
    "unicodeDetection": { "enabled": true, "blockOnHighRisk": true },
    "auditLogging": {
      "enabled": true,
      "retentionDays": 90,
      "maxFileSize": 10485760
    }
  }
}
```

### `agentsync.local.json` (User-level, gitignored)

- Created by: User manually (v0.2.0) or `agentsync mcp add --scope local` (v0.3.0+)
- Purpose: Personal MCP overrides that differ from team config
- Git: NOT committed (in `.gitignore`)

Supported formats (empty configs are valid):

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

// Empty config (useful for fresh start or cleanup)
{ "mcpServers": [] }
{ "mcpServers": {} }
```

How to create:

```bash
# Manual
echo '{"mcpServers": []}' > agentsync.local.json
```

Use cases for empty configs:

- Fresh projects planning MCPs later
- Temporarily disabling all MCPs for testing
- Template projects with no MCPs configured
- MCP sync is part of `agentsync sync`. When `mcpServers` is empty, the main sync writes empty MCP target configs (clearing existing entries).

## Loading Priority

`agentsync.local.json` → `.agentsync/config.json` (local has precedence).

## Important Paths

- Global MCP registry: `~/.agentsync/mcp.json`
- Project config: `.agentsync/config.json`
- Local overrides: `agentsync.local.json`
- Environment variables: `.env`

## Notes

- Writing in v0.2.0 targets `.agentsync/config.json`.
- Future versions respect `--scope` for write targets.
