# AgentSync v1.0 Conformance Spec

**Purpose**: Machine-verifiable requirements for LLM code review. Each requirement has a verification method (grep, file check, test run, or code inspection).

**Sources**: Consolidates requirements from:
- `2026-03-28-v1-hardening-design.md` — CLI surface, errors, presets
- `2026-03-29-output-contract-design.md` — JSON envelope, exit codes, field projection
- `2026-03-30-v1-polish-design.md` — minified JSON, sanitization, operation receipts
- `2026-03-30-architecture-cleanup-design.md` — error simplification, registry wiring, sync restructuring, doctor decomposition, codec deletion
- Design session 2026-03-31 — bootstrap deletion, symlinks-as-default, git hooks
- `2026-04-01-directory-cleanup-design.md` — .agentsync/ removal, no cache, 3-tier config, ~/.agents/ global dir

---

## 1. CLI Surface

### REQ-CLI-01: Exactly 8 leaf commands
The CLI exposes exactly: `init`, `sync`, `doctor`, `clean`, `config add`, `config rm`, `config ls`, `config show`.
- **Verify**: `grep -c 'command(' src/cli.ts` — count registered commands. `pnpm cli --help` output lists only these.

### REQ-CLI-02: No deleted commands exist
None of these exist: `mcp`, `preset`, `import`, `gitignore`, `status`, `restore`, `discover`.
- **Verify**: `grep -rn 'status\|restore\|discover' src/commands/` — no command files for these. No `src/commands/mcp/` or `src/commands/preset/` directories.

### REQ-CLI-03: `--json` on every command
Every command that produces output supports `--json` for structured output.
- **Verify**: All command files in `src/commands/` accept a `json` option. Test with `pnpm cli <cmd> --json`.

### REQ-CLI-04: `--dry-run` on sync and clean
`sync` and `clean` support `--dry-run` that previews without writing.
- **Verify**: Check option registration in `src/cli.ts` for both commands.

### REQ-CLI-05: `--fields` projection on doctor, config ls, config show
These commands accept `--fields <comma-separated>` to filter JSON output keys inside `data`.
- **Verify**: `grep --fields src/cli.ts` shows registration on three commands. `projectFields()` exists in `src/types/output.ts`.

### REQ-CLI-06: `--profile` flag and AGENTSYNC_PROFILE env var
`sync` accepts `--profile <name>` and reads `AGENTSYNC_PROFILE` env var.
- **Verify**: Check `src/cli.ts` sync command registration and `src/core/config/profiles.ts`.

### REQ-CLI-07: config add types
`config add` handles types: `tool`, `mcp`, `preset`, `skill`, `command`.
- **Verify**: `src/commands/config/add.ts` handles all five types.

### REQ-CLI-08: No init --from
`init --from` does not exist. AI agents can read existing tool configs and set up `.agents/` directly — no CLI import command needed.
- **Verify**: No `--from` option in `src/cli.ts` init command. No import logic in `src/commands/init.ts`.

---

## 2. Output Contract

### REQ-OUT-01: CliResult<T> envelope
All `--json` output uses the `CliResult<T>` envelope:
```typescript
interface CliResult<T> {
  version: "1.0";
  status: "success" | "partial" | "error";
  command: string;
  data: T;
  errors?: CliError[];
  warnings?: string[];
}
```
- **Verify**: `CliResult` interface in `src/types/output.ts`. `CliResultSchema` Zod schema validates it. All commands use `cliResult()` helper.

### REQ-OUT-02: CliError structure
Every error includes `code` (machine-readable), `message` (human-readable), optional `suggestion` (recovery command), optional `context`.
- **Verify**: `CliError` interface in `src/types/output.ts`. `CliErrorSchema` Zod schema.

### REQ-OUT-03: Partial success status
`sync` returns `status: "partial"` when some operations succeed but others fail (e.g., unreachable preset).
- **Verify**: `src/commands/sync.ts` or `src/sync/` sets partial status on preset failure.

### REQ-OUT-04: Exit codes 0-4
| Exit | Meaning | Status |
|------|---------|--------|
| 0 | Success | `success` |
| 1 | Partial | `partial` |
| 2 | User error | `error` (validation, config) |
| 3 | System error | `error` (filesystem, unknown) |
| 4 | Transient error | `error` (network, retryable) |
- **Verify**: `ExitCode` constants and `statusToExitCode()` in `src/core/errors.ts`.

