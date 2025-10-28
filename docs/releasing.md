# Releasing and npm Publishing

## Steps

1. Update version in `package.json`.
2. Update `CHANGELOG.md` with date.
3. Commit: `chore: bump version to X.Y.Z and update changelog`.
4. Tag: `git tag vX.Y.Z`.
5. Push: `git push origin main && git push origin vX.Y.Z`.
6. Build & Test: `pnpm build && pnpm test && pnpm test:bats`.
7. Publish: `npm publish`.

Notes:

- Pre-release versions like `0.2.0-alpha.5` do not need `--tag alpha`.

## Install Test (Production Package Validation)

- Validates `pnpm pack` → `npm install -g` workflow
- Covers:
  - Tarball creation and global install
  - Full MCP workflow (add, sync, remove)
  - Init command with all templates
  - Package quality checks
- Weekly CI and pre-release runs.

File: `tests/e2e/install-test.test.ts`
Workflow: `.github/workflows/install-test.yml`
