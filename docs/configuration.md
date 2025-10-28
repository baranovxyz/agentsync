# Configuration

AgentSync uses separate config files with distinct purposes. Local overrides take precedence over project configuration.

## File Hierarchy

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

## Loading Priority

`agentsync.local.json` → `.agentsync/config.json` (local has precedence)

## Important Paths

- Global MCP registry: `~/.agentsync/mcp.json`
- Project config: `.agentsync/config.json`
- Local overrides: `agentsync.local.json`
- Environment variables: `.env`

## Notes

- Empty MCP configs (`[]` or `{}`) are valid and clear tool configs
- Writing in v0.2.0 targets `.agentsync/config.json`
- Future versions will respect `--scope` for write targets
- All components follow this hierarchy (deviations are bugs)