### REQ-OUT-05: Minified JSON default
`--json` output is minified by default. Pretty-print only when `--pretty` flag is set.
- **Verify**: `jsonStringify()` in `src/types/output.ts` defaults to minified. No `JSON.stringify(..., null, 2)` in command files.

### REQ-OUT-06: Per-command data types with Zod schemas
Each command has a typed data interface and corresponding Zod schema in `src/types/output.ts`:
- `InitData` / `InitDataSchema`
- `SyncData` / `SyncDataSchema`
- `DoctorData` / `DoctorDataSchema`
- `CleanData` / `CleanDataSchema`
- `ConfigAddData` / `ConfigAddDataSchema`
- `ConfigRmData` / `ConfigRmDataSchema`
- `ConfigLsData` / `ConfigLsDataSchema`
- `ConfigShowData` / `ConfigShowDataSchema`
- **Verify**: All types and schemas exist in `src/types/output.ts`.

### REQ-OUT-07: Operation receipts for sync
`SyncData` includes `details: SyncToolDetail[]` with per-tool file lists (skills, commands, agents, mcp server names).
- **Verify**: `SyncToolDetail` interface in `src/types/output.ts` has `skills: string[]`, `commands: string[]`, `agents: string[]`, `mcp: string[]`.

### REQ-OUT-08: stdout purity
In `--json` mode, stdout contains exactly one JSON object. No ANSI escapes, no emoji, no extra lines.
- **Verify**: Contract tests in `tests/` validate JSON-only stdout.

---

## 3. Config Format

### REQ-CFG-01: TOML only, no legacy fallback
Only `.agents/agentsync.toml` is supported as project config. No `.agentsync/config.json` fallback. No `.agentsync/` directory detection anywhere.
- **Verify**: No `.agentsync` string in `src/core/config/discovery.ts`. No JSON fallback in `src/config/load-project-config.ts`. Doctor only checks TOML path.

### REQ-CFG-02: v1 config shape
```toml
tools = ["claude", "opencode", "codex"]
extends = ["github:company/standards"]
[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
```
No `version` or `source_dir` fields. `tools` is a flat list. `[mcp.*]` defined = enabled. `extends` is flat strings.
- **Verify**: `AgentSyncConfigSchema` in `src/types/schemas.ts` matches this shape.

### REQ-CFG-03: N-layer hierarchy discovery
Config discovery walks CWD to git root, collecting every `.agents/agentsync.toml`. Merge rules: `tools` — deepest wins; `mcp` — per-key merge; `extends` — accumulated.
- **Verify**: `loadConfigHierarchy` in `src/core/config/discovery.ts`. Merge logic in `src/core/config/merge.ts`.

### REQ-CFG-04: Profile overlay
Profiles defined in `[profiles.*]` TOML section. Selection: `--profile` flag > `AGENTSYNC_PROFILE` env > `env` field match > `paths` glob match. Profile values replace base values — `tools`, `mcp`, `extends` all replace (not filter). Flat profiles only, no inheritance.
- **Verify**: `src/core/config/profiles.ts` implements selection priority and filter semantics.

### REQ-CFG-05: MCP defined = enabled
Any server in `[mcp.*]` is active. No separate enable/disable. Per-key override (local > project > global).
- **Verify**: No `mcp_enabled` field in schemas. MCP merge is per-key in `src/core/config/merge.ts`.

### REQ-CFG-06: Local overrides
`agentsync.local.toml` (gitignored) for personal project MCP overrides.
- **Verify**: Local config loading in `src/config/`.

### REQ-CFG-07: Hierarchical accumulation model
All entities accumulate through the full hierarchy, like AGENTS.md in Claude Code:

```
~/.agents/                                    # Global user
  config.toml, skills/, commands/, agents/
/monorepo/.agents/                            # Org root
  agentsync.toml, skills/, commands/, agents/
/monorepo/team/.agents/                       # Team
  agentsync.toml, skills/, commands/, agents/
/monorepo/team/svc/.agents/                   # Service (CWD)
  agentsync.toml, skills/, commands/, agents/
agentsync.local.toml                          # Local override
```

**Everything accumulates:**
- **Skills/commands/agents**: All levels accumulate. Same-name: most-specific wins (CWD > team > org > global).
- **MCP**: Per-key, most-specific wins (local > CWD > team > org > global).
- **Tools**: Most-specific (deepest) wins entirely (replaces parent).
- **Extends**: Accumulated across all levels.

