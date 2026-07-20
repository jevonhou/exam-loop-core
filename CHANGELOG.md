# Changelog

Notable changes to Exam Loop Core are recorded here.

## [0.1.0] - 2026-07-20

### Added

- Headless learning contracts, deterministic seeded planning, adapter-owned answer evaluation, and normalized partial-credit attempts.
- Configurable spaced-review scheduling with persisted-state validation and deterministic due ordering.
- Checkpoint gates with per-skill thresholds and targeted remediation ranking.
- Versioned content-package validation, reference and prerequisite-cycle checks, license metadata, and payload-free previews.
- Canonical JSON, SHA-256 archives, payload validation, repository contracts, and compensating atomic restore.
- Original fictional-certification example with no real exam content.
- Strict TypeScript, typed ESLint, Prettier, coverage thresholds, public API type tests, public-file audit, and fresh-consumer package verification.
- Node 22/24 CI matrix, dependency update policy, issue templates, compatibility policy, security boundaries, and release checklist.

### Security

- Archive parsing rejects exotic objects, accessors, symbols, sparse arrays, non-finite numbers, circular references, unexpected fields, and invalid metadata.
- Package auditing rejects unsafe paths, local user-home references, private key material, and unsupported media before a local artifact is accepted.
