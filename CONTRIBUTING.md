# Contributing to AgentSync

Thanks for your interest in contributing!

## Ground Rules

- Create feature branches; do not push to `main` directly.
- Write tests for new features and bug fixes.
- Keep commits small and focused; use Conventional Commits.
  - Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
  - Format: `type(scope): summary` (max 72 chars)
  - Scopes (suggested): core, cli, mcp, targets, parser, registry, security, tests, docs, ci, release, init
  - Use `pnpm cz` for guided messages (Commitizen)

## Development

- Install: `pnpm install`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint (typecheck): `pnpm lint`

## Security

- Do not include secrets in issues, PRs, code, or tests.
- Follow guidance in `SECURITY.md`.

## PR Checklist

- [ ] Conventional commit title
- [ ] Small, atomic PR (split if >800 LOC changed)
- [ ] Tests added/updated
- [ ] Docs updated (if needed)
- [ ] CI green

## License

By contributing, you agree your contributions are licensed under the project license.