This mirrors how AGENTS.md works — every parent directory's content applies, with the most specific taking priority on conflicts.
- **Verify**: `buildSyncPlan()` walks `config._sources.chain` to discover content dirs from all hierarchy levels. `~/.agents/` is the outermost layer. CWD's `.agents/` is excluded (synced as project content at highest priority).

### REQ-CFG-08: No .agentsync directory
The `.agentsync/` directory path does not appear anywhere in source code (except as substring of tool/package name). No project fallback, no global dir, no preset metadata at `.agentsync/`.
- **Verify**: `grep -rn '\.agentsync/' src/` returns zero results (excluding URL strings like `docs.agentsync.dev`).
- **Status**: PLANNED — cleanup not yet done.

---

## 4. Sync Engine

### REQ-SYNC-01: Plan/execute pattern
Sync is split into `buildSyncPlan()` (pure data, no side effects) and `executeSyncPlan()` (file I/O).
- **Verify**: `src/sync/plan.ts` exports `buildSyncPlan()`. `src/sync/execute.ts` exports `executeSyncPlan()`.

### REQ-SYNC-02: Copy default with --link override
`sync` copies files by default (`--copy`). `--link` flag creates symlinks instead. Per-tool sync mode via `ToolProvider.syncMode` is a future enhancement.
- **Verify**: Default sync mode in `src/sync/execute.ts` is `copy`. `--link` and `--copy` flags registered in `src/cli.ts`.

### REQ-SYNC-03: No bootstrap module
`src/bootstrap/` does not exist. No bootstrap templates, no bootstrap file generation, no bootstrap checks in doctor.
- **Verify**: Directory `src/bootstrap/` does not exist. No imports from `bootstrap` in any source file. No `bootstrapFile` or `bootstrapExists` in types.

### REQ-SYNC-04: Namespace isolation
Preset content uses `--` separator in flat outputs (e.g., `company--typescript.md`). Nested directory tools use `namespace/filename`. Namespace collision is a hard error.
- **Verify**: Namespace separator is `--` in sync modules under `src/sync/`.

### REQ-SYNC-05: Preset content flows through sync
`extends` entries resolve and sync skills, commands, and agents to holdout tools. Not hardcoded to `undefined`.
- **Verify**: `src/sync/` or `src/commands/sync.ts` resolves presets via registry and passes content to sync functions.

### REQ-SYNC-06: Content sanitization
Preset content passes through `sanitizeContent()` before writing to tool directories. Strips null bytes, control chars, ANSI escapes, dangerous Unicode.
- **Verify**: `src/utils/sanitize.ts` exports `sanitizeContent()`. Called in sync path and/or preset loader.

### REQ-SYNC-07: Gitignore per tool mode
`sync` updates `.gitignore` only for tools using copy mode. Symlinked tool outputs don't need gitignoring. No standalone `gitignore` command.
- **Verify**: Gitignore logic checks per-tool sync mode in `src/sync/execute.ts`. No `gitignore` command in `src/cli.ts`.

### REQ-SYNC-08: Dry-run enumerates plan
`sync --dry-run` resolves presets and builds the full plan, but writes no files. Returns planned changes in output.
- **Verify**: Dry-run path calls `buildSyncPlan()` but skips `executeSyncPlan()`. Output includes tool/file details.

### REQ-SYNC-09: No preset cache
GitHub presets are cloned to a temp directory on every sync. No persistent cache. No `--pull` flag.
- **Verify**: `src/core/registry/cache-manager.ts` does not exist. No `--pull` option in `src/cli.ts`. `GitHubResolver` clones to temp dir.
- **Status**: PLANNED — cache system not yet deleted.

### REQ-SYNC-10: Global content accumulates
`buildSyncPlan()` discovers `~/.agents/skills/`, `~/.agents/commands/`, `~/.agents/agents/` and includes them as content sources. Global content accumulates with project content. Project wins on name collision.
- **Verify**: `src/sync/plan.ts` reads global content dirs. Global skills appear in sync output.

---

## 5. Tool Support

### REQ-TOOL-01: 19 supported tools
Supported tools: cursor, claude, cline, roocode, opencode, codex, gemini, copilot, amp, goose, aider, amazonq, augment, kiro, openhands, junie, crush, kilocode, qwen.
- **Verify**: `SUPPORTED_TOOLS` constant in `src/constants.ts` or `src/types/` contains exactly 19 entries.

