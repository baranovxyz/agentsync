# AgentSync

[![npm version](https://badge.fury.io/js/agentsync.svg)](https://www.npmjs.com/package/agentsync)
[![Tests](https://github.com/baranovxyz/agentsync/actions/workflows/test-with-bats.yml/badge.svg)](https://github.com/baranovxyz/agentsync/actions/workflows/test-with-bats.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/agentsync)](https://nodejs.org)

> The infrastructure layer for AI coding agent configuration.

AgentSync provides:

- MCP Context Optimizer — project-specific MCP server selection
- GitHub Preset System — share rules, commands, and MCPs via presets
- AGENTS.md Sync (in progress)

## Installation

Prerequisites: Node.js >= 18

From npm (recommended):

```bash
npm install -g agentsync
# or
pnpm add -g agentsync
# or
yarn global add agentsync
```

From source (development):

```bash
git clone https://github.com/baranovxyz/agentsync
cd agentsync
pnpm install
pnpm dev
```

## Quick Start

```bash
# Initialize in a project
agentsync init

# Check current configuration status
agentsync status

# Import existing tool configurations
agentsync import ~/.cursor    # Import from global Cursor config
agentsync import .            # Auto-detect and import from current project

# Manage presets
agentsync preset select
agentsync preset list
agentsync preset cache-clear

# Manage MCP servers
agentsync mcp list
agentsync mcp add github

# Sync everything (rules, commands, AGENTS.md links, MCPs)
agentsync sync
```

## Examples

### Team preset config (committed: .agentsync/config.json)

```json
{
  "extends": [
    {
      "source": "github:acme/coding-standards",
      "namespace": "acme",
      "include": ["rules/**/*.md", "commands/**/*.md"],
      "exclude": ["rules/deprecated/*"]
    }
  ],
  "tools": ["cursor", "claude"]
}
```

### Filesystem presets (local development)

```json
{
  "extends": [
    { "source": "github:company/standards", "namespace": "company" },
    { "source": "fs:./local-presets", "namespace": "local" }
  ],
  "tools": ["cursor", "claude"]
}
```

**Use cases:**

- Develop presets locally before publishing to GitHub
- Private presets not suitable for version control
- Fast iteration without git commits

### Local overrides (personal: agentsync.local.json)

```json
{
  "mcpServers": []
}
```

## Documentation

- **Start here**: REQUIREMENTS.md (feature overview and design)
- **Quick ref**: AGENTS.md (AI agent context)
- **Configuration**: docs/configuration.md
- **Presets**: docs/presets.md
- **CLI**: docs/cli.md
- **Testing**: TESTING.md
- **Debugging**: docs/debugging.md
- **Security**: SECURITY.md
- **Architecture**: ARCHITECTURE.md
- **Changelog**: CHANGELOG.md

## License

MIT
