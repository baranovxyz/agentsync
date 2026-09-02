# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-02

### Highlights

Stable 1.0 release. AgentSync now carries a semver commitment: breaking changes require a major
version bump, and the `.agents/agentsync.toml` config schema is frozen for v1. Global content
(`~/.agents/`) accumulates with project content rather than being overwritten by it.

### Added

- Three new sync targets, taking the supported set to 22: **Factory Droid** (`droid`),
  **Pi** (`pi`) and **Mistral Vibe** (`vibe`). All three read `AGENTS.md` and
  `.agents/skills/<name>/SKILL.md` natively — project and global scope alike — so they are
  registered with `readsGlobalAgentsDir: true`. They ship as
  optional adapters, not maintainer-validated targets, because none of them is covered by the
  Docker validation set. Per-tool specifics:
  - Droid: MCP merged into `.factory/mcp.json`, whose entries are a discriminated union on
    `type`, so URL servers are written as `type: "http"` (a URL server without it fails Droid's
    schema). The file is merged rather than overwritten because Droid writes it too, keeping
    `persistentPermissions` and OAuth state there. Commands go to `.factory/commands/`,
    subagents to `.factory/droids/`
  - Pi: commands to `.pi/prompts/`; **no MCP is written at all** — Pi ships no MCP client, so
    there is no file for it to read
  - Vibe: MCP merged into `.vibe/config.toml` as a `[[mcp_servers]]` array of tables where the
    server name is a field rather than the key. Vibe's `.vibe/agents/*.toml` are model and
    permission profiles, not role briefs, so canonical agents are deliberately not synced there
- `ToolProvider.readsGlobalAgentsDir` and `ToolProvider.globalSkillsHome` now keep user-scope
  discovery separate from the project-scope `capabilities.nativeSkillsDiscovery` fact. Codex,
  OpenCode, Cursor, Droid, Pi, and Vibe explicitly declare
  their verified native `~/.agents/skills` support; unverified native adapters declare that state
  explicitly and warn when global skills exist
- `agentsync sync` now emits an actionable warning for a tool that reads the project
  `.agents/` but is verified not to read the global `~/.agents/`, naming the undelivered
  global skills and the one-time symlink remedy, instead of a silent `skillCount: 0`
- `agentsync doctor` reports the same condition as a standing `globalSkillsGap` finding
  (`--json` field `globalSkillsGap`), passing once the remedy symlink (or an equivalent real
  directory) is present
- A built-CLI release matrix covers Claude Code (`cc`), Codex (`cx`), OpenCode (`oc`), and
  Cursor Agent (`ca`) across skills, commands, agents, rules, MCP, hooks, permissions,
  status-line, and output-style projection, including every deliberate lossy warning
- A built-CLI lifecycle suite verifies preview/write parity, repeat sync, filtered-provider sync,
  provider withdrawal, clean, modified-output preservation, and hand-authored neighbors against
  complete isolated project and HOME snapshots

### Changed

- `sync --dry-run` now uses the same read-only provider projections as a real sync, so file
  lists, counts, skipped declarations, and warnings match without writing output
- Every provider's generated file surfaces are tracked by exact path and SHA-256 content hash.
  Re-sync and clean unlink only unchanged files previously written by AgentSync; modified, unowned,
  and hand-authored neighboring files are preserved with recovery guidance. Link mode also records
  the exact symlink target, enabling repeat sync, copy-mode conversion, and clean while refusing a
  retargeted link even when its target has equal bytes
- MCP edits to `.agents/agentsync.toml` use a TOML syntax tree, preserving comments and unrelated
  formatting while changing only the requested server table
- OpenCode shared settings now follow the stable runtime's native project precedence across
  `.opencode/opencode.jsonc`, `.opencode/opencode.json`, `opencode.jsonc`, and `opencode.json`.
  AgentSync edits only the effective existing file (or defaults to root `opencode.json`) and binds
  cleanup receipts to that exact path, so lower-precedence configs stay untouched and path changes
  do not orphan generated state
