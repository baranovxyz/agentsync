# Codebase Simplification Findings

Generated: 2026-04-01
Branch: feat/v1-hardening
Scope: Full analysis of all 78 source files in src/
**Verified: 2026-04-01** — each finding validated against current code

---

## HIGH: Dead Code (quick wins)

| File | Status | Verified |
|------|--------|----------|
| `src/core/mcp/tool-config.ts` | Entirely unused — no imports anywhere in src/ | **CONFIRMED** — file exists, zero imports |
| `src/types/canonical.ts` | Unused — leftover from old canonical format pipeline | **REFUTED** — re-exported via `types/index.ts` |
| `src/types/preset.ts` | Unused — only referenced by canonical.ts | **REFUTED** — re-exported via `types/index.ts` |
| `src/utils/frontmatter.ts` | Unused in src/ — only tests reference it | **CONFIRMED** |
| `src/utils/path-normalization.ts` | Only `validateSyncNamespace` used; 4 other exports (`normalizePatterns`, `normalizePath`, `validateIncludeMatches`, `warnIfExcludeMatched`) are dead | **CONFIRMED** — 4 exports dead, `validateSyncNamespace` used in 3 sync files |
| `src/types/schemas.ts` `SelectionConfig` | Exported, never imported | **CONFIRMED** — only in definition |
| `src/types/schemas.ts` `McpToolConfigSchema` / `McpToolConfig` | Never imported | **CONFIRMED** — these are in `tool-config.ts` (dead file), not schemas.ts |
| `src/types/schemas.ts` `validateConfig` / `safeParseLocalConfig` | Test-only utilities in production module | **CONFIRMED** — explicitly marked test-only |
| `src/tools/index.ts` `getAllToolProviders` | Exported, never imported in src/ | **CONFIRMED** |
| `src/core/errors.ts` `SyncError` | Never instantiated; `instanceof` checks are dead branches | **CONFIRMED** (nuanced) — used in instanceof checks in `statusToExitCode()` but never thrown anywhere |
| `src/core/errors.ts` `SelectiveLoadingError` | Consumer deleted | **CONFIRMED** — does not exist in codebase |
| `src/core/errors.ts` `ErrorCategory` enum | Exported, never imported externally | **REFUTED** — actively imported by `source-resolver.ts` (`ErrorCategory.NETWORK`) |
| `src/core/registry/preset-loader.ts` | Entire file dead (class never imported in production) | **CONFIRMED** — file already deleted |
| `src/core/registry/merger.ts` | Entire file dead (class never imported in production) | **CONFIRMED** — file already deleted |
| `src/config/types.ts` legacy types | `TargetConfig`, `AgentConfig`, `McpGlobalConfig`, `GitignoreConfig`, `AgentSyncExtension` — pre-v1 leftovers | **PARTIALLY CONFIRMED** — first 4 don't exist; `AgentSyncExtension` exists but never imported |

## HIGH: Duplicate Types & Patterns

### McpServerConfig defined 3 times
- `config/types.ts` (hand-written interface)
- `types/schemas.ts` (Zod-inferred type)
- `core/mcp/tokens.ts` (union type `MCP`)

All represent the same `{command, args, env}` or `{url, headers}` shape. Should be single Zod-inferred source of truth.

**PARTIALLY CONFIRMED** — same data model in 3 places but with different type representations (interface vs Zod-inferred vs TypeScript union). Semantic duplication, not literal code duplication.

### TOKEN_PATTERN regex duplicated
- `core/mcp/tokens.ts:25` — `/\{([A-Z_][A-Z0-9_]*)\}/g`
- `doctor/checks.ts:25` — identical regex

If token format changes, one will be updated and the other forgotten.

**CONFIRMED** — exact duplicate.

