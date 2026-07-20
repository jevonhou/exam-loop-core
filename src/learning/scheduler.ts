import type {
  Attempt,
  AttemptOutcome,
  AttemptOutcomeCounts,
  LearningItemId,
  ReviewState,
} from "./types.js";

export type ReviewStepTransition =
  | { readonly kind: "advance"; readonly by: number }
  | { readonly kind: "hold" }
  | { readonly kind: "reset"; readonly to: number };

export type ReviewDelay =
  { readonly kind: "interval" } | { readonly kind: "fixed"; readonly delayMs: number };

export interface ReviewOutcomeRule {
  readonly transition: ReviewStepTransition;
  readonly delay: ReviewDelay;
  readonly countsAsSuccess: boolean;
}

export interface ReviewSchedulerConfig {
  /** Positive, ascending delays indexed by `ReviewState.step`. */
  readonly intervalsMs: readonly number[];
  readonly rules: Readonly<Record<AttemptOutcome, ReviewOutcomeRule>>;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const DEFAULT_REVIEW_SCHEDULER_CONFIG: ReviewSchedulerConfig = {
  intervalsMs: [10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY],
  rules: {
    correct: {
      transition: { kind: "advance", by: 1 },
      delay: { kind: "interval" },
      countsAsSuccess: true,
    },
    incorrect: {
      transition: { kind: "reset", to: 0 },
      delay: { kind: "fixed", delayMs: 10 * MINUTE },
      countsAsSuccess: false,
    },
    skipped: {
      transition: { kind: "hold" },
      delay: { kind: "fixed", delayMs: 10 * MINUTE },
      countsAsSuccess: false,
    },
    repaired: {
      transition: { kind: "advance", by: 1 },
      delay: { kind: "interval" },
      countsAsSuccess: true,
    },
  },
};

const EMPTY_OUTCOME_COUNTS: AttemptOutcomeCounts = {
  correct: 0,
  incorrect: 0,
  skipped: 0,
  repaired: 0,
};

const ATTEMPT_OUTCOMES: readonly AttemptOutcome[] = ["correct", "incorrect", "skipped", "repaired"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttemptOutcome(value: unknown): value is AttemptOutcome {
  return typeof value === "string" && ATTEMPT_OUTCOMES.includes(value as AttemptOutcome);
}

function assertEpochMilliseconds(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe-integer epoch millisecond`);
  }
}

function assertCounter(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

export function createReviewState(itemId: LearningItemId): ReviewState {
  if (typeof itemId !== "string" || itemId.length === 0) {
    throw new TypeError("itemId must not be empty");
  }

  return {
    itemId,
    step: -1,
    dueAt: null,
    lastAttemptAt: null,
    lastOutcome: null,
    attemptCount: 0,
    successStreak: 0,
    outcomeCounts: { ...EMPTY_OUTCOME_COUNTS },
  };
}

export function validateReviewSchedulerConfig(config: ReviewSchedulerConfig): void {
  const candidate: unknown = config;
  if (!isRecord(candidate)) {
    throw new TypeError("review scheduler config must be an object");
  }
  if (!Array.isArray(candidate.intervalsMs) || candidate.intervalsMs.length === 0) {
    throw new RangeError("intervalsMs must contain at least one interval");
  }

  let previous = 0;
  for (const interval of candidate.intervalsMs) {
    if (
      typeof interval !== "number" ||
      !Number.isSafeInteger(interval) ||
      interval <= 0 ||
      interval <= previous
    ) {
      throw new RangeError("intervalsMs must contain positive, strictly ascending safe integers");
    }
    previous = interval;
  }

  if (!isRecord(candidate.rules)) {
    throw new TypeError("review scheduler rules must be an object");
  }

  for (const outcome of ATTEMPT_OUTCOMES) {
    const rule = candidate.rules[outcome];
    if (!isRecord(rule)) {
      throw new TypeError(`review scheduler rule for ${outcome} is missing or invalid`);
    }
    if (typeof rule.countsAsSuccess !== "boolean") {
      throw new TypeError(`countsAsSuccess for ${outcome} must be a boolean`);
    }
    if (!isRecord(rule.transition)) {
      throw new TypeError(`transition for ${outcome} must be an object`);
    }
    const transition = rule.transition;

    switch (transition.kind) {
      case "advance":
        if (
          typeof transition.by !== "number" ||
          !Number.isSafeInteger(transition.by) ||
          transition.by <= 0
        ) {
          throw new RangeError(`advance step for ${outcome} must be a positive safe integer`);
        }
        break;
      case "hold":
        break;
      case "reset":
        if (
          typeof transition.to !== "number" ||
          !Number.isSafeInteger(transition.to) ||
          transition.to < 0
        ) {
          throw new RangeError(`reset step for ${outcome} must be a non-negative safe integer`);
        }
        break;
      default:
        throw new TypeError(`transition kind for ${outcome} is unsupported`);
    }

    if (!isRecord(rule.delay)) {
      throw new TypeError(`delay for ${outcome} must be an object`);
    }
    if (rule.delay.kind === "fixed") {
      if (
        typeof rule.delay.delayMs !== "number" ||
        !Number.isSafeInteger(rule.delay.delayMs) ||
        rule.delay.delayMs < 0
      ) {
        throw new RangeError(`fixed delay for ${outcome} must be a non-negative safe integer`);
      }
    } else if (rule.delay.kind !== "interval") {
      throw new TypeError(`delay kind for ${outcome} is unsupported`);
    }
  }
}

function assertReviewState(state: ReviewState, maximumStep: number): void {
  if (!isRecord(state)) {
    throw new TypeError("review state must be an object");
  }
  if (typeof state.itemId !== "string" || state.itemId.length === 0) {
    throw new TypeError("review state itemId must be a non-empty string");
  }
  if (!Number.isSafeInteger(state.step) || state.step < -1 || state.step > maximumStep) {
    throw new RangeError("review state step is outside the configured interval range");
  }
  if (state.dueAt !== null) {
    assertEpochMilliseconds(state.dueAt, "review state dueAt");
  }
  if (state.lastAttemptAt !== null) {
    assertEpochMilliseconds(state.lastAttemptAt, "review state lastAttemptAt");
  }
  if (state.lastOutcome !== null && !isAttemptOutcome(state.lastOutcome)) {
    throw new TypeError("review state lastOutcome is invalid");
  }
  assertCounter(state.attemptCount, "review state attemptCount");
  assertCounter(state.successStreak, "review state successStreak");
  if (!isRecord(state.outcomeCounts)) {
    throw new TypeError("review state outcomeCounts must be an object");
  }

  let outcomeTotal = 0;
  for (const outcome of ATTEMPT_OUTCOMES) {
    const count = state.outcomeCounts[outcome];
    assertCounter(count, `review state outcomeCounts.${outcome}`);
    outcomeTotal += count;
  }
  if (!Number.isSafeInteger(outcomeTotal) || outcomeTotal !== state.attemptCount) {
    throw new RangeError("review state outcome counts must sum to attemptCount");
  }
  if (state.successStreak > state.attemptCount) {
    throw new RangeError("review state successStreak cannot exceed attemptCount");
  }
}

export function validateReviewState(
  state: ReviewState,
  config: ReviewSchedulerConfig = DEFAULT_REVIEW_SCHEDULER_CONFIG,
): void {
  validateReviewSchedulerConfig(config);
  assertReviewState(state, config.intervalsMs.length - 1);
}

function transitionStep(
  currentStep: number,
  transition: ReviewStepTransition,
  maximumStep: number,
): number {
  const normalizedCurrent = Math.max(0, currentStep);

  switch (transition.kind) {
    case "advance":
      return Math.min(maximumStep, currentStep < 0 ? 0 : normalizedCurrent + transition.by);
    case "hold":
      return Math.min(maximumStep, normalizedCurrent);
    case "reset":
      return Math.min(maximumStep, transition.to);
  }
}

function incrementOutcomeCount(
  counts: AttemptOutcomeCounts,
  outcome: AttemptOutcome,
): AttemptOutcomeCounts {
  return {
    ...counts,
    [outcome]: counts[outcome] + 1,
  };
}

/**
 * Applies one chronologically ordered attempt to an item's review state.
 * No clock or randomness is read; the same inputs always produce the same state.
 */
export function scheduleAttempt(
  state: ReviewState | undefined,
  attempt: Attempt,
  config: ReviewSchedulerConfig = DEFAULT_REVIEW_SCHEDULER_CONFIG,
): ReviewState {
  validateReviewSchedulerConfig(config);

  if (typeof attempt.itemId !== "string" || attempt.itemId.length === 0) {
    throw new TypeError("attempt itemId must be a non-empty string");
  }
  if (!isAttemptOutcome(attempt.outcome)) {
    throw new TypeError("attempt outcome is invalid");
  }
  assertEpochMilliseconds(attempt.occurredAt, "attempt.occurredAt");

  const current = state ?? createReviewState(attempt.itemId);
  assertReviewState(current, config.intervalsMs.length - 1);
  if (current.itemId !== attempt.itemId) {
    throw new TypeError("attempt itemId does not match review state itemId");
  }

  if (current.lastAttemptAt !== null && attempt.occurredAt < current.lastAttemptAt) {
    throw new RangeError("attempts must be scheduled in chronological order");
  }

  const rule = config.rules[attempt.outcome];
  const step = transitionStep(current.step, rule.transition, config.intervalsMs.length - 1);
  const interval = config.intervalsMs[step];
  if (interval === undefined) {
    throw new Error("scheduler resolved an interval outside the configured range");
  }

  const delay = rule.delay.kind === "fixed" ? rule.delay.delayMs : interval;
  const dueAt = attempt.occurredAt + delay;
  if (!Number.isSafeInteger(dueAt)) {
    throw new RangeError("scheduled dueAt exceeds the safe-integer range");
  }

  return {
    itemId: current.itemId,
    step,
    dueAt,
    lastAttemptAt: attempt.occurredAt,
    lastOutcome: attempt.outcome,
    attemptCount: current.attemptCount + 1,
    successStreak: rule.countsAsSuccess ? current.successStreak + 1 : 0,
    outcomeCounts: incrementOutcomeCount(current.outcomeCounts, attempt.outcome),
  };
}

/** Returns due states in stable due-time/item-id order. */
export function getDueReviewStates(states: readonly ReviewState[], now: number): ReviewState[] {
  assertEpochMilliseconds(now, "now");

  return states
    .filter((state) => state.dueAt !== null && state.dueAt <= now)
    .sort((left, right) => {
      const dueDifference = (left.dueAt ?? 0) - (right.dueAt ?? 0);
      if (dueDifference !== 0) {
        return dueDifference;
      }
      return left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0;
    });
}
