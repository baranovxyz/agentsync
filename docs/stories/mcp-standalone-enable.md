# User Story: Standalone MCP Enable

## Problem
Users want to enable MCP servers for Claude Code without initializing agentsync project or having project config. They need a lightweight way to add MCP servers directly to tool configs from command line.

## Solution
New `agentsync mcp enable` modes support inline MCP configuration:

**Ephemeral mode** (one-time, no agentsync config update):
```bash
agentsync mcp enable tracker --tool claude --json '{"command":"npx","args":["-y","@org/tracker"]}'
agentsync mcp enable tracker --tool claude --transport stdio -- npx -y @org/tracker
agentsync mcp enable tracker --tool claude --preset github:owner/repo
```

**Persistent mode** (save to agentsync config + sync):
```bash
agentsync mcp enable tracker --json '...' --scope global
agentsync mcp enable tracker --json '...' --scope project
```

**Registry mode** (existing, fallback):
```bash
agentsync mcp enable tracker --tool claude
```

## Benefits
- Use agentsync for MCP management without full project setup
- Inline config for quick one-off enablement
- Works in systems without agentsync initialization
- Codec-driven operations = tool-specific behavior handled by codec

## Commands

| Mode | Command | Behavior |
|------|---------|----------|
| Ephemeral | `mcp enable <name> --tool <tool> --json/--transport/--preset` | Sync to tool config only, no config save |
| Persistent | `mcp enable <name> --json/--transport/--preset --scope global/project` | Save to config + auto-sync to tools |
| Registry | `mcp enable <name> --tool <tool>` | Lookup in config hierarchy + sync |
| Ephemeral disable | `mcp disable <name> --tool <tool>` | Remove from tool config only |
| Ephemeral remove | `mcp remove <name> --tool <tool>` | Remove from tool config (alias to disable) |

## Implementation

### Config Resolution (Precedence)
1. `--json` provided → parse JSON directly
2. `--transport` provided → parse transport flags
3. `--preset` provided → extract from preset
4. Fallback → lookup in config hierarchy

### Codec Operations
Each codec implements:
- `addMCP(name, config, cwd, force?)` - add/update to tool config
- `disableMCP(name, cwd)` - remove from tool config
- `removeMCP(name, cwd)` - remove from tool config

### Auto-sync Behavior
- Without `--tool`: Sync to all tools in config
- With `--tool`: Sync only to specified tool
- No `--scope`: Ephemeral (direct sync only)
- With `--scope`: Persistent (save to config + sync)

## Design Rationale

**Single command**: One `mcp enable` for both modes auto-detected by flags
**Codec-driven**: Tool-specific merge logic in each codec (handle enable/disable appropriately)
**Ephemeral by default**: Inline config doesn't pollute agentsync config
**Config hierarchy**: `--json/--transport/--preset` always checked first
