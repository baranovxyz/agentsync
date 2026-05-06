# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Please report suspected vulnerabilities privately via [GitHub Security Advisories](https://github.com/baranovxyz/agentsync/security/advisories/new).

**Do not open public issues for security reports.**

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

## Secret Handling

- Never commit secrets. Local configs (`agentsync.local.toml`, `.env`) are gitignored.
- Release workflows use OIDC for npm provenance — no long-lived tokens.
- MCP server configs support `{ENV_VAR}` token substitution to avoid hardcoding secrets.

## Supply Chain

- Pinned tooling in CI
- Tarball content validation in release workflow
- Automated dependency auditing via `pnpm audit`
- npm publish with `--provenance` (OIDC-signed, verifiable origin)

## Responsible Disclosure

If you find a vulnerability, please give us reasonable time to remediate before public disclosure.
