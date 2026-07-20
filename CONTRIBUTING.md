# Contributing

Contributions are welcome when they improve reusable learning workflows and keep the core independent of any single subject or interface framework.

## Development setup

Use Node.js 24 for local development. Node.js 22 is also part of the supported CI matrix.

```bash
npm ci
npm run check
```

Useful focused commands:

```bash
npm test
npm run test:watch
npm run lint
npm run typecheck
npm run example
```

## Change requirements

- Add deterministic tests for behavior changes and regression fixes.
- Keep public imports at the package root or documented subpaths; do not create a deep-import contract accidentally.
- Treat parsed JSON and application payloads as untrusted until a suitable validator or type guard accepts them.
- Preserve explicit injection of time, randomness, thresholds, and adapters wherever they affect outcomes.
- Keep runtime dependencies at zero unless a design note establishes a compelling technical need.
- Update `CHANGELOG.md` when behavior, compatibility, schemas, or public types change.
- Run `npm run check` before requesting review.

## Source and content rights

Do not contribute personal data, credentials, copied exam questions, commercial study-book material, restricted datasets, or generated material whose redistribution rights have not been checked.

Any non-trivial imported material must have a documented origin and a compatible license. Example content must be small, fictional, original, and clearly separated from the engine license.

By intentionally submitting a contribution, you agree that it may be distributed under this repository's MIT License.

## Review expectations

A pull request should explain the problem, the public behavior change, tests added, compatibility impact, and any content or dependency provenance. Security-sensitive findings belong in the private reporting channel described in `SECURITY.md`, not in a public issue.