- Stable OpenCode 1.x agent and command Markdown is projected through native schemas before write.
  Invalid known fields skip the declaration; unsupported command metadata warns and is omitted;
  translated output is copied even under `--link` so canonical source stays provider-neutral
- Generated ownership uses only the current receipt formats. Outputs without a current exact or
  semantic receipt are treated as unowned and preserved; AgentSync does not infer ownership from
  legacy headers, adopt old flat manifest entries, or run migration fallbacks
- Canonical TOML loading now rejects `[agentsync]`, `[mcp_servers.*]`, object-form `extends`, and
  the removed root keys `version`, `source_dir`, `profile`, `presets`, `security`, `useSymlinks`,
  `use_symlinks`, `mcp_enabled`, and `mcp_disabled` instead of treating them as aliases. The
  unrelated dallay/Rust layout remains narrow read-only interop only when `tools` is absent and
  `default_agents` or `[agents.*]` identifies it; only those tool selectors are projected, all
  foreign MCP control/server tables are ignored, and config mutation is refused without migration
- Current root, profile, local, and MCP-server schemas now reject unknown fields. Profiles use
  strict supported-tool values and allowlist semantics; command and URL MCP transports are
  mutually exclusive and require non-empty endpoints. Foreign parsing is exposed only through the
  shared project-path loader, not a general compatibility flag
- `sync`, `config show`, and `doctor` now share the same global/project/local hierarchy and profile
  resolver. Doctor checks URL/header/env tokens against the same project `.env` plus process
  environment as sync, and existing-config `init` reports the actually projected current tools
- Removed the dead reserved `doctor.workerHints` field and no-op `sync --no-tool-detection` flag.
  Filesystem sources now always use ordinary preset-directory loading; provider-directory
  auto-detection and Reference Mode are not part of the current CLI
- `init` now creates the complete current authored `.agents/` directories, including `rules/`;
  the unused backup directory under `.agents/` and its gitignore entry are removed. Codex lossy-projection
  warnings describe only supported current behavior and no longer advertise planned override
  syntax
- Cursor is now a maintainer-validated beta target after pinned Docker validation and transcript-
  backed live checks of project instructions, always rules, native skills, and an MCP tool call
- Sync JSON now reports `rules` as a required per-tool list and top-level count, matching every
  other projected content surface

### Fixed

- `agentsync clean` no longer deletes shared config files it merely merges into. Ten tools keep
  their MCP servers in a file that also holds the user's models, providers, permissions and themes
  — the active OpenCode project config, `.codex/config.toml`, `.goose/config.yaml`, `crush.json`,
  `.vibe/config.toml`, `.gemini/settings.json`, `.amp/settings.json`, `.augment/settings.json`,
  `.factory/mcp.json`, `.vscode/mcp.json` —
  and `clean` deleted them outright, discarding exactly what `mergeIntoSettings` exists to preserve.
  `clean` now strips only the top-level keys AgentSync writes, deletes the file only if nothing else
  remains, and leaves an unparseable file alone. Stripping runs only when the project actually
  configures MCP servers, so a project that syncs skills but not MCP never has a hand-written server
  block removed. Files edited rather than removed are reported separately as `modifiedFiles` (and
  `summary.modified` in `--json`)
- Copilot's `.vscode/mcp.json` is now merged rather than overwritten, so `sync` no longer discards
  the `inputs` block and servers added through the VS Code UI
- Generated command accumulation no longer contaminates canonical `.agents/commands`. Current Amp
  reports commands unsupported because the product replaced them with skills; Augment receives
  accumulated commands under its recommended `.augment/commands` path with exact receipts
- An explicit empty project `tools` list now remains authoritative instead of inheriting global
  tools. The same rule applies when a classified foreign selector projects no supported tool, so
  sync reports the empty selection rather than silently running an unrelated global target
- Generated project outputs now fail closed when a destination or ancestor symlink escapes the
  project. Shared JSON/TOML files are never replaced when their existing contents are malformed
  or unreadable
- Codex writes the active top-level `personality`, uses current status-line identifiers, validates
  role metadata (including `web_search = "indexed"` and granular approval policies), and precisely
  withdraws previously managed agents and extension keys without deleting hand-authored siblings
