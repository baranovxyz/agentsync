# AI Coding Tool Capabilities

This document specifies the capabilities and configuration requirements for each AI coding tool supported by AgentSync.

## Overview

AgentSync supports multiple AI coding tools, each with different capabilities for organizing rules, commands, and MCP servers. Understanding these differences is crucial for proper configuration synchronization.

## Nested Directory Support

| Tool        | Rules | Commands | Notes                                        |
| ----------- | ----- | -------- | -------------------------------------------- |
| Cursor      | ✅    | ✅       | Subdirectories create namespaced commands    |
| Claude Code | ✅    | ✅       | Supports nested with namespace labeling      |
| RooCode     | ✅    | ✅       | Recursive reading (max depth: 5)             |
| Cline       | ❌    | ❌       | Flat structure only, no subdirectory support |

## File Extension Requirements

### Rules

| Tool        | Extension | Format                      |
| ----------- | --------- | --------------------------- |
| Cursor      | `.mdc`    | Markdown + YAML frontmatter |
| Claude Code | `.md`     | Markdown                    |
| RooCode     | `.md`     | Markdown (no frontmatter)   |
| Cline       | `.md`     | Markdown                    |

### Commands

| Tool        | Extension | Format                      |
| ----------- | --------- | --------------------------- |
| Cursor      | `.md`     | Markdown + YAML frontmatter |
| Claude Code | `.md`     | Markdown + YAML frontmatter |
| RooCode     | `.md`     | Markdown + YAML frontmatter |
| Cline       | N/A       | Not supported               |

## Namespace Formatting

Due to cross-platform compatibility issues with colons (`:`) in filenames, AgentSync uses different namespace formats based on each tool's capabilities:

### Nested Directory Tools (Cursor, Claude Code, RooCode)

**Format**: `namespace/filename`

**Examples**:

```
.cursor/rules/company/typescript.mdc
.cursor/commands/company/commit.md
.claude/rules/company/typescript.md
.roo/rules/company/typescript.md
```

**Benefits**:

- Clear visual organization
- Native tool support
- Mirrors logical namespace hierarchy

### Flat Structure Tools (Cline)

**Format**: `namespace_filename`

**Examples**:

```
.clinerules/company_typescript.md
.clinerules/team_security.md
```

**Benefits**:

- Cross-platform compatible
- Clear visual separator
- Works within tool's limitations

## Directory Structure

### Cursor

```
.cursor/
├── rules/
│   ├── namespace1/
│   │   ├── file1.mdc
│   │   └── file2.mdc
│   └── namespace2/
│       └── file3.mdc
├── commands/
│   └── namespace1/
│       └── command1.md
└── mcp.json
```

**Special Features**:

- AGENTS.md native support (root directory)
- Frontmatter metadata for rules (description, globs, alwaysApply, tags, priority)
- Variable substitution in MCP config (`${env:VAR}`, `${workspaceFolder}`)

### Claude Code

```
.claude/
├── rules/
│   └── namespace1/
│       └── file1.md
├── commands/
│   └── namespace1/
│       └── command1.md
└── mcp.json
```

**Special Features**:

- CLAUDE.md support (root directory, or symlink to AGENTS.md)
- Command frontmatter (description, argument-hint, model, allowed-tools)
- Hierarchical CLAUDE.md loading (project, parent dirs, home folder)

### RooCode

```
.roo/
├── rules/
│   └── namespace1/
│       └── file1.md
├── commands/
│   └── namespace1/
│       └── command1.md
└── mcp.json
```

**Special Features**:

- Native AGENTS.md support (no symlink needed)
- Mode-specific rules directories (`.roo/rules-{modeSlug}/`)
- Recursive directory reading (max depth: 5)
- Command frontmatter (description, argument-hint)

### Cline

```
.clinerules/
├── namespace1_file1.md
├── namespace1_file2.md
└── namespace2_file3.md
```

**Special Features**:

- AGENTS.md support via symlink (`.clinerules/AGENTS.md` → `../AGENTS.md`)
- No command file support (agentic/action-based, not command-driven)
- Modular markdown files (rules, memory, directory-structure)

## MCP Configuration

All tools use the standard `mcpServers` format in their respective config files:

| Tool        | Location                  | Format                          |
| ----------- | ------------------------- | ------------------------------- |
| Cursor      | `.cursor/mcp.json`        | `{ "mcpServers": {} }`          |
| Claude Code | `.claude/mcp.json`        | Standard MCP format             |
| RooCode     | `.roo/mcp.json`           | Enhanced with env interpolation |
| Cline       | `cline_mcp_settings.json` | VSCode global storage           |

**Common Features**:

- STDIO transport (local servers)
- Environment variable support
- Per-tool approval settings

**Tool-Specific Extensions**:

- **Cursor**: SSE transport for remote servers, `${workspaceFolder}` substitution
- **RooCode**: Runtime version managers (mise, asdf), `${env:VAR}` interpolation
- **Cline**: Auto-approve per tool, timeout settings

## Frontmatter Support

### Rules Files

| Tool        | Frontmatter | Supported Fields                                         |
| ----------- | ----------- | -------------------------------------------------------- |
| Cursor      | ✅ YAML     | description, globs, alwaysApply, tags, priority, version |
| Claude Code | ❌          | Plain markdown only                                      |
| RooCode     | ❌          | Plain markdown only                                      |
| Cline       | ❌          | Plain markdown only                                      |

### Command Files

| Tool        | Frontmatter | Supported Fields                                                           |
| ----------- | ----------- | -------------------------------------------------------------------------- |
| Cursor      | ✅ YAML     | description, allowed-tools, arbitrary metadata                             |
| Claude Code | ✅ YAML     | description, argument-hint, model, allowed-tools, disable-model-invocation |
| RooCode     | ✅ YAML     | description, argument-hint                                                 |
| Cline       | N/A         | No command support                                                         |

## References

For detailed information about each tool's configuration:

- **Cursor**: [research/cursor.md](../research/cursor.md)
- **Claude Code**: [research/claude-code.md](../research/claude-code.md)
- **RooCode**: [research/roo-code.md](../research/roo-code.md)
- **Cline**: [research/cline.md](../research/cline.md)

Official documentation:

- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Claude Code Settings](https://docs.claude.com/en/docs/claude-code/settings)
- [RooCode Custom Instructions](https://docs.roocode.com/features/custom-instructions)
- [Cline Rules](https://cline.ghost.io/cline-rules/) (rules only, no command support)
