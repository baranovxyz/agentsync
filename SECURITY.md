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
- The isolated publish job uses OIDC for npm provenance — no long-lived npm tokens.
- MCP server configs support `{ENV_VAR}` token substitution to avoid hardcoding secrets.

## Supply Chain

- Release actions and the npm CLI are pinned to immutable versions
- The packed tarball is checked against the mirror-reviewed `dist-manifest.json`
- Only the minimal publish job receives npm authority; it checks out no source
- Automated dependency auditing via `pnpm audit`
- Registry integrity and SLSA provenance are verified before tagging

## Responsible Disclosure

If you find a vulnerability, please give us reasonable time to remediate before public disclosure.
