# API Guide

## Learning items and adapters

`LearningItem<TPayload>` carries an application-defined payload and string skill identifiers. A `QuestionAdapter` decides whether it supports an item, creates a question, and evaluates an answer.

```ts
import { planSession, type LearningItem, type QuestionAdapter } from "exam-loop-core";

type ItemPayload = { prompt: string; answer: boolean };
type Question = { prompt: string };

const items: LearningItem<ItemPayload>[] = [
  {
    id: "item-1",
    skillIds: ["reasoning"],
    payload: { prompt: "An original application prompt", answer: true },
  },
];

const adapter: QuestionAdapter<ItemPayload, Question, boolean> = {
  id: "boolean",
  supports: () => true,
  create: ({ item }) => ({ payload: { prompt: item.payload.prompt } }),
  evaluate: ({ item, answer }) => ({
    correct: answer === item.payload.answer,
    score: answer === item.payload.answer ? 1 : 0,
  }),
};

const session = planSession(items, [adapter], {
  sessionId: "round-1",
  size: 1,
  seed: "repeatable",
});
```

Passing the same items, adapters, options, and seed produces the same plan. The seeded generator is for repeatable planning, not cryptography.

## Attempts and review scheduling

Use `attemptFromEvaluation` to normalize an evaluated answer, then pass it to `scheduleAttempt`. The default policy covers `correct`, `incorrect`, `skipped`, and `repaired`; applications can supply a complete `ReviewSchedulerConfig` to change transitions and delays.

An attempt preserves the adapter's normalized `score` in `[0, 1]` and optional stable `errorCode`, so checkpoint scoring can retain partial credit and an application can group mistakes without exposing subject semantics to the core.

Scheduler timestamps are caller-supplied safe-integer epoch milliseconds. The library does not read the clock, and chronological regressions are rejected. Use `validateReviewState` before trusting state loaded from persistence.

## Checkpoints and remediation

`evaluateCheckpoint` accepts normalized attempts plus caller-owned thresholds. It reports overall and per-skill results and returns a deterministic list of remediation targets when the checkpoint is not passed.

The default overall threshold is a library convenience, not an exam rule. Production applications should define and document their own configuration.

## Content packages

`validateContentPackage(input: unknown)` validates schema version, required metadata, IDs, references, and redistribution metadata. A successful result contains `ContentPackage<unknown>`: the structural shell is validated, but every item payload must still be decoded by an application-defined schema or type guard before use.

Unknown structural fields produce warnings and are stripped from the returned value. Stage prerequisite cycles, duplicate references, invalid SPDX identifier syntax, exotic objects, accessors, and symbol fields are rejected. License validation confirms protocol shape only; it cannot establish that a contributor actually owns redistribution rights.

`previewContentPackage` returns metadata and issues only. It never returns imported payloads.

The engine license does not license package content. Follow [the content license policy](../CONTENT_LICENSE_POLICY.md).

## Archives and restore

`createArchive` and `verifyArchive` use canonical JSON and Web Crypto SHA-256. Checksums detect corruption and modification; they are not encryption, authentication, or digital signatures.

`createArchive` accepts JSON-compatible data and rejects dates, functions, symbols, non-finite numbers, circular references, sparse arrays, accessors, and exotic prototypes. A matching `PayloadValidator<T>` can narrow a parsed archive payload before use.

`restoreAtomically` follows a compensating-transaction pattern:

1. read current state;
2. create a safety snapshot;
3. write replacement state;
4. write the previous state back if replacement fails;
5. report rollback failure explicitly if both writes fail.

`MemoryRepository` and `MemorySnapshotStore` are for tests, examples, and ephemeral tools. An application should implement `Repository<T>` and `SnapshotStore<T>` for its chosen persistence platform.

Applications must impose their own byte, item-count, and nesting limits before parsing untrusted files. Structural validation is not a resource sandbox.
