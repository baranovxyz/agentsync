# Debugging and ESM Gotchas

## Debug Tips

1. Set `DEBUG=true` for verbose output
2. Audit logs: `~/.agentsync/logs/audit-*.log` (JSONL)
3. Test specific module: `pnpm test src/path/to/module.test.ts`
4. Check `.agentsync/config.json`
5. Use `--dry-run` for safe sync
6. Parser testing: `pnpm cli validate`
7. Empty configs valid for MCP commands

## ESM Module Resolution Gotchas

- `NODE_PATH` does not affect ES modules; use symlinks or copy `node_modules`
- Test isolation:

```ts
beforeAll(async () => {
  // create temp dir, copy dist + package.json
  // symlink node_modules (ESM cannot use NODE_PATH)
});
```

- Alternative: copy `node_modules` (slow) or run from original location

## Filesystem Utilities

- Prefer native `node:fs/promises` APIs or `src/utils/fs.ts` wrappers

```ts
import { pathExists, outputFile, ensureDir, copy, remove } from "./utils/fs.js";
```

## Cross-Platform Testing

- Set both `HOME` and `USERPROFILE` on Windows
- Retry cleanup on Windows file locks
- Trap handlers in BATS: `trap 'cleanup_trap' EXIT INT TERM`
- Skip file permission tests on CI