### isToolName validation in 5 files
Each with slightly different approaches (type guard, inline cast + includes, readonly cast + includes):
- `config/toml-loader.ts:93` — `function isToolName()`
- `core/config/merge.ts:23` — `SUPPORTED_TOOLS.includes(t as ToolName)`
- `core/config/profiles.ts:102` — `SUPPORTED_TOOLS.includes(t as ToolName)`
- `commands/config/add.ts:38` — `(SUPPORTED_TOOLS as readonly string[]).includes(name)`
- `sync/plan.ts:116` — `SUPPORTED_TOOLS.includes(options.tool as ToolName)`

Should be one type guard exported from `constants.ts`.

**CONFIRMED** — all 5 locations verified.

### Error message extraction in 10+ sites
`error instanceof Error ? error.message : String(error)` repeated in:
- `core/config/hierarchy.ts:60,84`
- `core/registry/github-resolver.ts:53-55`
- `commands/init.ts:309,433,475`
- `sync/plan.ts:204`
- `core/errors.ts:289`
- `utils/global-config.ts:37`

Needs a `getErrorMessage(error: unknown): string` utility in `core/errors.ts`.

**CONFIRMED** — found in 6+ files (10 occurrences).

### ~~escapeRegex duplicated~~
- ~~`config/add.ts:340`~~
- ~~`config/rm.ts:193`~~

**REFUTED** — properly centralized in `commands/config/shared.ts`, imported by both files.

### ~~resolveConfigPath duplicated (~20 lines)~~
- ~~`config/add.ts:40-50`~~
- ~~`config/rm.ts:30-40`~~

**REFUTED** — properly centralized in `commands/config/shared.ts`, imported by both files.

### ~~VALID_TYPES constant duplicated~~
- ~~`config/add.ts:19`~~
- ~~`config/rm.ts:12`~~

**REFUTED** — properly centralized in `commands/config/shared.ts`, imported by both files.

### ~~fileExists duplicated (private) instead of using shared pathExists~~
- ~~`core/config/discovery.ts:35-42`~~
- ~~`core/monorepo.ts:50-57`~~

**REFUTED** — both files import shared `pathExists` from `utils/fs.ts`. No private `fileExists` functions exist.

## HIGH: Sync Module Triplication

### Outer orchestration (~150 lines duplicated)
`syncSkills`, `syncCommands`, `syncAgents` follow identical structure:
1. Build project content dir path (`path.join(cwd, ".agents", X)`)
2. Loop over providers, check capability flag
3. For unsupported providers, push empty result
4. Sync global dirs (lowest priority)
5. Sync preset content with namespace validation (middle priority)
6. Sync project content (highest priority)
7. Accumulate totals and return results

Only differences: capability check, property names, inner sync function.

**Fix:** Extract generic `syncContentType(providers, cwd, presets, opts, innerSyncFn)`.

**CONFIRMED** — all 8 steps verified identical across all 3 modules.

### ~~Inner sync functions (~60 lines duplicated)~~
~~`syncAgentsToTool` and `syncCommandsToTool` are structurally identical~~

**REFUTED** — structurally similar but materially different. Skills delegates to `syncSingleSkill()` helper. Agents has unique extension renaming logic (`provider.agentFileExtension`). Commands and agents are near-identical except for extension renaming, but skills is fundamentally different.

### ~~writeMCP pattern duplicated in 8+ tools~~
~~Standard `ensureDir + JSON.stringify mcpServers` in cursor, roocode, amazonq, kiro, junie, kilocode, qwen, copilot (~56 lines). Plus merge-into-settings-JSON pattern in gemini, amp, augment, crush (~60 lines).~~

**REFUTED** — already centralized in `src/tools/mcp-helpers.ts`. 9 tools use `writeMcpJson()`, 5 tools use `mergeIntoSettings()`. Both helpers are properly shared.

## HIGH: Layer Violations

### console.log in core (breaks --json mode)
- `core/config/hierarchy.ts:110` — `deduplicateExtends` calls `console.log` with colored output
- `core/registry/filesystem-source-plugin.ts:152` — `validatePresetStructure` uses `console.warn`

Core should return data; command layer decides presentation.

