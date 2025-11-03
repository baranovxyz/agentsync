# Frequently Asked Questions (FAQ)

## General Questions

### What is AgentSync?

AgentSync is a configuration management tool that synchronizes AI coding agent settings (rules, commands, MCP servers) across different AI tools like Cursor, Claude Desktop, Cline, and RooCode. It eliminates the need to manually copy and maintain configurations across multiple tools.

### Is AgentSync stable for production use?

AgentSync is currently in **alpha development (0.2.0-alpha.22)**. This means:

- Core functionality works and is tested
- Breaking changes may occur without migration paths
- Config formats and CLI interfaces may evolve
- Best suited for early adopters who can tolerate change

See [ROADMAP.md](../ROADMAP.md) for our path to 1.0.0 stability.

### Which AI tools are supported?

Currently supported:

- **Cursor** - Full support (rules, commands, MCP servers)
- **Claude Desktop** - Full support (rules, commands, MCP servers)
- **Cline** - Partial support (rules and MCP servers only, no commands)
- **RooCode** - Full support (rules, commands, MCP servers)

### What's the difference between project and global configs?

- **Project config** (`.agentsync/config.json`) - Committed to git, shared with team
- **Local config** (`agentsync.local.json`) - Gitignored, personal overrides
- **Global config** (`~/.config/agentsync/config.json`) - System-wide defaults

Local configs completely replace project configs for `mcpServers` (no merging).

## Installation & Setup

### How do I install AgentSync?

```bash
npm install -g agentsync
# or
pnpm add -g agentsync
```

Then initialize in your project:

```bash
agentsync init
```

### Do I need to commit .agentsync/ to git?

**Yes!** The `.agentsync/` directory (except backups) should be committed so your team shares the same configuration. The `agentsync.local.json` file is gitignored for personal overrides.

### Can I try AgentSync without migrating my existing configs?

Yes! Use **reference mode** during init:

```bash
agentsync init
# When prompted, choose "Reference existing configs"
```

This creates symlinks instead of copying files, so you can test without disruption.

### How do I import my existing Cursor/Claude configs?

```bash
agentsync import ~/.cursor    # Import from global Cursor
agentsync import .            # Auto-detect project configs
```

The import command will detect duplicates and handle them intelligently.

## Configuration

### How do presets work?

Presets are reusable configuration packages, typically hosted on GitHub:

```json
{
  "extends": [
    {
      "source": "github:company/standards",
      "namespace": "company"
    }
  ]
}
```

AgentSync caches presets locally. Use `agentsync sync --pull` to update them.

### Can I use multiple presets?

Yes! Presets are composed in order:

```json
{
  "extends": [
    { "source": "github:company/base", "namespace": "company" },
    { "source": "github:team/frontend", "namespace": "frontend" },
    { "source": "fs:./local-rules", "namespace": "local" }
  ]
}
```

### How do I override preset configurations?

Create local rules/commands in `.agentsync/rules/` or `.agentsync/commands/`. Local files take precedence over preset files with the same name.

For MCP servers, use `agentsync.local.json`:

```json
{
  "mcpServers": ["github", "filesystem"]
}
```

This **completely replaces** the project MCP config (no merging).

### What's the namespace in preset configuration?

Namespaces prevent file conflicts between presets. Files are organized as:

- **Cursor/Claude/RooCode**: `preset/name/file.md` (nested)
- **Cline**: `preset_name_file.md` (flat with underscores)

### How do I disable all MCP servers temporarily?

In `agentsync.local.json`:

```json
{
  "mcpServers": []
}
```

Empty array disables all servers.

## Commands

### What's the difference between init and sync?

- **`agentsync init`** - One-time setup, creates base configuration
- **`agentsync sync`** - Regular use, syncs configs to all tools

After init, you'll mainly use `sync` to update your tools.

### Why does sync take a few seconds?

AgentSync is:

1. Loading and merging presets from GitHub
2. Converting to each tool's format (.mdc for Cursor, .md for others)
3. Writing files to multiple directories
4. Running security scans (secrets, unicode)

For large presets (100+ files), this is normal. Future versions will add incremental sync.

