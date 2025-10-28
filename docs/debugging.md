# Debugging and Troubleshooting

For comprehensive testing info, see TESTING.md and docs/testing.md.

## Debug Tips

1. Set `DEBUG=true` for verbose output
2. Audit logs: `~/.agentsync/logs/audit-*.log` (JSONL format)
3. Test specific module: `pnpm test src/path/to/module.test.ts`
4. Check `.agentsync/config.json` for config issues
5. Use `--dry-run` for safe preview
6. Empty MCP configs (`[]` or `{}`) are valid

## ESM Module Resolution

- `NODE_PATH` does not affect ES modules
- Test isolation: symlink `node_modules` (copying is slow)
- Alternative: run tests from original location

## Filesystem Utilities

Prefer native `node:fs/promises` or `src/utils/fs.ts` wrappers:

- `pathExists`, `outputFile`, `ensureDir`, `copy`, `remove`

## Cross-Platform Testing

- Set both `HOME` and `USERPROFILE` on Windows for `os.homedir()`
- Retry cleanup on Windows file locks
- Use trap handlers in BATS: `trap 'cleanup_trap' EXIT INT TERM`
- Skip file permission tests on CI
