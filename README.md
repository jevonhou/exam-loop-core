<div align="center">
  <h1>Exam Loop Core</h1>
  <p><strong>Composable learning workflows for TypeScript applications.</strong></p>
  <p>
    Build repeatable study sessions, spaced review, checkpoints, remediation,
    content validation, and recoverable local state without committing to a
    particular subject or UI framework.
  </p>
  <p>
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="https://github.com/jevonhou/exam-loop-core/actions/workflows/ci.yml">CI</a> ·
    <a href="docs/api.md">API guide</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

Exam Loop Core is a framework-agnostic TypeScript library for products that teach through short, interactive rounds. It provides the state transitions and contracts behind a learning loop while leaving presentation, subject matter, and infrastructure up to the application.

It can serve as a foundation for exam preparation, professional certification, language learning, compliance training, and other practice-driven experiences.

> **Project status:** `0.1.x` is an early public release. The API is documented and tested, but may evolve before `1.0.0`. The package is available from GitHub Releases and is not yet published to npm.

## What it provides

| Module     | Capabilities                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `learning` | seeded session planning, adapter-based evaluation, partial credit, spaced review, checkpoints, and remediation      |
| `content`  | versioned content packages, reference validation, prerequisite-cycle detection, license metadata, and safe previews |
| `storage`  | repository contracts, canonical JSON, SHA-256 archives, verified restore, and rollback on failed writes             |

Every module is available from the package root and from stable subpath exports:

```ts
import { planSession } from "exam-loop-core";
import { scheduleAttempt } from "exam-loop-core/learning";
import { validateContentPackage } from "exam-loop-core/content";
import { createArchive } from "exam-loop-core/storage";
```

## How it fits

```text
application
  ├── interface and interaction
  ├── learning content and answer adapters
  └── persistence implementation
             │
             ▼
       exam-loop-core
  ├── sessions and learning policy
  ├── content contracts and validation
  └── storage contracts and recovery
```

The library is intentionally small and portable. It does not read the clock, access the DOM, call a network service, or choose a database. Time, randomness, policies, adapters, and repositories are explicit inputs, which makes behavior repeatable in tests and adaptable across products.

## Run the example

Requirements: Node.js 22 or 24 and npm 10 or newer.

```bash
git clone https://github.com/jevonhou/exam-loop-core.git
cd exam-loop-core
npm ci
npm run example
```

The fictional-certification example validates a content package, plans a deterministic session, evaluates simulated answers, schedules review, applies a checkpoint, and verifies an archive.

Run the complete local verification suite with:

```bash
npm run check
```

## A minimal review flow

```ts
import { scheduleAttempt } from "exam-loop-core/learning";

const review = scheduleAttempt(undefined, {
  id: "attempt-1",
  itemId: "item-constitutional-principle",
  skillIds: ["rule-application"],
  outcome: "correct",
  score: 1,
  occurredAt: Date.UTC(2026, 0, 1, 9),
});

console.log(review.step, review.dueAt);
```

The scheduler never reads the current time. Passing the same state and attempt produces the same result, which makes review behavior easy to test, replay, and migrate.

For a complete adapter flow, see the [API guide](docs/api.md) and the [runnable example](examples/fictional-certification/README.md).

## Design principles

- **Deterministic by default.** Callers provide timestamps, random seeds, thresholds, and scheduling policy.
- **Content stays typed at the edge.** Package structure is validated centrally; each application decodes its own item payloads.
- **Adapters over assumptions.** Question formats, answer evaluation, and persistence are replaceable contracts.
- **Portable state.** Canonical archives and explicit repository interfaces support browsers, native apps, files, and services.
- **Small dependency surface.** The package has no runtime dependencies.

## Project scope

Exam Loop Core focuses on reusable learning workflows. It does not ship a user interface, a question bank, an account system, analytics, payments, or a hosted backend. Those concerns can be implemented by an application or provided by separate integration packages.

Checksums protect archive integrity; they are not encryption or digital signatures. Applications remain responsible for access control, privacy, content rights, and claims about exam accuracy. See the [security policy](SECURITY.md) and [content license policy](CONTENT_LICENSE_POLICY.md) for details.

## Documentation

- [API guide](docs/api.md)
- [Architecture](docs/architecture.md)
- [Design decisions](docs/design-decisions.md)
- [Compatibility](COMPATIBILITY.md)
- [API stability](API_STABILITY.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Bug reports and focused proposals are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports should use [GitHub private vulnerability reporting](https://github.com/jevonhou/exam-loop-core/security/advisories/new).

## License

Exam Loop Core is released under the [MIT License](LICENSE). Content packages are licensed separately by their respective authors.
