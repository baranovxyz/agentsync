# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.1] - 2025-01-16

### 🎉 Initial Alpha Release

This is the first public alpha release of AgentSync. While the foundation is solid, only the `init` command is fully functional.

### Added

#### Core Features
- **`init` command** - Interactive setup wizard to initialize AgentSync in a project
  - Template selection (default, typescript-react, python-fastapi)
  - Multi-tool selection (Cursor, Claude Code, Cline, Windsurf, GitHub Copilot)
  - Symlink vs copy option for tool configurations
  - Automatic .gitignore updates

#### Security Layer
- **Secret Scanner** - Detects 25+ patterns of API keys, tokens, and credentials
  - AWS, GitHub, Google, Azure, database connection strings
  - Entropy-based detection for high-entropy strings
  - False positive filtering
- **Unicode Attack Detector** - Prevents Trojan Source attacks (CVE-2021-42574)
  - Zero-width character detection
  - Bidirectional text override detection
  - Homoglyph attack prevention
- **Audit Logger** - JSONL-based immutable audit trail
  - Session tracking
  - Event categorization
  - Automatic log rotation

#### Infrastructure
- **AGENTS.md Parser** - Remark-based markdown parser for configuration files
- **Error System** - Typed error classes with recovery suggestions
- **File Watcher** - Chokidar-based file watching with debouncing
- **CLI Framework** - Commander.js with 9 commands scaffolded
- **Type System** - Full TypeScript with strict mode and Zod validation

### Not Yet Implemented
The following commands are scaffolded but not functional:
- `sync` - One-time sync to all tools
- `watch` - Watch for changes and auto-sync
- `validate` - Validate AGENTS.md format
- `diff` - Show differences between current and proposed sync
- `migrate` - Migrate existing tool configs to AGENTS.md
- `doctor` - Diagnose and fix common issues
- `status` - Show sync status for all tools
- `audit` - View audit logs
- `tree` - Show workspace configuration tree

### Known Issues
- Translator implementations for all tools not complete
- Atomic sync with rollback not fully tested
- No monorepo workspace detection
- Remote audit log shipping not implemented

### Technical Details
- **Runtime:** Node.js 18+ required
- **Package Manager:** pnpm recommended
- **Build:** Vite for fast CLI builds
- **Testing:** Vitest (tests to be added)
- **Dependencies:** 15 production, 11 development

### Security Note
This release includes comprehensive security scanning to prevent accidental exposure of secrets and protection against Unicode-based attacks. All file operations are validated before execution.

[0.1.0-alpha.1]: https://github.com/baranovxyz/agentsync/releases/tag/v0.1.0-alpha.1