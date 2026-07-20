import { describe, expect, it } from "vitest";

import { attemptFromEvaluation, evaluateSessionAnswer, planSession } from "./session.js";
import type {
  AttemptFromEvaluationOptions,
  EvaluationResult,
  QuestionAdapter,
  SessionPlanOptions,
  SessionQuestion,
} from "./session.js";
import type { LearningItem } from "./types.js";

interface FixturePayload {
  readonly value: number;
}

interface FixtureQuestion {
  readonly expected: number;
  readonly variant: number;
}

interface FixtureFeedback {
  readonly delta: number;
}

const items: readonly LearningItem<FixturePayload>[] = [1, 2, 3, 4].map((value) => ({
  id: `item-${value}`,
  skillIds: [value % 2 === 0 ? "even" : "odd"],
  payload: { value },
}));

const adapter: QuestionAdapter<FixturePayload, FixtureQuestion, number, FixtureFeedback> = {
  id: "double-value",
  supports: () => true,
  create: ({ item, random }) => ({
    payload: {
      expected: item.payload.value * 2,
      variant: Math.floor(random() * 10_000),
    },
  }),
  evaluate: ({ question, answer }) => ({
    correct: answer === question.payload.expected,
    score: answer === question.payload.expected ? 1 : 0,
    feedback: { delta: answer - question.payload.expected },
  }),
};

