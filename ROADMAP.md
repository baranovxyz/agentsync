# AgentSync Roadmap

This document outlines the path from alpha to a stable 1.0.0 release.

## Current Status: 0.2.0-alpha.22

AgentSync is in **active alpha development**. We're prioritizing rapid iteration and UX improvements over backward compatibility.

### What Alpha Means

- ✅ Core functionality is working and tested
- ✅ Ready for early adopters and experimentation
- ⚠️ Breaking changes expected without migration paths
- ⚠️ Config formats may evolve
- ⚠️ CLI interface may change

## Path to Stability

### Beta Phase (0.x.x-beta)

**Goal:** Stabilize core APIs and interfaces

**Criteria for Beta:**

- [ ] Core config schema frozen (no more breaking changes)
- [ ] CLI interface stabilized
- [ ] Tool codec APIs stable
- [ ] Preset system API locked
- [ ] External testing completed (50+ users)
- [ ] All critical bugs resolved
- [ ] Documentation complete and accurate
- [ ] Migration guide for breaking changes

**Estimated Timeline:** Q1 2026

### Release Candidate (0.x.x-rc)

**Goal:** Production-ready testing

**Criteria for RC:**

- [ ] No known critical bugs
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] 100+ active users providing feedback
- [ ] All documentation reviewed
- [ ] CI/CD fully automated
- [ ] Tested on all supported platforms

**Estimated Timeline:** Q2 2026

### 1.0.0 Stable Release

**Goal:** Production-grade reliability

**Criteria for 1.0:**

- [ ] 6+ weeks in RC with no critical issues
- [ ] Semantic versioning commitment
- [ ] Full test coverage (>90%)
- [ ] Performance targets met
- [ ] Security best practices verified
- [ ] Migration paths documented
- [ ] Community adoption validated
- [ ] Commercial usage confirmed

**Estimated Timeline:** Q2-Q3 2026

## Feature Roadmap

### Alpha Features (Current)

**Core Functionality:**

- ✅ Multi-tool sync (Cursor, Claude, Cline, Roocode)
- ✅ GitHub preset system
- ✅ MCP server management
- ✅ Import/reference mode
- ✅ Security scanning (secrets, unicode)
- ✅ Format conversion (.mdc ↔ .md)

**Developer Experience:**

- ✅ Interactive init wizard
- ✅ Status checks and validation
- ✅ Preset caching and updates
- ✅ Clear error messages

### Beta Features (Planned)

**Stability & Polish:**

- [ ] Config format versioning
- [ ] Migration tooling for breaking changes
- [ ] Enhanced error recovery
- [ ] Rollback/undo capabilities
- [ ] Dry-run mode for all operations

**New Capabilities:**

- [ ] Watch mode (auto-sync on changes)
- [ ] Team collaboration features
- [ ] Preset registry/marketplace
- [ ] Advanced filtering and selection
- [ ] Plugin system for custom converters

**Quality of Life:**

- [ ] Interactive TUI for complex operations
- [ ] Config validation and linting
- [ ] Diff/preview before sync
- [ ] Conflict resolution UI
- [ ] Template system for new projects

### 1.0 Features (Committed)

**Enterprise-Ready:**

- [ ] Audit logging and compliance
- [ ] SSO/SAML integration
- [ ] Enterprise preset hosting
- [ ] Advanced security controls
- [ ] Team management features

**Performance:**

- [ ] Sub-second sync operations
- [ ] Efficient preset caching
- [ ] Parallel tool processing
- [ ] Incremental updates only

**Ecosystem:**

- [ ] VS Code extension
- [ ] Web UI for config management
- [ ] GitHub Action for CI/CD
- [ ] Docker image for containerized use

## Known Limitations (Alpha)

### Current Constraints

1. **Breaking Changes Policy**
   - No guaranteed migration paths in alpha
   - Config formats may change
   - CLI commands may be renamed/restructured

2. **Tool Support**
   - Cline: Rules only (no commands support)
   - Limited to 4 tools (more coming in beta)

3. **Performance**
   - Large presets (1000+ files) may be slow
   - No incremental sync yet
   - Cache invalidation is aggressive

4. **Platform Support**
   - Primarily tested on macOS
   - Linux support good
   - Windows support via WSL only

### Post-1.0 Features

These features are intentionally deferred until after stability:

- Multi-language support (i18n)
- Cloud sync and backup
- Mobile app for config management
- AI-powered preset recommendations
- Advanced analytics and insights
- Integration with other dev tools

## Version Strategy

### Alpha (Current)

**Version pattern:** `0.x.x-alpha.y`

- Rapid iteration
- Breaking changes welcome
- User feedback drives development
- Weekly/bi-weekly releases

### Beta

**Version pattern:** `0.x.x-beta.y`

- Feature-complete
- API stability focus
- Breaking changes minimized
- Monthly releases with changelog
- Migration guides for any breaking changes

### Release Candidate

**Version pattern:** `0.x.x-rc.y`

- Production testing
- Only critical bug fixes
- No new features
- No breaking changes
- Release every 2-4 weeks

### Stable

**Version pattern:** `x.y.z`

- Semantic versioning strictly followed
- Major versions for breaking changes
- Minor versions for new features
- Patch versions for bug fixes
- Regular security updates

## How to Help

### For Alpha Users

- **Test extensively** — Report bugs and edge cases
- **Provide feedback** — Tell us what works and what doesn't
- **Share use cases** — Help us understand real-world needs
- **Contribute** — PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md)

### For Beta Testers (Future)

- **Production testing** — Use in real projects
- **Performance data** — Share metrics and benchmarks
- **Documentation review** — Help improve clarity
- **Migration testing** — Validate upgrade paths

## Stability Commitment

**Pre-1.0 (Alpha/Beta):**

- Breaking changes may occur without notice
- Config formats may evolve
- CLI interface may change
- Best effort at migration guidance

**Post-1.0 (Stable):**

- Semantic versioning commitment
- Breaking changes only in major versions
- Deprecation warnings before removal
- Migration guides for all breaking changes
- LTS support for critical versions

## Communication Channels

- **GitHub Issues:** Bug reports and feature requests
- **GitHub Discussions:** Questions and community support
- **Release Notes:** Detailed changelog for each version
- **Security Advisory:** Vulnerabilities and patches

## Timeline Summary

| Phase               | Version        | Timeline      | Focus                             |
| ------------------- | -------------- | ------------- | --------------------------------- |
| **Alpha** (Current) | 0.2.0-alpha.22 | Now - Q1 2026 | Feature development, UX iteration |
| **Beta**            | 0.x.x-beta     | Q1-Q2 2026    | API stability, external testing   |
| **RC**              | 0.x.x-rc       | Q2 2026       | Production hardening              |
| **Stable**          | 1.0.0          | Q2-Q3 2026    | Commitment to semver              |

## Questions?

- Check [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions
- Review [REQUIREMENTS.md](./REQUIREMENTS.md) for feature specifications

---

_This roadmap is a living document and will be updated as the project evolves. Last updated: November 3, 2025_
