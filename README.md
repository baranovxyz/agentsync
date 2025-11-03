# AgentSync

[![npm version](https://badge.fury.io/js/agentsync.svg)](https://www.npmjs.com/package/agentsync)
[![Tests](https://github.com/baranovxyz/agentsync/actions/workflows/test-with-bats.yml/badge.svg)](https://github.com/baranovxyz/agentsync/actions/workflows/test-with-bats.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/agentsync)](https://nodejs.org)

> **Stop copying configs between AI coding tools. Sync them all with one command.**

## ⚠️ Alpha Status

**AgentSync is in active alpha development.** This means:

- 🔄 **Breaking changes are expected** — We prioritize better UX over backward compatibility
- 📦 **No guaranteed migration paths** — Config formats may change between versions
- 🎯 **Built for early adopters** — If you want stability, wait for 1.0.0
- 🚀 **Rapid iteration** — New features and improvements ship frequently

We're committed to reaching stability. See [ROADMAP.md](./ROADMAP.md) for our path to 1.0.0.

**Current version: 0.2.0-alpha.22**

## 😫 The Problem

Are you tired of:

- Copying `.cursor/rules` to `.claude/` every time you update coding standards?
- Maintaining separate configs for Cursor, Claude, Cline, and Roocode?
- Team members using outdated AI agent configurations?
- No way to share MCP servers across different tools?

**You're losing 30+ minutes per week on manual config management.**

## ✨ The Solution

AgentSync is the infrastructure layer that keeps all your AI coding tools in perfect sync.

```bash
# Before: Manual chaos 😰
cp ~/.cursor/rules/* ~/.claude/rules/
cp ~/.cursor/rules/* ./.clinerules/
# Oops, forgot Roocode... and wait, .mdc needs to be .md...

# After: One command, everything synced ✅
agentsync sync
✓ Synced to Cursor, Claude, Cline, Roocode
```

## 🚀 What You Get

### For Individual Developers

- **Never copy config files again** — One source of truth for all AI tools
- **Tool flexibility** — Switch between Cursor, Claude, Cline seamlessly
- **Smart format conversion** — Automatically handles .mdc ↔ .md conversions
- **MCP server management** — Share context servers across all tools

### For Teams

- **Instant standardization** — Push coding standards to entire team at once
- **GitHub-based presets** — Share rules via `github:company/standards`
- **No more drift** — Everyone uses the same prompts and commands
- **Security by default** — Built-in secret scanning prevents API key leaks

### For Organizations

- **Compliance ready** — Audit logs for all configuration changes
- **Preset composition** — Layer company, team, and project standards
- **Tool agnostic** — Works with whatever AI tools your teams prefer
- **Progressive adoption** — Teams can migrate at their own pace

## 📊 Before vs After

| Task                        | Before AgentSync                  | With AgentSync                        |
| --------------------------- | --------------------------------- | ------------------------------------- |
| Update coding standards     | Edit 4+ config files manually ❌  | Edit once, run `agentsync sync` ✅    |
| Share team prompts          | Copy/paste in Slack ❌            | `extends: ["github:team/prompts"]` ✅ |
| New team member setup       | 20 minutes of copying files ❌    | `agentsync init` - 30 seconds ✅      |
| Add MCP server to all tools | Configure each tool separately ❌ | Add to `mcpServers`, sync once ✅     |
| Switch between AI tools     | Recreate all configurations ❌    | Already synced automatically ✅       |

## ⚡ Quick Start

### Install (30 seconds)

```bash
npm install -g agentsync
# or
pnpm add -g agentsync
```

### Set Up (2 minutes)

```bash
# Initialize in your project
agentsync init

# Import existing configs (optional)
agentsync import ~/.cursor    # Import from Cursor
agentsync import .            # Auto-detect and import

# Sync everything
agentsync sync
```

**That's it!** Your AI tools are now synchronized.

## 🎯 Real-World Example

Your team uses Cursor, but you prefer Claude. Another developer uses Roocode. Here's how AgentSync helps:

**.agentsync/config.json** (shared via git):

```json
{
  "extends": [
    {
      "source": "github:acme/coding-standards",
      "namespace": "company"
    }
  ],
  "tools": ["cursor", "claude", "roocode"],
  "mcpServers": ["github", "postgres"]
}
```

Now everyone has:

- ✅ Same coding standards across all tools
- ✅ Same slash commands (`/test`, `/review`, `/commit`)
- ✅ Same MCP servers for enhanced context
- ✅ Tool-specific format compatibility (.mdc for Cursor, .md for others)

## 🛠️ Core Features

### 1. Universal Sync Engine

- **One source, multiple targets** — Define once in `.agentsync/`
- **Format intelligence** — Handles .mdc, .md, nested/flat structures
- **Bidirectional codecs** — Import from any tool, export to any tool

### 2. GitHub Preset System

Share and compose configurations across teams:

```json
{
  "extends": [
    { "source": "github:company/standards", "namespace": "company" },
    { "source": "github:team/frontend", "namespace": "frontend" },
    { "source": "fs:./local-overrides", "namespace": "local" }
  ]
}
```

### 3. MCP Server Management

Configure Model Context Protocol servers once, use everywhere:

```json
{
  "mcpServers": ["github", "postgres", "filesystem"]
}
```

### 4. Smart Migration

- **Reference mode** — Try AgentSync without moving files
- **Import mode** — Full migration with automatic backups
- **Tool detection** — Automatically finds existing configs

### 5. Security First

- **Secret scanning** — Prevents accidental API key commits (enabled by default)
- **Unicode detection** — Blocks hidden character attacks
- **Audit logging** — Track all configuration changes
- **Local-first** — Your data never leaves your machine

## 📦 Supported Tools

| Tool        | Rules                    | Commands                   | MCP Servers | AGENTS.md |
| ----------- | ------------------------ | -------------------------- | ----------- | --------- |
| **Cursor**  | ✅ `.cursor/rules/*.mdc` | ✅ `.cursor/commands/*.md` | ✅          | ✅        |
| **Claude**  | ✅ `.claude/rules/*.md`  | ✅ `.claude/commands/*.md` | ✅          | ✅        |
| **Cline**   | ✅ `.clinerules/*.md`    | ❌ Not supported           | ✅          | ✅        |
| **Roocode** | ✅ `.roo/rules/*.md`     | ✅ `.roo/commands/*.md`    | ✅          | ✅        |

## 🎮 Commands

```bash
# Initialize AgentSync
agentsync init

# Check configuration status
agentsync status

# Import existing configs
agentsync import ~/.cursor    # From global Cursor config
agentsync import .            # Auto-detect project configs

# Sync configurations
agentsync sync               # Sync everything
agentsync sync --pull        # Update presets first

# Manage presets
agentsync preset list        # Show available presets
agentsync preset select      # Interactive preset selection
agentsync preset add github:org/repo

# Manage MCP servers
agentsync mcp list          # Show available MCP servers
agentsync mcp add github    # Add a specific server
```

## 📚 Documentation

- **Getting Started**: See Quick Start above
- **Requirements & Design**: [REQUIREMENTS.md](./REQUIREMENTS.md)
- **Configuration Guide**: [docs/configuration.md](./docs/configuration.md)
- **Preset System**: [docs/presets.md](./docs/presets.md)
- **CLI Reference**: [docs/cli.md](./docs/cli.md)
- **Testing**: [TESTING.md](./TESTING.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 🔒 Security

- **Local-first**: Your configurations never leave your machine
- **Secret scanning**: Built-in detection for API keys and tokens
- **Audit trail**: Complete history of all configuration changes
- **No telemetry**: We don't track usage or collect data

See [SECURITY.md](./SECURITY.md) for details.

## 📝 License

MIT — Use it freely in personal and commercial projects.

---

**Ready to save 30+ minutes per week?**

```bash
npm install -g agentsync && agentsync init
```

_Stop managing configs. Start shipping code._ 🚀
