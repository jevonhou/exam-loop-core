import {
  CONTENT_SCHEMA_VERSION,
  createArchive,
  createReviewState,
  planSession,
  type ContentPackage,
  type JsonCompatible,
  type LearningItem,
  type QuestionAdapter,
} from "exam-loop-core";
import { validateContentPackage } from "exam-loop-core/content";
import { scheduleAttempt } from "exam-loop-core/learning";
import { MemoryRepository } from "exam-loop-core/storage";

interface ProgressPayload {
  readonly completed: number;
  readonly labels: readonly string[];
}

const progress: ProgressPayload = { completed: 2, labels: ["alpha", "beta"] };
const jsonProgress: JsonCompatible<ProgressPayload> = progress;
const archivePromise = createArchive(progress);
void jsonProgress;
void archivePromise;

// @ts-expect-error Date instances cannot be represented by the archive JSON contract.
void createArchive(new Date());

interface PromptPayload {
  readonly prompt: string;
  readonly expected: boolean;
}

const items: readonly LearningItem<PromptPayload>[] = [
  {
    id: "typed-item",
    skillIds: ["reasoning"],
    payload: { prompt: "An original prompt", expected: true },
  },
];

const adapter: QuestionAdapter<PromptPayload, { prompt: string }, boolean> = {
  id: "boolean",
  supports: () => true,
  create: ({ item }) => ({ payload: { prompt: item.payload.prompt } }),
  evaluate: ({ item, answer }) => ({
    correct: item.payload.expected === answer,
    score: item.payload.expected === answer ? 1 : 0,
  }),
};

const session = planSession(items, [adapter], {
  sessionId: "typed-session",
  size: 1,
  seed: "stable",
});
void session;

const state = createReviewState("typed-item");
const scheduled = scheduleAttempt(state, {
  id: "typed-attempt",
  itemId: "typed-item",
  skillIds: ["reasoning"],
  outcome: "correct",
  score: 1,
  occurredAt: 0,
});
void scheduled;

const repository = new MemoryRepository<ProgressPayload>(progress);
void repository;

const contentPackage: ContentPackage<{ readonly prompt: string }> = {
  schemaVersion: CONTENT_SCHEMA_VERSION,
  id: "typed-content",
  version: "1.0.0",
  title: "Typed content",
  license: {
    copyrightHolderOrSource: "Example contributors",
    redistributionPermitted: true,
    spdxId: "CC0-1.0",
  },
  skills: [{ id: "reasoning", title: "Reasoning" }],
  stages: [{ id: "stage", title: "Stage", skillIds: ["reasoning"] }],
  items: [
    {
      id: "item",
      skillIds: ["reasoning"],
      stageIds: ["stage"],
      payload: { prompt: "Original" },
    },
  ],
};

const validation = validateContentPackage(contentPackage);
void validation;
