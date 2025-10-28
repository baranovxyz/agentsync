# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