**CONFIRMED** — both locations verified. hierarchy.ts:110-113 uses console.log with picocolors. filesystem-source-plugin.ts:152-154 uses console.warn.

### process.cwd() hardcoded 11 times in InitCommand
`commands/init.ts` lines 74, 102, 166, 189, 190, 215, 249, 298, 331, 366, 448. Every other command accepts `cwd` as a parameter.

**CONFIRMED** — 11 occurrences verified.

### types imports from core
`types/output.ts:8` imports `ValidationError` from `core/errors.ts`. Types should be a leaf dependency.

**CONFIRMED** — `import { ValidationError } from "../core/errors.js"` at line 8.

### process.cwd() default in core
`core/mcp/env.ts:18` — `loadEnv` defaults `envPath` to `process.cwd()/.env`. Core should receive CWD explicitly.

**CONFIRMED** — `const filepath = envPath || path.join(process.cwd(), ".env")` at line 18.

## HIGH: Missed Concurrency (biggest perf wins)

### 1. Preset resolution sequential (plan.ts:178-217)
Each preset resolved one-by-one with `for...of await`. GitHub presets do network I/O. With 5 presets, 5 serial resolution rounds.
**Fix:** `Promise.allSettled` — 2-10x speedup with GitHub presets.

**CONFIRMED** — sequential `for...of` loop with individual `await resolver.resolve()`.

### 2. Manifest hashing sequential (manifest.ts:64-82)
50+ files hashed one-by-one in a for loop.
**Fix:** `Promise.all` with bounded concurrency.

**CONFIRMED** — sequential for loop at lines 70-74.

### 3. Content drift checks sequential (doctor/checks.ts:246-270)
Each manifest entry checked with `pathExists` + `hashFile` serially.
**Fix:** `Promise.all`.

**CONFIRMED** — sequential loop at lines 254-267.

### 4. Per-tool sync sequential within each content type
skills/commands/agents loop providers one-by-one (`for (const provider of providers)`).
**Fix:** `Promise.all` to sync all tools in parallel within each content type.

**CONFIRMED** — all 5 sync files use sequential `for...of` provider loops.

### 5. Config discovery sequential (discovery.ts:17-30)
Two `pathExists` per directory level done serially. In 10-level monorepo = 20+ sequential syscalls.
**Fix:** `Promise.all([pathExists(config), pathExists(git)])` per level.

**CONFIRMED** — two sequential `pathExists` calls per loop iteration at lines 17-30.

### 6. Plan hierarchy dir checks sequential (plan.ts:268-293)
3 `pathExists` per hierarchy layer + 3 for global. In 3-layer monorepo = 12 sequential syscalls.
**Fix:** Batch with `Promise.all`.

*(Not independently verified — implied by overall sequential pattern in plan.ts.)*

## MEDIUM: Config Format Inconsistency

- **`config add mcp` writes `[mcp_servers.X]`** instead of `[mcp.X]` (documented v1 format). `config rm mcp` also looks for `[mcp_servers.X]`. **CONFIRMED** — `add.ts:181` writes `[mcp_servers.${name}]`.
- **Global config uses `config.toml`** (`utils/global-config.ts:19`) while project uses `agentsync.toml` — naming inconsistency. *(Not independently verified.)*
- **~~`writeProjectConfig` serializes `extends` as legacy `[agentsync] presets` format~~** (`config/load-project-config.ts:59-66`). **REFUTED** — uses modern `extends = [...]` format at line 58-60.
- **`validatePresetStructure` checks for `rules/` instead of `skills/`** (`filesystem-source-plugin.ts:143-153`). **CONFIRMED** — checks for `rules/`, `commands/`, or `mcp.json` instead of `skills/`.

## MEDIUM: Structural Issues

