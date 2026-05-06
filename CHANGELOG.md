# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.0] - 2026-04-30

### Highlights

Prerelease for validating the v1 AgentSync CLI and `.agents/` source-of-truth
model before the stable 1.0 release. The command surface and config format are
intended to be close to final, but this beta is still for integration feedback.

### Added

- 19-tool support: Cursor, Claude, Cline, RooCode, OpenCode, Codex, Gemini, Copilot, Amp, Goose, Aider, Amazon Q, Augment, Kiro, OpenHands, Junie, Crush, Kilocode, Qwen
- TOML config format (`.agents/agentsync.toml`) with JSON fallback
- `.agents/` unified source directory
- N-layer hierarchical config discovery (org > team > service) for monorepo support
- Role-based profiles (`[profiles.*]`, `--profile` flag, `AGENTSYNC_PROFILE` env var)
- Monorepo subtree discovery with CI-mode partial syncs
- GitHub and filesystem preset system with namespace isolation
- MCP server sync through `[mcp.*]` config entries and `agentsync config add/rm/ls/show`
- `--link` / `--copy` sync modes for holdout tools
- `--dry-run` mode for all sync operations
- Flat `--` namespace separator (e.g., `company--tdd`)
- Reference mode for non-destructive onboarding from existing tool directories
- Generated file headers, content-hash drift detection, and optional git hook installation
- Zod validation for all JSON parsing

### Changed

- Config hierarchy uses N-layer discovery instead of fixed three-layer model
- Skills sync reads from `.agents/skills/` — holdout tools get copies, native tools skip
- Init creates `.agents/` with `agentsync.toml` instead of `.agentsync/config.json`
- No symlinks by default (CI/CD friendly)
- CLI surface is intentionally small: `init`, `sync`, `doctor`, `clean`, and `config` subcommands

### Fixed

- Avoid duplicate global `.agents/` content when the global config also appears in the discovered hierarchy
- Copy nested files inside skill directories, including `references/`, `scripts/`, and other supporting assets
- Align CI smoke tests with the v1 beta CLI after removing the standalone `mcp` command
- Remove token-shaped fake fixture values that could trigger secret scanners

### Security

- Updated dependency versions and lockfile overrides to clear moderate/high npm audit advisories for the beta package