### REQ-TOOL-02: Validated CLI vs optional adapter distinction
Validated CLI tools are maintainer-validated beta targets. Optional adapters remain supported only when users explicitly configure them.
- **Verify**: `VALIDATED_CLI_TOOLS` contains supported tools. `OPTIONAL_ADAPTER_TOOLS` contains supported tools outside that validated target set.

### REQ-TOOL-03: No codec system
No bidirectional codec system. No `src/targets/tools/*-codec.ts` files. No `src/targets/codec-registry.ts`.
- **Verify**: `src/targets/tools/` contains no `*-codec.ts` files. No `codec-registry.ts`.

### REQ-TOOL-04: Tool definitions in src/tools/
Each tool has a provider definition with paths, MCP format, and capabilities.
- **Verify**: `src/tools/` directory contains tool provider files or a registry.

---

## 6. Error System

### REQ-ERR-01: Flat error hierarchy
`AgentSyncError` base class with flat properties (`code`, `suggestion`, `category`). No `ErrorMetadata` wrapper object.
- **Verify**: `AgentSyncError` in `src/core/errors.ts` has direct properties, not a metadata object.

### REQ-ERR-02: Exactly 8 error classes
Active error classes: `AgentSyncError`, `ValidationError`, `FileSystemError`, `ConfigError`, `ParseError`, `SyncError`, `SourceResolutionError`, `SelectiveLoadingError`.
- **Verify**: `src/core/errors.ts` exports exactly these classes. No `PermissionError`, `InteractiveSelectionError`, `SelectionValidationError`, `UserPresetRegistryError`.

### REQ-ERR-03: Every error has suggestion
All thrown errors include a `suggestion` field with the recovery command or guidance.
- **Verify**: All `throw new *Error()` calls in `src/` include `suggestion` in metadata/properties.

### REQ-ERR-04: No deleted error utilities
None of these exist: `isErrorType()`, `getRootCause()`, `formatError()`, `serializeError()`, `ErrorHandler` namespace, `ErrorSeverity` enum.
- **Verify**: `grep -n 'isErrorType\|getRootCause\|formatError\|serializeError\|ErrorHandler\|ErrorSeverity' src/core/errors.ts` returns nothing.

### REQ-ERR-05: wrapError() standalone
`wrapError()` exists as a standalone function (not inside a namespace).
- **Verify**: `src/core/errors.ts` exports `wrapError` as a function.

---

## 7. Doctor Command

### REQ-DOC-01: Decomposed into modules
Doctor is split into check functions and render functions:
```
src/commands/doctor/
  index.ts    — orchestration + exports
  checks.ts   — diagnostic check functions
  render.ts   — human-readable output formatting
  types.ts    — DoctorResult + per-check types
```
- **Verify**: All four files exist under `src/commands/doctor/`.

### REQ-DOC-02: DoctorResult type (no bootstrap fields)
```typescript
interface DoctorResult {
  config: { found: boolean; valid: boolean; error?: string };
  tools: Array<{ name: string }>;
  skills: { count: number; synced: boolean };
  mcp: Array<{ name: string; configured: boolean; envResolved: boolean; missingEnvVars: string[]; hasEnvRefs: boolean; severity: string }>;
  presets: Array<{ source: string; reachable: boolean }>;
  drift: Array<{ tool: string; status: "stale" | "missing" | "ok" }>;
}
```
No `bootstrapFile`, `bootstrapExists`, or `cached` fields. Presets use `valid: boolean`.
- **Verify**: `DoctorResult` in `src/commands/doctor/types.ts`. No `bootstrap` or `cached` string in the file.

### REQ-DOC-03: Drift detection
Doctor compares config mtime vs holdout tool output directory mtimes. Reports stale/missing/ok.
- **Verify**: `checkDrift()` or equivalent in `src/commands/doctor/checks.ts`.

### REQ-DOC-04: MCP env var checking with severity
Doctor checks `{TOKEN_NAME}` patterns in MCP env values. Missing env vars are `severity: "critical"`.
- **Verify**: `src/commands/doctor/checks.ts` extracts token refs and checks `process.env`.

### REQ-DOC-05: hasFailures() for CI exit codes
`hasFailures(result)` returns true for missing/invalid config, critical MCP issues, or stale drift.
- **Verify**: `hasFailures` exported from `src/commands/doctor/checks.ts` or `index.ts`.

