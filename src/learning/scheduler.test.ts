import { describe, expect, it } from "vitest";

import {
  DEFAULT_REVIEW_SCHEDULER_CONFIG,
  createReviewState,
  getDueReviewStates,
  scheduleAttempt,
  validateReviewSchedulerConfig,
  validateReviewState,
} from "./scheduler.js";
import type { ReviewSchedulerConfig } from "./scheduler.js";
import type { Attempt, AttemptOutcome, ReviewState } from "./types.js";

function attempt(
  id: string,
  outcome: AttemptOutcome,
  occurredAt: number,
  itemId = "item-a",
): Attempt {
  return {
    id,
    itemId,
    skillIds: ["skill-a"],
    outcome,
    occurredAt,
  };
}

describe("review scheduler", () => {
  it("creates an explicit unscheduled state", () => {
    expect(createReviewState("item-a")).toEqual({
      itemId: "item-a",
      step: -1,
      dueAt: null,
      lastAttemptAt: null,
      lastOutcome: null,
      attemptCount: 0,
      successStreak: 0,
      outcomeCounts: { correct: 0, incorrect: 0, skipped: 0, repaired: 0 },
    });
  });

  it("deterministically covers correct, incorrect, skipped, and repaired outcomes", () => {
    const tenMinutes = 10 * 60_000;
    const oneDay = 24 * 60 * 60_000;

    const first = scheduleAttempt(undefined, attempt("a-1", "correct", 0));
    expect(first).toMatchObject({ step: 0, dueAt: tenMinutes, successStreak: 1 });

    const second = scheduleAttempt(first, attempt("a-2", "correct", 100));
    expect(second).toMatchObject({ step: 1, dueAt: 100 + oneDay, successStreak: 2 });

    const failed = scheduleAttempt(second, attempt("a-3", "incorrect", 200));
    expect(failed).toMatchObject({ step: 0, dueAt: 200 + tenMinutes, successStreak: 0 });

    const skipped = scheduleAttempt(failed, attempt("a-4", "skipped", 300));
    expect(skipped).toMatchObject({ step: 0, dueAt: 300 + tenMinutes, successStreak: 0 });

    const repaired = scheduleAttempt(skipped, attempt("a-5", "repaired", 400));
    expect(repaired).toMatchObject({ step: 1, dueAt: 400 + oneDay, successStreak: 1 });
    expect(repaired.outcomeCounts).toEqual({
      correct: 2,
      incorrect: 1,
      skipped: 1,
      repaired: 1,
    });
    expect(repaired.attemptCount).toBe(5);
  });

  it("honors caller-defined transitions and delays", () => {
    const custom: ReviewSchedulerConfig = {
      intervalsMs: [100, 500, 1_000],
      rules: {
        ...DEFAULT_REVIEW_SCHEDULER_CONFIG.rules,
        correct: {
          transition: { kind: "reset", to: 2 },
          delay: { kind: "fixed", delayMs: 25 },
          countsAsSuccess: false,
        },
      },
    };

    const result = scheduleAttempt(undefined, attempt("a-1", "correct", 1_000), custom);
    expect(result).toMatchObject({ step: 2, dueAt: 1_025, successStreak: 0 });
  });

  it("returns due states in stable due-time and item-id order", () => {
    const state = (itemId: string, dueAt: number | null): ReviewState => ({
      ...createReviewState(itemId),
      dueAt,
    });

    const result = getDueReviewStates(
      [
        state("c", 200),
        state("b", 100),
        state("a", 100),
        state("future", 300),
        state("none", null),
      ],
      200,
    );

    expect(result.map(({ itemId }) => itemId)).toEqual(["a", "b", "c"]);
  });

  it("rejects invalid configuration, item mismatches, and out-of-order attempts", () => {
    expect(() =>
      validateReviewSchedulerConfig({
        ...DEFAULT_REVIEW_SCHEDULER_CONFIG,
        intervalsMs: [],
      }),
    ).toThrow(/at least one/);
    expect(() =>
      validateReviewSchedulerConfig({
        ...DEFAULT_REVIEW_SCHEDULER_CONFIG,
        intervalsMs: [100, 100],
      }),
    ).toThrow(/strictly ascending/);
    expect(() =>
      validateReviewSchedulerConfig({
        intervalsMs: [100],
        rules: {} as ReviewSchedulerConfig["rules"],
      }),
    ).toThrow(/rule for correct/);

    const state = scheduleAttempt(undefined, attempt("a-1", "correct", 100));
    expect(() => scheduleAttempt(state, attempt("a-2", "correct", 99))).toThrow(/chronological/);
    expect(() => scheduleAttempt(state, attempt("b-1", "correct", 101, "item-b"))).toThrow(
      /does not match/,
    );
  });

  it("rejects corrupted persisted state and unsafe timestamp overflow", () => {
    const state = createReviewState("item-a");
    expect(() =>
      scheduleAttempt({ ...state, attemptCount: 1 }, attempt("a-1", "correct", 100)),
    ).toThrow(/sum to attemptCount/);

    expect(() =>
      scheduleAttempt(undefined, attempt("a-2", "correct", Number.MAX_SAFE_INTEGER)),
    ).toThrow(/dueAt exceeds/);
  });

  it("validates all scheduler rule variants at runtime for JavaScript callers", () => {
    const valid = DEFAULT_REVIEW_SCHEDULER_CONFIG;
    const invalid = [
      null,
      { intervalsMs: "bad", rules: valid.rules },
      { intervalsMs: [0], rules: valid.rules },
      { intervalsMs: [100], rules: null },
      {
        intervalsMs: [100],
        rules: { ...valid.rules, correct: { ...valid.rules.correct, countsAsSuccess: "yes" } },
      },
      {
        intervalsMs: [100],
        rules: { ...valid.rules, correct: { ...valid.rules.correct, transition: null } },
      },
      {
        intervalsMs: [100],
        rules: {
          ...valid.rules,
          correct: { ...valid.rules.correct, transition: { kind: "advance", by: 0 } },
        },
      },
      {
        intervalsMs: [100],
        rules: {
          ...valid.rules,
          correct: { ...valid.rules.correct, transition: { kind: "reset", to: -1 } },
        },
      },
      {
        intervalsMs: [100],
        rules: {
          ...valid.rules,
          correct: { ...valid.rules.correct, transition: { kind: "unknown" } },
        },
      },
      {
        intervalsMs: [100],
        rules: { ...valid.rules, correct: { ...valid.rules.correct, delay: null } },
      },
      {
        intervalsMs: [100],
        rules: {
          ...valid.rules,
          correct: { ...valid.rules.correct, delay: { kind: "fixed", delayMs: -1 } },
        },
      },
      {
        intervalsMs: [100],
        rules: {
          ...valid.rules,
          correct: { ...valid.rules.correct, delay: { kind: "unknown" } },
        },
      },
    ];

    for (const config of invalid) {
      expect(() => validateReviewSchedulerConfig(config as ReviewSchedulerConfig)).toThrow();
    }
  });

  it("validates persisted review-state invariants with stable errors", () => {
    const state = createReviewState("item-a");
    const invalid = [
      null,
      { ...state, itemId: "" },
      { ...state, step: 99 },
      { ...state, dueAt: -1 },
      { ...state, lastAttemptAt: 1.5 },
      { ...state, lastOutcome: "unknown" },
      { ...state, successStreak: 1 },
      { ...state, outcomeCounts: null },
      { ...state, attemptCount: -1 },
    ];

    for (const candidate of invalid) {
      expect(() => validateReviewState(candidate as ReviewState)).toThrow();
    }
    expect(() => createReviewState(1 as never)).toThrow(/itemId/);
  });

  it("rejects malformed attempts and unsafe due queries", () => {
    const malformed = [
      { ...attempt("a-1", "correct", 0), itemId: "" },
      { ...attempt("a-2", "correct", 0), outcome: "unknown" },
      { ...attempt("a-3", "correct", 0), occurredAt: 1.5 },
    ];

    for (const candidate of malformed) {
      expect(() => scheduleAttempt(undefined, candidate as Attempt)).toThrow();
    }
    expect(() => getDueReviewStates([], -1)).toThrow(/now/);
  });
});
