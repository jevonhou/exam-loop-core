# API Stability

Exam Loop Core follows semantic versioning, with explicit additional policies for schemas and persisted data.

## Public surface

Only exports reachable from the package root or the documented `content`, `learning`, and `storage` subpaths are public API. Files inside `dist` are implementation details and must not be deep-imported.

During `0.x` development:

- patch releases do not intentionally break documented APIs;
- a minor release may contain a breaking change only when the changelog explains the reason and migration;
- deprecated APIs remain available for at least one subsequent minor release when a safe compatibility path exists;
- new union members and error codes are minor changes, so consumers should retain a defensive default branch.

The first `1.0.0` release will mark the documented TypeScript API stable under normal semantic-versioning rules.

## Persisted formats

TypeScript package versions, content schema versions, and archive format versions evolve independently.

- `CONTENT_SCHEMA_VERSION` identifies the accepted content envelope. Unsupported versions fail with a stable issue code instead of being guessed.
- `ARCHIVE_VERSION` identifies the persisted archive structure. Unsupported versions fail before payload use.
- Stable machine-readable validation and archive error codes are preferred over matching human-readable messages.
- A future format change that cannot be read safely requires a new schema or archive version and a documented migration path.

## Deprecation and removal

Deprecations are marked in generated declarations, documented in `CHANGELOG.md`, and covered by compatibility tests until removal. A removal never ships silently in a patch release.
