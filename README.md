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
      "include": ["rules/**/*.md", "commands/**/*.md"],
      "exclude": ["rules/deprecated/*"]
    }
  ],
  "tools": ["cursor", "claude"]
}
```

### Local overrides (personal: agentsync.local.json)

```json
{
  "mcpServers": []
}
```

## Documentation

- CLI reference: docs/cli.md
- Configuration: docs/configuration.md
- Presets and selection: docs/presets.md
- AGENTS.md: docs/agents-md.md
- Debugging: docs/debugging.md
- Security policy: SECURITY.md
- Testing: TESTING.md
- Architecture: ARCHITECTURE.md
- Changelog (breaking changes): CHANGELOG.md

## License

MIT