### Can I see what will change before syncing?

Not yet, but it's planned for beta. Currently, AgentSync creates backups before syncing, so you can always recover.

### How do I update my presets?

```bash
agentsync sync --pull
```

This refreshes cached presets from GitHub before syncing.

## Troubleshooting

### Error: "No .agentsync/config.json found"

You need to initialize first:

```bash
agentsync init
```

### Error: "Failed to fetch preset from GitHub"

Check:

1. Is the repository public? (Private repos aren't supported yet)
2. Is the repository URL correct?
3. Does the repository have the required structure? (rules/, commands/, mcp.json)
4. Are you connected to the internet?

Try clearing the preset cache:

```bash
agentsync preset cache-clear
```

### Error: "Duplicate files detected"

During import, if the same file exists in multiple sources, AgentSync uses "last-wins" resolution. The warning is informational - the import will proceed using the last occurrence.

To see which file was kept, check the import summary.

### Commands aren't syncing to Cline

Cline doesn't support slash commands - only rules and MCP servers. This is a Cline limitation, not an AgentSync issue.

### Files aren't showing up in Cursor

Check:

1. Did you run `agentsync sync`?
2. Is Cursor looking at the right directory? (`.cursor/rules/`)
3. Does Cursor need to be restarted?
4. Check for errors in the sync output

### How do I start over?

```bash
rm -rf .agentsync agentsync.local.json
rm -rf .cursor .claude .clinerules .roo  # Remove generated configs
agentsync init                            # Start fresh
```

### My custom rules aren't being used

Verify:

1. Are they in `.agentsync/rules/` or `.agentsync/commands/`?
2. Did you run `agentsync sync` after creating them?
3. Do they have valid frontmatter? (Required: `description` field)

Check with:

```bash
agentsync status
```

## Security

### What security scans does AgentSync run?

During sync, AgentSync automatically:

1. **Secret scanning** - Detects API keys, tokens, passwords in config files
2. **Unicode detection** - Identifies malicious hidden characters

To disable (not recommended):

```json
{
  "security": {
    "scanForSecrets": false,
    "scanForUnicode": false
  }
}
```

### Are my configs sent to any servers?

**No.** AgentSync is completely local-first. Your configurations never leave your machine except when:

1. You commit them to git (intentionally)
2. You use GitHub presets (fetched directly from GitHub, not through our servers)

### How does AgentSync store sensitive data?

MCP server environment variables can use token replacement:

```json
{
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "{{GITHUB_TOKEN}}"
      }
    }
  }
}
```

Tokens are read from environment variables at runtime, never stored in config files.

## Advanced Usage

### Can I create my own preset?

Yes! Create a repository with this structure:

```
your-preset/
├── rules/
│   ├── rule1.md
│   └── rule2.md
├── commands/
│   ├── command1.md
│   └── command2.md
└── mcp.json
```

Then use:

```json
{
  "extends": [
    {
      "source": "github:your-org/your-preset",
      "namespace": "custom"
    }
  ]
}
```

### How do I contribute to AgentSync?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

### Where can I get help?

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Documentation**: Check [docs/](.) for detailed guides

## Roadmap & Future

### When will AgentSync be stable (1.0)?

See [ROADMAP.md](../ROADMAP.md) for our timeline:

- **Beta**: Q1 2026 - API stability
- **RC**: Q2 2026 - Production testing
- **1.0**: Q2-Q3 2026 - Stable release

### What features are planned?

Key features in development:

- Watch mode (auto-sync on changes)
- Dry-run/preview mode
- Preset marketplace
- VS Code extension
- Web UI for config management

See [ROADMAP.md](../ROADMAP.md) for the complete feature roadmap.

### Will breaking changes happen in alpha?

**Yes.** Alpha means we prioritize UX improvements over backward compatibility. Breaking changes may occur without migration paths.

We'll stabilize in beta and commit to semantic versioning in 1.0.

---

**Still have questions?** Open a [GitHub Discussion](https://github.com/baranovxyz/agentsync/discussions) or [issue](https://github.com/baranovxyz/agentsync/issues).
