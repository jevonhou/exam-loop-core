import type { Attempt, AttemptOutcome, LearningItemId, SkillId } from "./types.js";

export type OutcomeScores = Readonly<Record<AttemptOutcome, number>>;
export type OutcomePenalties = Readonly<Record<AttemptOutcome, number>>;

export interface RemediationCandidate {
  readonly itemId: LearningItemId;
  readonly skillIds: readonly SkillId[];
}

export interface RemediationConfig {
  readonly limit: number;
  readonly outcomePenalties: OutcomePenalties;
  readonly skillDeficitWeight: number;
  readonly unattemptedPenalty: number;
}

export interface CheckpointConfig {
  readonly minimumAttempts: number;
  readonly minimumOverallScore: number;
  readonly minimumScoreBySkill: Readonly<Record<SkillId, number>>;
  readonly outcomeScores: OutcomeScores;
  readonly remediation: RemediationConfig;
}

export interface CheckpointConfigInput {
  readonly minimumAttempts?: number;
  readonly minimumOverallScore?: number;
  readonly minimumScoreBySkill?: Readonly<Record<SkillId, number>>;
  readonly outcomeScores?: Partial<OutcomeScores>;
  readonly remediation?: {
    readonly limit?: number;
    readonly outcomePenalties?: Partial<OutcomePenalties>;
    readonly skillDeficitWeight?: number;
    readonly unattemptedPenalty?: number;
  };
}

export interface CheckpointSkillResult {
  readonly skillId: SkillId;
  readonly score: number | null;
  readonly threshold: number;
  readonly attemptCount: number;
  readonly passed: boolean;
}

export interface RemediationTarget {
  readonly itemId: LearningItemId;
  readonly skillIds: readonly SkillId[];
  readonly weakSkillIds: readonly SkillId[];
  readonly priority: number;
  readonly attemptCount: number;
}

export interface CheckpointResult {
  readonly passed: boolean;
  readonly attemptCount: number;
  readonly overallScore: number | null;
  readonly minimumAttemptsMet: boolean;
  readonly overallScoreMet: boolean;
  readonly skillResults: readonly CheckpointSkillResult[];
  readonly remediation: readonly RemediationTarget[];
}