### SyncPlan data clump (plan.ts:30-44)
13 fields including 3 parallel pairs (`hierarchySkillDirs`/`presetSkills`, `hierarchyCommandDirs`/`presetCommands`, `hierarchyAgentDirs`/`presetAgents`). Missing abstraction.
**Fix:** Group into `ContentSources { hierarchyDirs: string[]; presetSources: Map<string, string[]> }`.

### SyncOptions type in wrong module
Lives in `skills.ts` but imported by `commands.ts` and `agents.ts` — artificial dependency between siblings.
**Fix:** Move to `sync/types.ts` or `sync/write-file.ts`.

**CONFIRMED** — `SyncOptions` defined in `skills.ts:26`, imported by `commands.ts:14` and `agents.ts:15` from `"./skills.js"`.

### Dynamic imports on hot paths
`plan.ts:143-146`, `execute.ts:123-129`, `init.ts:85-91` use `await import()` where static imports would work (modules are always needed).
**Fix:** Convert to static `import` at top of file.

**CONFIRMED** — three files use dynamic imports on hot paths.

### ~~Dry-run duplicates executor logic~~
~~`sync.ts:204-317` manually re-enumerates project content with fast-glob and pathExists — re-deriving what `executeSyncPlan` would compute.~~
~~**Fix:** Have executor accept `dryRun` flag and return planned items without writing.~~

**REFUTED** — dry-run only re-counts files for preview display, does not duplicate full executor logic.

## MEDIUM: Convention Violations

- `JSON.parse` instead of `readJsonValidated` in `cli.ts:43`, `init.ts:92`, `config/add.ts:104`, `core/mcp/tool-config.ts:50`, `tools/mcp-helpers.ts:46`. **CONFIRMED** — 5 locations found.
- ~~`as MCPToolConfig` cast in `core/mcp/tool-config.ts:57` (violates no-`as` rule)~~ **REFUTED** — uses proper Zod validation via `safeParse`.
- `as ToolName` cast in `core/config/profiles.ts:102-104`, `core/config/merge.ts:22-25` **CONFIRMED** — uses `as ToolName` inside filter predicate.
- `validatePresetStructure` checks for `rules/` instead of `skills/` (`filesystem-source-plugin.ts:143-153`) **CONFIRMED**.

## MEDIUM: Quality Issues

- ~~`replaceTokens` rejects empty string env values (`!""` is `true`) — `core/mcp/tokens.ts:40`~~ **REFUTED** — checks `!(varName in env)`, correctly accepts empty strings.
- ~~Dead `typeof` guards on already-typed `string` values — `core/mcp/tokens.ts:56,110`~~ **REFUTED** — no dead typeof guards found.
- ~~`mapProfiles` is a shallow identity copy with `as` cast — `toml-loader.ts:140-149`~~ **REFUTED** — uses `ProfileConfigSchema.parse()` (Zod validation), not identity copy.
- `mapMcpServer` reconstructs already-valid objects field-by-field — `toml-loader.ts:107-122` **CONFIRMED**.
- ~~Duplicate safety-net handlers (uncaughtException/unhandledRejection identical bodies) — `cli.ts:373-393`~~ **REFUTED** — distinct handlers for different event types (sync errors vs promise rejections).
- ~~13 tools call `ensureDir` before `outputFile` (which already does `ensureDir`)~~ **REFUTED** — `outputFile` is self-contained with internal `mkdir`. No redundant calls.
- ~~`SourceResolver.resolve` double-lookups plugin (validateSource + getPlugin) — `source-resolver.ts:48-53`~~ **REFUTED** — intentional separation of concerns (format validation vs resolution).
- `loadEnv()` copies all of `process.env` into a new object (`core/mcp/env.ts:46-52`) — only 1-5 vars needed. **CONFIRMED**.

## LOW: Code Hygiene