describe("session planning", () => {
  it("replays identical plans for the same seed", () => {
    const first = planSession(items, [adapter], {
      sessionId: "session-a",
      size: 3,
      seed: "repeatable",
    });
    const second = planSession(items, [adapter], {
      sessionId: "session-a",
      size: 3,
      seed: "repeatable",
    });

    expect(first).toEqual(second);
    expect(first.questions).toHaveLength(3);
    expect(first.questions.map(({ id }) => id)).toEqual([
      "session-a:1",
      "session-a:2",
      "session-a:3",
    ]);
    expect(new Set(first.questions.map(({ itemId }) => itemId)).size).toBe(3);
  });

  it("uses a different deterministic stream for a different seed", () => {
    const first = planSession(items, [adapter], {
      sessionId: "session-a",
      size: 4,
      seed: "seed-one",
    });
    const second = planSession(items, [adapter], {
      sessionId: "session-a",
      size: 4,
      seed: "seed-two",
    });

    expect(first).not.toEqual(second);
  });

  it("accepts an injected random source and falls through null drafts", () => {
    const unavailable: QuestionAdapter<FixturePayload, FixtureQuestion, number, FixtureFeedback> = {
      ...adapter,
      id: "unavailable",
      create: () => null,
    };

    const plan = planSession(items.slice(0, 1), [unavailable, adapter], {
      sessionId: "injected",
      size: 1,
      random: () => 0.999,
    });

    expect(plan.questions).toHaveLength(1);
    expect(plan.questions[0]?.adapterId).toBe(adapter.id);
    expect(plan.questions[0]?.payload.variant).toBe(9_990);
  });

  it("skips unsupported items and never repeats an item to fill size", () => {
    const selective: QuestionAdapter<FixturePayload, FixtureQuestion, number> = {
      ...adapter,
      supports: (item) => item.payload.value === 2,
    };

    const plan = planSession(items, [selective], {
      sessionId: "selective",
      size: 10,
      seed: 5,
    });

    expect(plan.questions.map(({ itemId }) => itemId)).toEqual(["item-2"]);
  });

  it("validates identifiers, size, duplicates, and mutually exclusive randomness", () => {
    expect(() =>
      planSession(items, [adapter], {
        sessionId: "bad",
        size: -1,
      }),
    ).toThrow(/non-negative/);

    expect(() =>
      planSession([items[0]!, items[0]!], [adapter], {
        sessionId: "bad",
        size: 1,
      }),
    ).toThrow(/duplicate learning item/);

    expect(() =>
      planSession(items, [adapter, adapter], {
        sessionId: "bad",
        size: 1,
      }),
    ).toThrow(/duplicate question adapter/);

    expect(() =>
      planSession(items, [adapter], {
        sessionId: "bad",
        size: 1,
        seed: 1,
        random: () => 0,
      }),
    ).toThrow(/either seed or random/);
  });

  it("rejects malformed untyped planning inputs with stable diagnostics", () => {
    const cases: readonly [label: string, run: () => unknown, pattern: RegExp][] = [
      [
        "items",
        () =>
          planSession(null as unknown as typeof items, [adapter], { sessionId: "bad", size: 1 }),
        /learning items must be an array/,
      ],
      [
        "adapters",
        () =>
          planSession(items, null as unknown as readonly (typeof adapter)[], {
            sessionId: "bad",
            size: 1,
          }),
        /question adapters must be an array/,
      ],
      [
        "options",
        () => planSession(items, [adapter], null as unknown as SessionPlanOptions),
        /session options must be an object/,
      ],
      [
        "session id",
        () => planSession(items, [adapter], { sessionId: " ", size: 1 }),
        /sessionId must be a non-empty string/,
      ],
      [
        "fractional size",
        () => planSession(items, [adapter], { sessionId: "bad", size: 1.5 }),
        /non-negative safe integer/,
      ],
      [
        "seed",
        () => planSession(items, [adapter], { sessionId: "bad", size: 1, seed: Number.NaN }),
        /seed must be a string or finite number/,
      ],
      [
        "random",
        () =>
          planSession(items, [adapter], {
            sessionId: "bad",
            size: 1,
            random: 1 as unknown as () => number,
          }),
        /random must be a function/,
      ],
      [
        "item object",
        () =>
          planSession([null] as unknown as typeof items, [adapter], { sessionId: "bad", size: 1 }),
        /learning item must be an object/,
      ],
      [
        "item id",
        () => planSession([{ ...items[0]!, id: " " }], [adapter], { sessionId: "bad", size: 1 }),
        /learning item id must be a non-empty string/,
      ],
      [
        "item skills",
        () =>
          planSession([{ ...items[0]!, skillIds: ["odd", "odd"] }], [adapter], {
            sessionId: "bad",
            size: 1,
          }),
        /duplicate skill id/,
      ],
      [
        "adapter object",
        () =>
          planSession(items, [null] as unknown as readonly (typeof adapter)[], {
            sessionId: "bad",
            size: 1,
          }),
        /question adapter must be an object/,
      ],
      [
        "adapter id",
        () => planSession(items, [{ ...adapter, id: " " }], { sessionId: "bad", size: 1 }),
        /question adapter id must be a non-empty string/,
      ],
      [
        "adapter contract",
        () =>
          planSession(items, [{ id: "incomplete" }] as unknown as readonly (typeof adapter)[], {
            sessionId: "bad",
            size: 1,
          }),
        /must implement supports, create, and evaluate/,
      ],
    ];

    for (const [label, run, pattern] of cases) {
      expect(run, label).toThrow(pattern);
    }
  });

  it("validates adapter support and question drafts before exposing them", () => {
    const invalidSupport = {
      ...adapter,
      supports: (() => 1) as unknown as typeof adapter.supports,
    };
    const invalidDraft = {
      ...adapter,
      create: (() => []) as unknown as typeof adapter.create,
    };
    const duplicateDraftSkills: typeof adapter = {
      ...adapter,
      create: ({ item }) => ({
        payload: { expected: item.payload.value, variant: 0 },
        skillIds: ["x", "x"],
      }),
    };

    expect(() =>
      planSession(items.slice(0, 1), [invalidSupport], { sessionId: "bad", size: 1, seed: 1 }),
    ).toThrow(/supports must return a boolean/);
    expect(() =>
      planSession(items.slice(0, 1), [invalidDraft], { sessionId: "bad", size: 1, seed: 1 }),
    ).toThrow(/object or null/);
    expect(() =>
      planSession(items.slice(0, 1), [duplicateDraftSkills], {
        sessionId: "bad",
        size: 1,
        seed: 1,
      }),
    ).toThrow(/duplicate skill id/);
  });
});

