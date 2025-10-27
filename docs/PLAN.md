# Post-migration cleanup and modular security checks

We will finish removing legacy targets, align docs/CLI, and introduce a small, pluggable security-checks layer (mirroring per‑tool converters) that runs before sync. No AGENTS.md translation; checks operate on raw files and config.

## Adjustments re: mcp sync

- Remove standalone `mcp sync` command/tests; use main `agentsync sync` for all MCP flows
- Keep `mcp add/list/remove` commands

## Scope

- Delete deprecated target files (currently stubs)
- Remove `src/commands/mcp/sync.ts` and related tests
- Update docs to remove `mcp sync` references; clarify MCP sync is part of `agentsync sync`
- Add modular security checks interface under `src/security/checks/` and integrate early in `sync`
- Tidy build warnings (unused imports)

## Files of interest

- Code: `src/targets/{mcp-base.ts,mcp-index.ts,agents-sync-target.ts,rules-sync-target.ts,commands-sync-target.ts,cursor.ts,claude.ts,cline.ts,roocode.ts}`
- CLI: `src/cli.ts`
- Docs: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/cli.md`, `docs/agents-md.md`

## Implementation notes

- Verify no runtime imports of deleted files via grep before removal
- Update docs to state MCP sync is part of `agentsync sync`
- Remove or revise translator mentions in `docs/agents-md.md` to “symlink-only” approach
- Optional: Address Vite “unused import” warnings for cleanliness

## Security checks (atomic, pluggable)

- Location: `src/security/checks/`
- Interface (`types.ts`):

```ts
export interface SecurityFinding {
  check: string;
  severity: "low" | "medium" | "high";
  message: string;
  file?: string;
}

export interface SecurityContext {
  cwd: string;
  config: AgentSyncConfig;
  env: Record<string, string>;
}

export interface SecurityCheck {
  name: string;
  run(ctx: SecurityContext): Promise<SecurityFinding[]>;
}
```

- Checks to implement now:
  - `agents-md-secrets.ts` (uses existing `SecurityScanner` on `AGENTS.md` if present)
  - `agents-md-unicode.ts` (uses existing `UnicodeDetector` on `AGENTS.md` if present)
- Registry (`index.ts`): returns enabled checks based on `config.security`
- Runner (`run.ts`): executes checks, maps to warnings/errors based on severity and `config.security` block settings
- Integration: call `runSecurityChecks(cwd, config)` early in `src/commands/sync.ts`; on high severity with `blockOnHighSeverity`, throw; otherwise print warnings

## Acceptance

- All tests pass (with `mcp sync` tests removed/migrated)
- Build without errors; no references to deleted files
- Sync blocks or warns according to `config.security` when AGENTS.md contains issues
- Docs/CLI help accurately reflect current behavior

## Tasks

- Delete deprecated targets and per-tool legacy files
- Update docs and CLI docs (remove old targets and `mcp sync` command)
- Add `SecurityCheck` interface and types in `src/security/checks/types.ts`
- Implement secrets check using `SecurityScanner`
- Implement Unicode check using `UnicodeDetector`
- Create registry `src/security/checks/index.ts`
- Add `runSecurityChecks` and call it from `src/commands/sync.ts`
- Remove unused imports to reduce build warnings
- Run and ensure full test suite passes
- Note legacy target removal and modular security checks in CHANGELOG
