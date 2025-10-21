# Security Policy

## Supported Versions

We support the latest published version on npm and the `main` branch. Security fixes are backported on a best-effort basis.

## Reporting a Vulnerability

- Please report suspected vulnerabilities privately via GitHub Security Advisories.
- Do not create public issues for security reports.
- We aim to acknowledge within 48 hours.

## Secret Handling

- Never commit secrets. Local configs like `agentsync.local.json` and `.env` are gitignored and excluded from packages.
- Release workflows use OIDC for npm provenance; no long-lived tokens are required.

## Supply Chain

- We use pinned tooling in CI and validate tarball contents in release.
- Automated checks: typecheck, tests, Semgrep, and audit in CI.

## Responsible Disclosure

If you find a vulnerability, please give us reasonable time to remediate before public disclosure.