- Claude permissions now use native bare-tool, `WebFetch(domain:...)`, path-alias, and MCP rule
  grammar; unsupported allow/default semantics warn instead of being emitted as broader policy
- Cursor now projects its documented hooks, including `PostToolUseFailure`, permission tokens,
  commands, subagents, and native project/global skills; unsupported matcher tokens and
  declarations are dropped with explicit preview/write parity
- OpenCode permissions preserve ordered granular patterns, use scalar decisions for action-only
  tools, and map exact or literal-server wildcard MCP identities without emitting broader or inert
  rules. Shared MCP, permission, and instruction updates preserve native JSONC comments and
  trailing commas through targeted edits. This release target is stable OpenCode 1.x
  (`opencode-ai`; conformance checked against 1.18.25 on 2026-08-29). The separately packaged V2
  beta has distinct native contracts and is not certified by this release
- The `.agents/agentsync.toml`-managed block in `.gitignore` now ends with an explicit end marker
  instead of inferring its boundary from each entry's syntax, so repeated `init`/`sync` runs
  converge byte-for-byte instead of prepending a duplicate copy or growing extra blank lines. A
  block written before the marker existed is migrated in place rather than duplicated
- `doctor`'s `skills.synced` and rules-drift checks now read each tool's real skills/rules output
  path instead of a hand-maintained holdout map, so freshly-synced skills no longer report
  `synced: false` and a tool with no rules writer (RooCode, Copilot, Cline) no longer reports
  permanent drift
- A skill or command with an empty or missing `description` now gets one warning naming the path
  and field; the flat-file skill-layout warning fires once per sync run instead of once per tool;
  a global skill shadowed by a same-name project skill is deduped to a single warning instead of
  being listed and counted twice in `sync --json`
- `--link` now symlinks Claude Code's byte-identical rules output instead of copying it, matching
  the existing symlink behavior for skills and commands
- A preset ref that resolves but doesn't exist (e.g. `github:org/repo@bad-ref`) now reports
  `PRESET_REF_NOT_FOUND` instead of the retryable `PRESET_UNREACHABLE` used for genuine network
  failures
- Docs corrected to match shipped behavior found during beta soak testing: project skills take
  precedence over a same-name global skill; `AGENTS.md` is read from the sync target directory,
  not necessarily the repo root, in a monorepo; and every command auto-switches to JSON output on
  a non-TTY stdout, so `config show` and `config show --json` emit the same envelope under pipes,
  CI, and SSH

### Security

- Updated `js-yaml` to 4.3.1 and added schema validation for parsed JSON and frontmatter
  structures before use
- MCP sanitization now consumes the validated transport union directly and strips dangerous bytes
  from URL/header strings as well as command/args/env strings
- Updated standalone transitive pins to patched PostCSS 8.5.23, brace-expansion
  1.1.18/2.1.4/5.0.9, fast-uri 3.1.5, and esbuild 0.28.1; removed unused Inquirer and
  micromatch runtime dependencies together with their mock-only tests

## [1.0.0-beta.0] - 2026-04-30

### Highlights

Prerelease for validating the v1 AgentSync CLI and `.agents/` source-of-truth
model before the stable 1.0 release. The command surface and config format are
intended to be close to final, but this beta is still for integration feedback.

### Added

- 19-tool support: Cursor, Claude, Cline, RooCode, OpenCode, Codex, Gemini, Copilot, Amp, Goose, Aider, Amazon Q, Augment, Kiro, OpenHands, Junie, Crush, Kilocode, Qwen
- TOML config format (`.agents/agentsync.toml`)
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
- Doctor keeps the `workerHints` response field reserved but no longer infers external worker state
  from unrelated environment variables

### Fixed

- Avoid duplicate global `.agents/` content when the global config also appears in the discovered hierarchy
- Copy nested files inside skill directories, including `references/`, `scripts/`, and other supporting assets
- Align CI smoke tests with the v1 beta CLI after removing the standalone `mcp` command
- Remove token-shaped fake fixture values that could trigger secret scanners

### Security

- Updated dependency versions and lockfile overrides to clear moderate/high npm audit advisories for the beta package