describe("adapter-driven answer evaluation", () => {
  const question: SessionQuestion<FixtureQuestion> = {
    id: "session-a:1",
    itemId: "item-2",
    adapterId: adapter.id,
    skillIds: ["even"],
    payload: { expected: 4, variant: 0 },
  };

  it("delegates correctness and feedback to the originating adapter", () => {
    const result = evaluateSessionAnswer(question, items[1]!, 4, [adapter]);

    expect(result).toEqual({ correct: true, score: 1, feedback: { delta: 0 } });
  });

  it("normalizes evaluation results into regular and repair attempts", () => {
    const evaluation: EvaluationResult = {
      correct: true,
      score: 0.75,
      errorCode: "minor-gap",
    };
    const regular = attemptFromEvaluation(question, evaluation, {
      attemptId: "attempt-1",
      occurredAt: 10,
      answer: 4,
      sessionId: "session-a",
    });
    const repair = attemptFromEvaluation(question, evaluation, {
      attemptId: "attempt-2",
      occurredAt: 20,
      repair: true,
    });

    expect(regular).toMatchObject({
      outcome: "correct",
      score: 0.75,
      errorCode: "minor-gap",
      answer: 4,
    });
    expect(repair).toMatchObject({ outcome: "repaired", score: 0.75 });
  });

  it("rejects mismatched items, missing adapters, and invalid adapter scores", () => {
    expect(() => evaluateSessionAnswer(question, items[0]!, 4, [adapter])).toThrow(
      /does not match/,
    );
    expect(() => evaluateSessionAnswer(question, items[1]!, 4, [])).toThrow(/not found/);

    const invalidAdapter: QuestionAdapter<FixturePayload, FixtureQuestion, number> = {
      ...adapter,
      evaluate: () => ({ correct: true, score: 2 }),
    };
    expect(() => evaluateSessionAnswer(question, items[1]!, 4, [invalidAdapter])).toThrow(
      /\[0, 1\]/,
    );
  });

  it("rejects malformed questions, adapter contracts, and evaluation objects", () => {
    expect(() =>
      evaluateSessionAnswer(null as unknown as typeof question, items[1]!, 4, [adapter]),
    ).toThrow(/session question must be an object/);
    expect(() =>
      evaluateSessionAnswer(question, null as unknown as (typeof items)[number], 4, [adapter]),
    ).toThrow(/learning item must be an object/);
    expect(() =>
      evaluateSessionAnswer(question, items[1]!, 4, null as unknown as readonly (typeof adapter)[]),
    ).toThrow(/question adapters must be an array/);

    const values: readonly unknown[] = [
      null,
      [],
      { correct: "yes", score: 1 },
      { correct: true, score: Number.NaN },
      { correct: true, score: 1, errorCode: " " },
    ];
    for (const value of values) {
      const invalid: typeof adapter = {
        ...adapter,
        evaluate: () => value as EvaluationResult<FixtureFeedback>,
      };
      expect(() => evaluateSessionAnswer(question, items[1]!, 4, [invalid])).toThrow();
    }

    const missingEvaluate = { id: adapter.id } as unknown as typeof adapter;
    expect(() => evaluateSessionAnswer(question, items[1]!, 4, [missingEvaluate])).toThrow(
      /must implement evaluate/,
    );
  });

  it("validates normalized attempt metadata at runtime", () => {
    const evaluation: EvaluationResult = { correct: false, score: 0.25 };
    const validOptions: AttemptFromEvaluationOptions = {
      attemptId: "attempt",
      occurredAt: 100,
    };

    expect(() =>
      attemptFromEvaluation(null as unknown as typeof question, evaluation, validOptions),
    ).toThrow(/session question must be an object/);
    expect(() =>
      attemptFromEvaluation(question, evaluation, null as unknown as AttemptFromEvaluationOptions),
    ).toThrow(/attempt options must be an object/);

    const cases: readonly [options: AttemptFromEvaluationOptions, pattern: RegExp][] = [
      [{ ...validOptions, attemptId: " " }, /attemptId must be a non-empty string/],
      [{ ...validOptions, occurredAt: 1.5 }, /safe-integer epoch millisecond/],
      [{ ...validOptions, durationMs: 1.5 }, /durationMs must be a non-negative safe integer/],
      [{ ...validOptions, sessionId: " " }, /sessionId must be a non-empty string/],
      [
        { ...validOptions, repair: "yes" as unknown as boolean },
        /attempt repair must be a boolean/,
      ],
    ];

    for (const [options, pattern] of cases) {
      expect(() => attemptFromEvaluation(question, evaluation, options)).toThrow(pattern);
    }
  });
});
