# AI Coding Tool Capabilities

This document specifies the capabilities and configuration requirements for each AI coding tool supported by AgentSync.

## Overview

AgentSync supports multiple AI coding tools, each with different capabilities for organizing rules, commands, and MCP servers. Understanding these differences is crucial for proper configuration synchronization.

## Nested Directory Support

| Tool        | Rules | Commands | Notes                                                   |
| ----------- | ----- | -------- | ------------------------------------------------------- |
| Cursor      | ✅    | ✅       | Subdirectories create namespaced commands               |
| Claude Code | ✅    | ✅       | Supports nested with namespace labeling                 |
| RooCode     | ✅    | ✅       | Recursive reading (max depth: 5)                        |
| Cline       | ✅    | ❌       | Flat `.clinerules/`, supports `paths` frontmatter       |
| OpenCode    | ✅    | ✅       | Reads `.agents/` natively                               |
| Codex       | ✅    | ❌       | Reads `.agents/skills/` natively                        |
| Gemini      | ✅    | ❌       | Reads `.agents/skills/` natively                        |
| Copilot     | ✅    | ❌       | `.github/skills/`, `.github/agents/`                    |
| Amp         | ✅    | ✅       | Reads `.agents/` natively (same convention)             |
| Goose       | ✅    | ❌       | Reads `.agents/skills/` natively                        |
| Aider       | ❌    | ❌       | AGENTS.md only, no file structure                       |
| Amazon Q    | ✅    | ❌       | Reads `.agents/skills/` natively                        |
| Augment     | ✅    | ✅       | Reads `.agents/` natively, rules in `.augment/rules/`   |
| Kiro        | ✅    | ❌       | Reads `.agents/` natively, steering in `.kiro/steering/`|
| OpenHands   | ✅    | ❌       | Reads `.agents/skills/` natively                        |
| Junie       | ✅    | ❌       | Reads `.agents/` natively, skills in `.junie/skills/`   |
| Crush       | ❌    | ❌       | MCP only, no file structure                             |
| Kilocode    | ✅    | ❌       | Reads `.agents/` natively, rules in `.kilocode/rules/`  |
| Qwen        | ✅    | ❌       | Reads `.agents/` natively                               |

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

- AGENTS.md support (root directory)
- Command frontmatter (description, argument-hint, model, allowed-tools)
- Hierarchical AGENTS.md loading (project, parent dirs, home folder)

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

- AGENTS.md read natively (no symlink needed)
- Workflows in `.clinerules/workflows/` (not AgentSync commands)
- YAML frontmatter with `paths` field for conditional rules
- MCP is global-only (`~/.cline/data/settings/cline_mcp_settings.json`)

## MCP Configuration

MCP configuration varies by tool:

| Tool        | Location                  | Format                                                  |
| ----------- | ------------------------- | ------------------------------------------------------- |
| Cursor      | `.cursor/mcp.json`        | JSON `{ "mcpServers": {} }`                             |
| Claude Code | `.mcp.json`               | JSON `{ "mcpServers": {} }`                             |
| RooCode     | `.roo/mcp.json`           | JSON, enhanced with env interpolation                   |
| Cline       | N/A (global only)         | Global: `~/.cline/data/settings/cline_mcp_settings.json`|
| OpenCode    | `opencode.json`           | JSON `{ "mcp": {} }` (custom format)                    |
| Codex       | `.codex/config.toml`      | TOML `[mcp_servers]`                                    |
| Gemini      | `.gemini/settings.json`   | JSON `{ "mcpServers": {} }` (merged)                    |
| Copilot     | `.vscode/mcp.json`        | JSON `{ "servers": {} }` (VS Code format)               |
| Amp         | `.amp/settings.json`      | JSON `{ "mcpServers": {} }` (merged)                    |
| Goose       | `.goose/config.yaml`      | YAML `extensions:` (stdio/sse types)                    |
| Aider       | N/A                       | No MCP support                                          |
| Amazon Q    | `.amazonq/mcp.json`       | JSON `{ "mcpServers": {} }`                             |
| Augment     | `.augment/settings.json`  | JSON `{ "mcpServers": {} }` (merged)                    |
| Kiro        | `.kiro/settings/mcp.json` | JSON `{ "mcpServers": {} }`                             |
| OpenHands   | `.openhands/mcp.json`     | JSON split-array (`stdio_servers` / `sse_servers`)      |
| Junie       | `.junie/mcp/mcp.json`     | JSON `{ "mcpServers": {} }`                             |
| Crush       | `crush.json`              | JSON `{ "mcp": {} }` (non-standard key)                 |
| Kilocode    | `.kilocode/mcp.json`      | JSON `{ "mcpServers": {} }`                             |
| Qwen        | `.qwen/.mcp.json`         | JSON `{ "mcpServers": {} }`                             |

**Common Features**:

- STDIO transport (local servers)
- Environment variable support
- Per-tool approval settings

**Tool-Specific Extensions**:

- **Cursor**: SSE transport for remote servers, `${workspaceFolder}` substitution
- **RooCode**: Runtime version managers (mise, asdf), `${env:VAR}` interpolation
- **Cline**: Global-only MCP (no project-level config)
- **Goose**: YAML config with `type: stdio` / `type: sse`, field mapping (`cmd`, `envs`, `uri`)

## Frontmatter Support

### Rules Files

| Tool        | Frontmatter | Supported Fields                                         |
| ----------- | ----------- | -------------------------------------------------------- |
| Cursor      | ✅ YAML     | description, globs, alwaysApply, tags, priority, version |
| Claude Code | ❌          | Plain markdown only                                      |
| RooCode     | ❌          | Plain markdown only                                      |
| Cline       | ✅ YAML     | paths (glob patterns for conditional activation)         |

### Command Files

| Tool        | Frontmatter | Supported Fields                                                           |
| ----------- | ----------- | -------------------------------------------------------------------------- |
| Cursor      | ✅ YAML     | description, allowed-tools, arbitrary metadata                             |
| Claude Code | ✅ YAML     | description, argument-hint, model, allowed-tools, disable-model-invocation |
| RooCode     | ✅ YAML     | description, argument-hint                                                 |
| Cline       | N/A         | No command support                                                         |

## References

Official documentation:

- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Claude Code Settings](https://docs.claude.com/en/docs/claude-code/settings)
- [RooCode Custom Instructions](https://docs.roocode.com/features/custom-instructions)
- [Cline Rules](https://cline.ghost.io/cline-rules/)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Amp Manual](https://ampcode.com/manual)
- [Goose](https://github.com/block/goose)
- [Aider](https://aider.chat)
- [Amazon Q CLI](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line.html)