---

## 8. Preset System

### REQ-PRE-01: GitHub and filesystem sources
Presets support `github:org/repo[@ref]` and `fs:./path` (plus bare paths).
- **Verify**: Source resolution in `src/core/registry/` handles both types.

### REQ-PRE-02: Namespace derivation
Namespace auto-derived from source (e.g., `github:acme/standards` -> `acme-standards`). Collision is a hard error.
- **Verify**: Namespace derivation logic in registry. Collision detection throws.

### REQ-PRE-03: Extends dedup (last-occurrence-wins)
Duplicate entries in `extends` are deduplicated — last occurrence wins.
- **Verify**: `normalizeExtends()` or equivalent function.

### REQ-PRE-04: No transitive extends
Presets cannot extend other presets in v1.
- **Verify**: Transitive extends warning in sync or registry code.

### REQ-PRE-05: Profile extends is allowlist
When a profile specifies `extends`, it filters (intersects) the base config extends, not replaces.
- **Verify**: Profile apply logic in `src/core/config/profiles.ts` uses filter semantics for extends.

### REQ-PRE-06: Individual preset failure is non-fatal
A single unreachable preset logs a warning and continues. Other presets and local content sync normally.
- **Verify**: Per-preset try/catch in sync or registry code.

---

## 9. Data Validation

### REQ-VAL-01: Always readJsonValidated() with Zod
No plain `readJson()`, `JSON.parse()` with type assertions, or `as` casts for JSON data. Always `readJsonValidated()` with a Zod schema.
- **Verify**: `readJson` is not exported from `src/utils/fs.ts` (only `readJsonValidated`). No `as Record<string, unknown>` or `as T` after `JSON.parse()` in `src/`.

### REQ-VAL-02: No `any` type
Use `unknown` instead of `any` throughout `src/`.
- **Verify**: `grep -rn ': any' src/` returns zero results (excluding type definition files that must use `any` for external API compatibility).

---

## 10. Architecture

### REQ-ARCH-01: No bootstrap directory
`src/bootstrap/` does not exist. No references to bootstrap in source, tests, or docs.
- **Verify**: Directory does not exist. `grep -rn bootstrap src/ tests/ docs/ AGENTS.md` returns nothing.

### REQ-ARCH-02: No codec files
No `*-codec.ts` files in `src/targets/tools/`. No `codec-registry.ts`.
- **Verify**: `find src/targets -name '*codec*'` returns nothing.

### REQ-ARCH-03: Registry wired into sync
`RegistryOrchestrator` (or its pipeline) is called by the sync engine, not bypassed with inline globbing.
- **Verify**: `src/sync/plan.ts` or `src/commands/sync.ts` imports from `src/core/registry/`.

### REQ-ARCH-04: Project structure matches AGENTS.md
`src/` directory structure matches the tree documented in `AGENTS.md`.
- **Verify**: Compare `ls -R src/` against the structure section in `AGENTS.md`.

### REQ-ARCH-05: Conventional commits
Commit messages follow `type(scope): summary`. Types: feat|fix|docs|chore|test|refactor.
- **Verify**: `git log --oneline -20` shows conventional commit format.

---

## 11. Testing

### REQ-TEST-01: All tests pass
`pnpm lint && pnpm test` exits 0.
- **Verify**: Run `pnpm lint && pnpm test`.

### REQ-TEST-02: No bootstrap tests
No test files reference bootstrap.
- **Verify**: `grep -rn bootstrap tests/` returns nothing. No `tests/unit/bootstrap/` directory.

### REQ-TEST-03: Contract tests exist
Output purity and exit code contract tests exist.
- **Verify**: Test files in `tests/` validate `CliResult` envelope and exit codes.

### REQ-TEST-04: Sync receipt tests
Tests verify `SyncToolDetail` per-tool file lists and aggregate count consistency.
- **Verify**: Test file validates `details` array in sync output.

---

## 12. Sync Mode

### REQ-SYM-01: Global --link and --copy flags
`--copy` is the default. `--link` creates symlinks (auto-falls back to copy on failure). Both flags on `sync` command.
- **Verify**: `--link` and `--copy` registered in `src/cli.ts`. Default is copy in `src/sync/execute.ts`.

### REQ-SYM-02: Per-tool sync mode (future)
Each tool provider will declare its preferred sync mode. Users will override via `[tool_options.<tool>]`. Not in v1.
- **Status**: DEFERRED.

