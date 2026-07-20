import { describe, expect, it } from "vitest";

import { evaluateCheckpoint, resolveCheckpointConfig } from "./checkpoint.js";
import type { RemediationCandidate } from "./checkpoint.js";
import type { Attempt, AttemptOutcome } from "./types.js";

function attempt(
  id: string,
  itemId: string,
  outcome: AttemptOutcome,
  skillIds: readonly string[],
): Attempt {
  return {
    id,
    itemId,
    skillIds,
    outcome,
    occurredAt: Number(id.replace(/\D/g, "")) || 0,
  };
}

describe("checkpoint gate", () => {
  it("passes when overall, attempt-count, and per-skill requirements are met", () => {
    const result = evaluateCheckpoint(
      [
        attempt("a1", "item-a", "correct", ["skill-a"]),
        attempt("a2", "item-b", "repaired", ["skill-b"]),
        attempt("a3", "item-c", "correct", ["skill-a", "skill-b"]),
      ],
      {
        minimumAttempts: 3,
        minimumOverallScore: 0.8,
        minimumScoreBySkill: { "skill-a": 0.8, "skill-b": 0.8 },
      },
    );

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(1);
    expect(result.skillResults.every(({ passed }) => passed)).toBe(true);
    expect(result.remediation).toEqual([]);
  });

  it("fails a missing required skill and targets an unattempted matching candidate", () => {
    const candidates: readonly RemediationCandidate[] = [
      { itemId: "item-a", skillIds: ["skill-a"] },
      { itemId: "item-b", skillIds: ["skill-b"] },
    ];
    const result = evaluateCheckpoint(
      [attempt("a1", "item-a", "correct", ["skill-a"])],
      {
        minimumOverallScore: 1,
        minimumScoreBySkill: { "skill-a": 1, "skill-b": 0.8 },
      },
      candidates,
    );

    expect(result.passed).toBe(false);
    expect(result.skillResults).toContainEqual({
      skillId: "skill-b",
      score: null,
      threshold: 0.8,
      attemptCount: 0,
      passed: false,
    });
    expect(result.remediation[0]).toMatchObject({
      itemId: "item-b",
      weakSkillIds: ["skill-b"],
      attemptCount: 0,
    });
  });

  it("ranks weak items deterministically and respects the target limit", () => {
    const attempts = [
      attempt("a1", "item-a", "incorrect", ["skill-a"]),
      attempt("a2", "item-b", "skipped", ["skill-b"]),
      attempt("a3", "item-c", "correct", ["skill-a"]),
    ];
    const candidates: readonly RemediationCandidate[] = [
      { itemId: "item-a", skillIds: ["skill-a"] },
      { itemId: "item-b", skillIds: ["skill-b"] },
      { itemId: "item-c", skillIds: ["skill-a"] },
      { itemId: "item-d", skillIds: ["skill-a"] },
    ];

    const result = evaluateCheckpoint(
      attempts,
      {
        minimumOverallScore: 0.8,
        minimumScoreBySkill: { "skill-a": 0.8, "skill-b": 0.7 },
        remediation: { limit: 2 },
      },
      candidates,
    );

    expect(result.passed).toBe(false);
    expect(result.remediation).toHaveLength(2);
    expect(result.remediation.map(({ itemId }) => itemId)).toEqual(["item-b", "item-a"]);
    expect(result.remediation[0]!.priority).toBeGreaterThan(result.remediation[1]!.priority);
  });

  it("allows checkpoint scoring and remediation weights to be configured", () => {
    const result = evaluateCheckpoint([attempt("a1", "item-a", "repaired", ["skill-a"])], {
      minimumOverallScore: 0.75,
      outcomeScores: { repaired: 0.5 },
      remediation: {
        outcomePenalties: { repaired: 2 },
        skillDeficitWeight: 0,
      },
    });

    expect(result.overallScore).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.remediation[0]).toMatchObject({ itemId: "item-a", priority: 2 });
  });

  it("uses an attempt's partial score before the outcome fallback", () => {
    const partial = {
      ...attempt("a1", "item-a", "incorrect", ["skill-a"]),
      score: 0.75,
    };

    const result = evaluateCheckpoint([partial], {
      minimumOverallScore: 0.7,
      minimumScoreBySkill: { "skill-a": 0.7 },
    });

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(0.75);
    expect(result.skillResults[0]?.score).toBe(0.75);
  });

  it("rejects duplicate attempt ids and out-of-range partial scores", () => {
    const first = attempt("a1", "item-a", "correct", ["skill-a"]);

    expect(() => evaluateCheckpoint([first, { ...first, itemId: "item-b" }])).toThrow(
      /duplicate attempt id/,
    );
    expect(() => evaluateCheckpoint([{ ...first, score: 1.1 }])).toThrow(/\[0, 1\]/);
  });

  it("validates thresholds, minimum attempts, and remediation settings", () => {
    expect(() => resolveCheckpointConfig({ minimumOverallScore: 2 })).toThrow(/\[0, 1\]/);
    expect(() => resolveCheckpointConfig({ minimumAttempts: -1 })).toThrow(/non-negative/);
    expect(() => resolveCheckpointConfig({ remediation: { limit: -1 } })).toThrow(/non-negative/);
    expect(() =>
      resolveCheckpointConfig({ remediation: { outcomePenalties: { skipped: -1 } } }),
    ).toThrow(/non-negative/);
  });
});