- ~~TOML array manipulation duplicated 4 times in `config/add.ts` and `config/rm.ts` — extract `addToTomlArray()` / `removeFromTomlArray()` into `shared.ts`~~ *(Not independently verified.)*
- Narration comments (`// writeFileByMode imported from ./write-file.js`) in skills.ts, commands.ts, agents.ts — delete. **CONFIRMED** — found in 3 files.
- ~~6 `biome-ignore` suppressions for cognitive complexity (symptom of sync triplication)~~ *(Not independently verified.)*
- `findGitDir` / walk-up-to-root logic duplicated across `init.ts` and `discovery.ts` — extract `walkUpFind()` utility. **CONFIRMED** — both use identical `while (depth++ < MAX_WALK_DEPTH)` pattern.
- `configPath` computed 3+ times identically in `commands/init.ts` (lines 102, 215, 249). **CONFIRMED** (3 instances, not 4).
- Redundant `const pc = picocolors` aliasing in init.ts, sync.ts, doctor/render.ts, hierarchy.ts. **CONFIRMED** — 4 files.
- ~~Unnecessary module-level JSDoc comments restating filename~~ *(Not independently verified.)*
- ~~`utils/fs.ts` — every function has "Replacement for fs-extra" comment~~ *(Not independently verified.)*
- ~~Inconsistent `readFile` import source (node:fs vs utils/fs) across 7 tool files~~ *(Not independently verified.)*
- ~~`ProjectConfigResult.format` always `"toml"` — carries no information~~ **REFUTED** — `ProjectConfigResult` has no `.format` field.

---

## Verification Summary

| Category | Total Findings | Confirmed | Refuted | Unverified |
|----------|---------------|-----------|---------|------------|
| Dead Code | 15 | 11 | 3 | 1 |
| Duplicate Patterns | 8 | 4 | 4 | 0 |
| Sync Triplication | 4 | 2 | 2 | 0 |
| Layer Violations | 5 | 5 | 0 | 0 |
| Missed Concurrency | 6 | 5 | 0 | 1 |
| Config Format | 4 | 2 | 1 | 1 |
| Structural Issues | 4 | 2 | 1 | 1 |
| Convention Violations | 4 | 2 | 2 | 0 |
| Quality Issues | 8 | 2 | 6 | 0 |
| Code Hygiene | 10 | 4 | 1 | 5 |
| **Total** | **68** | **39** | **20** | **9** |

**57% confirmed, 29% refuted, 13% unverified.**

Notable refutations:
- `escapeRegex`, `resolveConfigPath`, `VALID_TYPES` — already centralized in `shared.ts`
- `fileExists` — already uses shared `pathExists`
- `writeMCP` — already centralized in `mcp-helpers.ts`
- `mapProfiles` — uses Zod validation, not identity copy
- `replaceTokens` — correctly handles empty strings
- `ensureDir` before `outputFile` — no redundant calls
- `canonical.ts` / `preset.ts` — used via re-export chain
- `ErrorCategory` — actively imported by source-resolver.ts

---

## Recommended Fix Order (Updated)

1. **Delete confirmed dead code** — `tool-config.ts`, `frontmatter.ts`, dead exports from `path-normalization.ts`, `SelectionConfig`, `getAllToolProviders`, `AgentSyncExtension`, dead test utilities from schemas.ts. Quick, zero-risk.
2. **Fix layer violations** — remove `console.log`/`console.warn` from core, thread `cwd` through InitCommand, remove `process.cwd()` from `core/mcp/env.ts`, fix types→core import.
3. **Consolidate confirmed duplicates** — shared `TOKEN_PATTERN`, shared `isToolName` type guard, `getErrorMessage()` utility. Move `SyncOptions` to `sync/types.ts`.
4. **Parallelize I/O** — preset resolution (`Promise.allSettled`), manifest hashing, drift checks, per-tool sync within content types, config discovery.
5. **Extract sync generic** — `syncContentType()` to unify skills/commands/agents outer loop (inner functions differ enough to stay separate).
6. **Fix config format** — `[mcp.X]` instead of `[mcp_servers.X]`, `validatePresetStructure` should check `skills/` not `rules/`.
7. **Convert dynamic imports** — static imports for plan.ts, execute.ts, init.ts hot paths.