### REQ-SYM-03: Same-file skip for native tools
When source and dest resolve to the same path (tools that read `.agents/` directly), sync skips instead of creating a self-referencing symlink or pointless copy.
- **Verify**: `path.resolve(sourcePath) === path.resolve(destPath)` check in `src/sync/skills.ts`, `commands.ts`, `agents.ts`.

### REQ-SYM-04: Generated header on copies
Files written in copy mode get a header comment: `<!-- Generated by AgentSync from .agents/skills/foo — DO NOT EDIT -->`. Symlinked files do not get headers.
- **Verify**: `src/sync/header.ts` exports `generateHeader()`. Copy paths in skills.ts, commands.ts, agents.ts prepend it.

### REQ-SYM-05: Gitignore conditional on mode
Gitignore update only runs in copy mode. Symlinked outputs don't need gitignoring.
- **Verify**: Gitignore update inside `if (syncMode === "copy")` in `src/sync/execute.ts`.

### REQ-SYM-06: Doctor content-hash drift detection
Sync writes `.agents/.sync-manifest.json` with SHA-256 hashes. Doctor compares current file hashes against manifest to detect direct edits. Reports as warning (not CI failure — agents may intentionally modify copies).
- **Verify**: `src/sync/manifest.ts` exports `writeManifest()`/`readManifest()`. `src/commands/doctor/checks.ts` has `checkContentDrift()`. `contentDrift` field in `DoctorResult`.

### REQ-SYM-07: Git hook installation
`agentsync init` installs a `post-merge` git hook that runs `npx agentsync sync --quiet 2>/dev/null || true`. Idempotent — appends to existing hooks, skips if already present.
- **Verify**: `src/commands/init.ts` has `installGitHook()` method. Hook uses `# AgentSync:` marker for detection.

---

## 13. Directory Cleanup

### REQ-DIR-01: No .agentsync/ directory
The `.agentsync/` path does not appear in source code as a config or data directory. Only appears as substring in package/tool name (e.g., `docs.agentsync.dev`).
- **Verify**: `grep -rn '\.agentsync/' src/` returns only URL strings, not directory paths.
- **Status**: PLANNED.

### REQ-DIR-02: No preset cache
No persistent cache directory. GitHub presets clone to temp dir, used, discarded. No `CacheManager` class. No `--pull` flag.
- **Verify**: `src/core/registry/cache-manager.ts` does not exist. No `--pull` in `src/cli.ts`.
- **Status**: PLANNED.

### REQ-DIR-03: No dead global infrastructure
No `UserPresetRegistry`, no global MCP registry file, no unused global config functions.
- **Verify**: `src/core/registry/user-preset-registry.ts` does not exist. `src/core/mcp/registry.ts` does not exist. `global-config.ts` only has `getGlobalConfigDir()`, `getGlobalConfigPath()`, and `loadGlobalConfig()`.
- **Status**: DONE.

### REQ-DIR-04: Global dir is ~/.agents/
Global user config at `~/.agents/config.toml`. Global content at `~/.agents/skills/`, `~/.agents/commands/`, `~/.agents/agents/`.
- **Verify**: All global paths in `src/` reference `".agents"` not `".agentsync"`. `getGlobalConfigPath()` returns `config.toml`.
- **Status**: DONE.

---

## 14. Code Quality (Added 2026-04-01)

### REQ-QUAL-01: No legacy TOML format support
The `[agents.*]` block format is removed. Only `tools = [...]` flat list is supported. No legacy branch in TOML loader.
- **Verify**: `mapTools()` in `src/config/toml-loader.ts` returns `toml.tools?.filter(isToolName)` with no agents fallback.

### REQ-QUAL-02: No dead code in core modules
`PresetLoader`, `Merger`, `SelectiveLoadingError` classes are deleted. No `*-codec.ts` files. No `cache-manager.ts`.
- **Verify**: `src/core/registry/preset-loader.ts`, `src/core/registry/merger.ts` do not exist. `SelectiveLoadingError` not in `src/core/errors.ts`.

### REQ-QUAL-03: Shared sync helpers (no triplication)
`writeFileByMode()` is defined once in `src/sync/write-file.ts` and imported by skills, commands, and agents sync modules. Not duplicated.
- **Verify**: `grep -rn 'writeFileByMode\|function writeFile' src/sync/skills.ts src/sync/commands.ts src/sync/agents.ts` shows only imports, no local definitions.

