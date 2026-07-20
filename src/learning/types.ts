/** An application-defined identifier for a learning skill or knowledge dimension. */
export type SkillId = string;

/** An application-defined identifier for a learning item. */
export type LearningItemId = string;

/** An application-defined identifier for a recorded attempt. */
export type AttemptId = string;

/**
 * A content-agnostic unit that can be planned into a learning session.
 *
 * The core never inspects `payload`; rendering and answer semantics belong to
 * the integrating application and its question adapters.
 */
export interface LearningItem<TPayload = unknown> {
  readonly id: LearningItemId;
  readonly skillIds: readonly SkillId[];
  readonly payload: TPayload;
  readonly difficulty?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Outcomes understood by the review scheduler and checkpoint gate. */
export type AttemptOutcome = "correct" | "incorrect" | "skipped" | "repaired";

/**
 * A normalized learning attempt. Timestamps are epoch milliseconds supplied by
 * the application so that all core algorithms remain deterministic.
 */
export interface Attempt<TAnswer = unknown> {
  readonly id: AttemptId;
  readonly itemId: LearningItemId;
  readonly skillIds: readonly SkillId[];
  readonly outcome: AttemptOutcome;
  /** Optional normalized score in [0, 1], preserving partial credit. */
  readonly score?: number;
  /** Application-defined stable error classification from answer evaluation. */
  readonly errorCode?: string;
  readonly occurredAt: number;
  readonly answer?: TAnswer;
  readonly durationMs?: number;
  readonly sessionId?: string;
}

export type AttemptOutcomeCounts = Readonly<Record<AttemptOutcome, number>>;

/** Persistent scheduling state for one learning item. */
export interface ReviewState {
  readonly itemId: LearningItemId;
  /** Index into the configured interval list. `-1` means not scheduled yet. */
  readonly step: number;
  readonly dueAt: number | null;
  readonly lastAttemptAt: number | null;
  readonly lastOutcome: AttemptOutcome | null;
  readonly attemptCount: number;
  readonly successStreak: number;
  readonly outcomeCounts: AttemptOutcomeCounts;
}
