# Security Policy

## Supported versions

Until the first stable release, security fixes target the latest `0.1.x` version only.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/jevonhou/exam-loop-core/security/advisories/new). Do not publish exploit details, learner archives, credentials, personal data, or undisclosed product information in a public issue.

If private vulnerability reporting is unavailable, open a non-sensitive issue asking the maintainer to establish a private channel. Do not include the vulnerability details in that issue.

A useful report contains the affected version, impact, minimal reproduction, relevant runtime, and any suggested mitigation. No response-time SLA is promised before a maintained public release exists.

## Security boundaries

Exam Loop Core is a local library, not an authentication, authorization, encryption, digital-signature, sandboxing, or remote-sync product.

- Archive SHA-256 checksums detect corruption or modification; they do not prove who created an archive.
- Archive payloads are plaintext. Applications must encrypt sensitive data at rest when required.
- Content-package structure is validated, but item payloads remain `unknown` until an application-defined decoder accepts them.
- Parsers do not impose byte, item-count, or nesting limits. Applications must reject oversized inputs before parsing to control memory and denial-of-service risk.
- Atomic restore uses compensating writes. It cannot provide stronger guarantees than the repository implementation.
- Integrating applications remain responsible for access control, privacy notices, platform security, backups, content rights, exam accuracy, and regulatory claims.

Dependency updates and high-severity audit findings are checked separately from the deterministic offline test gate.
