# ADR-001: MCP Codec-Driven Operations

**Status**: Proposed
**Date**: 2025-11-12

## Context

AgentSync needs to support standalone MCP operations without agentsync config files. Users should be able to enable MCP servers directly in tool configs via CLI without managing agentsync configuration.

Current architecture requires project config (`.agentsync/config.json`) to manage MCPs, limiting standalone usage.

## Problem

1. Cannot enable MCP without agentsync project setup
2. Two parallel concepts: agentsync config state vs tool config (`.mcp.json`)
3. Need codec-specific behavior (some tools support disable, others don't)
4. Must support multiple config sources (JSON, transport, preset, registry)

## Decision

**Use codec-driven operations** for direct tool config manipulation:
- Each codec implements `addMCP()`, `disableMCP()`, `removeMCP()`
- Operations bypass agentsync config for ephemeral mode
- Codecs handle tool-specific merge logic and enable/disable semantics
- Config resolution uses precedence chain: JSON → transport → preset → registry

### Architecture

```
┌─ Ephemeral Mode ──────────────────────────────────────────┐
│ CLI flags (--json/--transport/--preset)                    │
│         ↓                                                   │
│ resolveMCPConfig() → parseTransport() → MCP object         │
│         ↓                                                   │
│ codec.addMCP() → reads .mcp.json → merge → writes         │
│         ↓                                                   │
│ Tool config updated only (no agentsync config change)      │
└──────────────────────────────────────────────────────────────┘

┌─ Persistent Mode ─────────────────────────────────────────┐
│ CLI flags + --scope global/project                         │
│         ↓                                                   │
│ resolveMCPConfig() → save to agentsync config              │
│         ↓                                                   │
│ codec.addMCP() → sync to tool config                       │
│         ↓                                                   │
│ Both configs updated                                        │
└──────────────────────────────────────────────────────────────┘

┌─ Registry Mode ───────────────────────────────────────────┐
│ No inline config flags                                     │
│         ↓                                                   │
│ lookup(name) in config hierarchy                           │
│         ↓                                                   │
│ codec.addMCP() → sync to tool config(s)                    │
│         ↓                                                   │
│ Manages via agentsync config                              │
└──────────────────────────────────────────────────────────────┘
```

## Rationale

**Codec responsibility**: Each codec knows its tool's format, merge behavior, and enable/disable semantics
- Claude: `.mcp.json` format, merge by key
- Cursor: `.cursor/mcp.json`, merge by key
- Cline: No MCP support (TBD)
- RooCode: `.roo/mcp.json`, merge by key

**Ephemeral by default**: Inline config doesn't require agentsync setup
- Reduces barrier to entry
- No config pollution
- One-off operations don't affect agentsync state

**Precedence chain**: Explicit source priority prevents ambiguity
1. JSON (most explicit)
2. Transport flags (descriptive)
3. Preset extraction (cached)
4. Registry lookup (fallback)

**Single command**: `mcp enable` auto-detects mode via flags
- Simpler API
- Consistent with git pattern (`git -c` for one-off config)

## Consequences

**Positive**:
- Works standalone (no agentsync init required)
- Tool-specific behavior properly encapsulated
- Flexible config sources
- Backward compatible (registry mode unchanged)

**Negative**:
- All codecs need implementation (non-trivial)
- Dual state management (agentsync + tool configs)
- Transport parser needed for CLI to MCP conversion

## Alternatives Considered

1. **Separate command** (`mcp add` vs `mcp enable`): More explicit but adds complexity
2. **Config-only** (no direct tool sync): Requires running sync command separately
3. **Built-in custom codecs** (no loader): Less extensible
4. **Remote codec download**: Security concerns, not implemented yet

## Implementation Notes

- Transport parser: `src/core/mcp/transport.ts`
- Config resolver: `src/core/mcp/resolver.ts`
- Tool config helpers: `src/core/mcp/tool-config.ts`
- Codec interface: `addMCP()`, `disableMCP()`, `removeMCP()`
- CLI updates: `--json`, `--transport`, `--preset`, `--scope` flags
- Auto-sync after operations (ephemeral or persistent)
