# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-alpha.21] - 2025-11-02

### Added

- Config hierarchy system with preset deduplication
- Tool detection and onboarding helpers in init wizard
- Status command to display configuration status
- Import command now includes duplicate detection with last-wins resolution

### Changed

- Sync command now integrates config hierarchy loading
- README restructured with user-focused messaging

### Fixed

- Bundling issues with node:fs/promises imports resolved
- Cline command limitations now properly documented

### Documentation

- Added canonical format and codec system architecture documentation
- Added BATS test documentation to testing guide
- Improved cross-references and documentation links
- Cleaned up outdated version labels

## [0.2.0-alpha.20] - 2025-11-02

### Changed

- Version bump for npm testing

## [0.2.0-alpha.19] - 2025-10-30

### Added

- Support for project custom commands and rules

## [0.2.0-alpha.18] - 2025-10-28

### Added

- Frontmatter validation for commands and rules files
- Comprehensive warning system for missing frontmatter

### Fixed

- RooCode converter now properly handles frontmatter requirements

## [0.2.0-alpha.17] - 2025-10-28

### Changed

- Refactored init/sync separation of concerns for AGENTS.md symlinks
- Init now only creates base files; sync command handles tool-specific setup
- Tool converters are now single source of truth for tool-specific behavior

### Fixed

- Removed architectural duplication between init and sync commands

## [0.2.0-alpha.16] - 2025-10-28

### Added

- Tool-specific .gitignore generation with `gitignore` command
- Comprehensive tests for gitignore utilities and project custom rules
- Config creation utility for shared functionality

### Changed

- Refactored config merger to function-based API
- Consolidated and streamlined project documentation
- Improved pre-commit hook robustness

### Removed

- Unused debounce utility
- Unused AGENTS.md parser and markdown dependencies
- File watcher module (deferred feature)

### Fixed

- TypeScript compilation errors in preset and registry system
- MCP config merging logic - now "local replaces project"

---

**Note:** This is an alpha release. For historical release notes, see git tags.