export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  minimumAttempts: 1,
  minimumOverallScore: 0.8,
  minimumScoreBySkill: {},
  outcomeScores: {
    correct: 1,
    incorrect: 0,
    skipped: 0,
    repaired: 1,
  },
  remediation: {
    limit: 3,
    outcomePenalties: {
      correct: 0,
      incorrect: 1,
      skipped: 0.75,
      repaired: 0.25,
    },
    skillDeficitWeight: 1,
    unattemptedPenalty: 0.5,
  },
};

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number in [0, 1]`);
  }
}

export function resolveCheckpointConfig(input: CheckpointConfigInput = {}): CheckpointConfig {
  const config: CheckpointConfig = {
    minimumAttempts: input.minimumAttempts ?? DEFAULT_CHECKPOINT_CONFIG.minimumAttempts,
    minimumOverallScore: input.minimumOverallScore ?? DEFAULT_CHECKPOINT_CONFIG.minimumOverallScore,
    minimumScoreBySkill: input.minimumScoreBySkill ?? DEFAULT_CHECKPOINT_CONFIG.minimumScoreBySkill,
    outcomeScores: {
      ...DEFAULT_CHECKPOINT_CONFIG.outcomeScores,
      ...input.outcomeScores,
    },
    remediation: {
      limit: input.remediation?.limit ?? DEFAULT_CHECKPOINT_CONFIG.remediation.limit,
      outcomePenalties: {
        ...DEFAULT_CHECKPOINT_CONFIG.remediation.outcomePenalties,
        ...input.remediation?.outcomePenalties,
      },
      skillDeficitWeight:
        input.remediation?.skillDeficitWeight ??
        DEFAULT_CHECKPOINT_CONFIG.remediation.skillDeficitWeight,
      unattemptedPenalty:
        input.remediation?.unattemptedPenalty ??
        DEFAULT_CHECKPOINT_CONFIG.remediation.unattemptedPenalty,
    },
  };

  if (!Number.isSafeInteger(config.minimumAttempts) || config.minimumAttempts < 0) {
    throw new RangeError("minimumAttempts must be a non-negative safe integer");
  }
  assertUnitInterval(config.minimumOverallScore, "minimumOverallScore");

  for (const [skillId, threshold] of Object.entries(config.minimumScoreBySkill)) {
    if (skillId.length === 0) {
      throw new TypeError("skill requirement id must not be empty");
    }
    assertUnitInterval(threshold, `minimum score for skill ${skillId}`);
  }

  for (const [outcome, score] of Object.entries(config.outcomeScores)) {
    assertUnitInterval(score, `score for outcome ${outcome}`);
  }

  if (!Number.isSafeInteger(config.remediation.limit) || config.remediation.limit < 0) {
    throw new RangeError("remediation limit must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(config.remediation.skillDeficitWeight) ||
    config.remediation.skillDeficitWeight < 0
  ) {
    throw new RangeError("skillDeficitWeight must be a non-negative finite number");
  }
  if (
    !Number.isFinite(config.remediation.unattemptedPenalty) ||
    config.remediation.unattemptedPenalty < 0
  ) {
    throw new RangeError("unattemptedPenalty must be a non-negative finite number");
  }
  for (const [outcome, penalty] of Object.entries(config.remediation.outcomePenalties)) {
    if (!Number.isFinite(penalty) || penalty < 0) {
      throw new RangeError(`penalty for outcome ${outcome} must be non-negative and finite`);
    }
  }

  return config;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreAttempt(attempt: Attempt, config: CheckpointConfig): number {
  const score = attempt.score ?? config.outcomeScores[attempt.outcome];
  assertUnitInterval(score, `score for attempt ${attempt.id}`);
  return score;
}

function validateAttempts(attempts: readonly Attempt[]): void {
  const attemptIds = new Set<string>();
  for (const attempt of attempts) {
    if (typeof attempt.id !== "string" || attempt.id.length === 0) {
      throw new TypeError("attempt id must be a non-empty string");
    }
    if (attemptIds.has(attempt.id)) {
      throw new TypeError(`duplicate attempt id: ${attempt.id}`);
    }
    attemptIds.add(attempt.id);

    if (typeof attempt.itemId !== "string" || attempt.itemId.length === 0) {
      throw new TypeError(`attempt ${attempt.id} itemId must be a non-empty string`);
    }
    if (!Array.isArray(attempt.skillIds)) {
      throw new TypeError(`attempt ${attempt.id} skillIds must be an array`);
    }
    if (attempt.score !== undefined) {
      assertUnitInterval(attempt.score, `score for attempt ${attempt.id}`);
    }
  }
}

interface SkillScoreInternal {
  readonly score: number | null;
  readonly threshold: number;
  readonly passed: boolean;
}

function selectRemediation(
  attempts: readonly Attempt[],
  candidates: readonly RemediationCandidate[],
  skillScores: ReadonlyMap<SkillId, SkillScoreInternal>,
  config: CheckpointConfig,
): RemediationTarget[] {
  if (config.remediation.limit === 0) {
    return [];
  }

  const attemptsByItem = new Map<LearningItemId, Attempt[]>();
  for (const attempt of attempts) {
    const existing = attemptsByItem.get(attempt.itemId);
    if (existing === undefined) {
      attemptsByItem.set(attempt.itemId, [attempt]);
    } else {
      existing.push(attempt);
    }
  }

  const candidateSkills = new Map<LearningItemId, Set<SkillId>>();
  for (const candidate of candidates) {
    const skills = candidateSkills.get(candidate.itemId) ?? new Set<SkillId>();
    for (const skillId of candidate.skillIds) {
      skills.add(skillId);
    }
    candidateSkills.set(candidate.itemId, skills);
  }
  for (const attempt of attempts) {
    const skills = candidateSkills.get(attempt.itemId) ?? new Set<SkillId>();
    for (const skillId of attempt.skillIds) {
      skills.add(skillId);
    }
    candidateSkills.set(attempt.itemId, skills);
  }

  const targets: RemediationTarget[] = [];
  for (const [itemId, skillSet] of candidateSkills) {
    const itemAttempts = attemptsByItem.get(itemId) ?? [];
    const penalty =
      itemAttempts.length === 0
        ? config.remediation.unattemptedPenalty
        : (average(
            itemAttempts.map((attempt) => config.remediation.outcomePenalties[attempt.outcome]),
          ) ?? 0);

    const weakSkillIds = [...skillSet]
      .filter((skillId) => skillScores.get(skillId)?.passed === false)
      .sort();
    const deficits = weakSkillIds.map((skillId) => {
      const skill = skillScores.get(skillId);
      if (skill === undefined) {
        return 0;
      }
      return skill.score === null ? skill.threshold : Math.max(0, skill.threshold - skill.score);
    });
    const skillDeficit = average(deficits) ?? 0;
    const priority = penalty + config.remediation.skillDeficitWeight * skillDeficit;

    if (priority > 0) {
      targets.push({
        itemId,
        skillIds: [...skillSet].sort(),
        weakSkillIds,
        priority,
        attemptCount: itemAttempts.length,
      });
    }
  }

  return targets
    .sort((left, right) => {
      const priorityDifference = right.priority - left.priority;
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      return left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0;
    })
    .slice(0, config.remediation.limit);
}

/**
 * Evaluates a checkpoint and returns a deterministic, item-level repair plan.
 * Optional candidates let the application include unattempted items in that plan.
 */
export function evaluateCheckpoint(
  attempts: readonly Attempt[],
  input: CheckpointConfigInput = {},
  candidates: readonly RemediationCandidate[] = [],
): CheckpointResult {
  const config = resolveCheckpointConfig(input);
  validateAttempts(attempts);
  const scores = attempts.map((attempt) => scoreAttempt(attempt, config));
  const overallScore = average(scores);
  const minimumAttemptsMet = attempts.length >= config.minimumAttempts;
  const overallScoreMet = overallScore !== null && overallScore >= config.minimumOverallScore;

  const skillResults: CheckpointSkillResult[] = [];
  const skillScores = new Map<SkillId, SkillScoreInternal>();
  const skillRequirements = Object.entries(config.minimumScoreBySkill).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  for (const [skillId, threshold] of skillRequirements) {
    const skillAttempts = attempts.filter((attempt) => attempt.skillIds.includes(skillId));
    const score = average(skillAttempts.map((attempt) => scoreAttempt(attempt, config)));
    const passed = score !== null && score >= threshold;
    skillResults.push({
      skillId,
      score,
      threshold,
      attemptCount: skillAttempts.length,
      passed,
    });
    skillScores.set(skillId, { score, threshold, passed });
  }

  const passed =
    minimumAttemptsMet && overallScoreMet && skillResults.every((result) => result.passed);
  const remediation = passed ? [] : selectRemediation(attempts, candidates, skillScores, config);

  return {
    passed,
    attemptCount: attempts.length,
    overallScore,
    minimumAttemptsMet,
    overallScoreMet,
    skillResults,
    remediation,
  };
}
