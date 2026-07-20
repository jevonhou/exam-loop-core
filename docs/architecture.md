# Architecture

Exam Loop Core separates learning policy from presentation and subject matter.

```text
application
  ├── interface and interaction
  ├── licensed learning content
  └── persistence adapter
          │
          ▼
exam-loop-core
  ├── learning: sessions, scheduling, checkpoints, remediation
  ├── content: package contracts and untrusted-input validation
  └── storage: repositories, verified archives, atomic restore
```

## Boundary rules

The library accepts caller-defined payloads and string identifiers. It must not know whether an item represents a legal scenario, a mathematical concept, a language prompt, or a professional certification rule.

All time, randomness, thresholds, intervals, and adapters are passed explicitly wherever they affect outcomes. This keeps simulations and tests deterministic and lets each product choose its own learning policy.

The core has no runtime dependency on a framework, browser storage, remote service, icon set, visual asset, or content dataset.

## Extension points

- Question adapters turn caller-owned items into answerable prompts and evaluate answers.
- Content payloads remain generic and are interpreted only by the application or its adapters.
- Repositories can target memory, IndexedDB, native storage, files, or a remote system without changing learning algorithms.
- Checkpoint rules and remediation selectors are configuration, not fixed product behavior.

## Trust boundaries

- Parsed JSON and imported packages are `unknown` until validated.
- Archive checksums detect accidental corruption and tampering; they are not signatures or encryption.
- Atomic restore helpers protect application state from partial writes but do not replace platform access controls.
- The integrating application is responsible for privacy, authentication, content rights, exam accuracy, and regulatory claims.

The rationale and tradeoffs behind these boundaries are recorded in [Design decisions](design-decisions.md). Compatibility and version promises are kept separately in [COMPATIBILITY.md](../COMPATIBILITY.md) and [API_STABILITY.md](../API_STABILITY.md).