### REQ-QUAL-04: Shared MCP write helpers
`writeMcpJson()` and `mergeIntoSettings()` are defined once in `src/tools/mcp-helpers.ts`. All tool files use these helpers instead of inlining JSON write logic.
- **Verify**: `src/tools/mcp-helpers.ts` exists. Tool files import from it.

### REQ-QUAL-05: Shared config command utilities
`VALID_TYPES`, `escapeRegex()`, `resolveConfigPath()` are defined once in `src/commands/config/shared.ts`. Both `add.ts` and `rm.ts` import from it.
- **Verify**: No duplicate definitions in `src/commands/config/add.ts` or `rm.ts`.

### REQ-QUAL-06: No redundant ensureDir before outputFile
`outputFile()` in `src/utils/fs.ts` creates parent directories. Tool files do not call `ensureDir` before `outputFile`.
- **Verify**: `grep -B1 'outputFile' src/tools/*.ts` shows no preceding `ensureDir` calls.

### REQ-QUAL-07: Global config is TOML
Global user config is at `~/.agents/config.toml` (TOML format), not `config.json`. No JSON fallback in `loadGlobalConfig()` or `parseConfigFile()`.
- **Verify**: `src/utils/global-config.ts` references `config.toml`. No `JSON.parse` in `src/core/config/hierarchy.ts:parseConfigFile`.

### REQ-QUAL-08: TOML writer uses v1 extends format
`writeProjectConfig()` serializes `extends` as top-level `extends = [...]`, not legacy `[[agentsync.presets]]`.
- **Verify**: `src/config/load-project-config.ts` does not contain `agentsync.presets`.

### REQ-QUAL-09: Independent I/O operations parallelized
These independent operations use `Promise.all` instead of sequential awaits:
- Sync phases: skills, commands, agents (`src/sync/execute.ts`)
- Doctor checks: skills, presets, drift, contentDrift (`src/commands/doctor/checks.ts`)
- Tool cleaning (`src/commands/clean.ts`)
- Config hierarchy parsing (`src/core/config/hierarchy.ts`)
- **Verify**: `grep 'Promise.all' src/sync/execute.ts src/commands/doctor/checks.ts src/commands/clean.ts src/core/config/hierarchy.ts` returns matches.

### REQ-QUAL-10: No `as` type assertions for tool names
`ToolName[]` is constructed via `.filter((t): t is ToolName => SUPPORTED_TOOLS.includes(...))`, not via `as ToolName[]` casts.
- **Verify**: `grep 'as ToolName' src/core/config/profiles.ts src/core/config/merge.ts` returns no results.

---

## 15. Unspecified Behaviors (Known Gaps)

These features are implemented but not yet formally specified. Future spec revisions should add requirements for:

1. **Content sanitization details** — Specific ANSI/control/Unicode ranges stripped, 100KB max length, truncation warnings, separate `sanitizeMcpConfig()` pass.
2. **Frontmatter handling** — YAML parsing, auto-generation for skills/commands, validation of required `description` field.
3. **MCP token substitution format** — `{UPPERCASE_VAR}` pattern, behavior on missing vs empty env vars, recursive substitution in env/headers.
4. **Init command behavior** — Template selection (default, typescript-react, python-fastapi), AGENTS.md creation, gitignore updates, idempotent re-initialization.
5. **Clean command scope** — Per-tool path removal, holdout vs native distinction, dry-run enumeration.
6. **Config add/rm for skills and commands** — File structure (`.agents/skills/<name>/SKILL.md`), frontmatter auto-generation, directory vs file removal.
7. **Monorepo subtree detection** — `findAgentsSubtrees()`, `filterChangedSubtrees()`, SKIP_DIRS set (`node_modules`, `dist`, `.next`, etc.).
8. **Sync manifest format** — `.agents/.sync-manifest.json` path, `sha256:<hex>` hash format, corruption fallback.
9. **Namespace collision error messages** — Versioned collision detection, recovery suggestion text.

---

## Verification Summary

Requirements marked **PLANNED** are design decisions approved but not yet implemented. An LLM reviewer should:
1. Verify all non-PLANNED requirements against current code
2. Flag any non-PLANNED requirement that fails verification
3. Note PLANNED requirements as known gaps (not failures)
4. Run `pnpm lint && pnpm test` as the final gate
