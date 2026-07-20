import { createSeededRandom, shuffle } from "./random.js";
import type { RandomSeed, RandomSource } from "./random.js";
import type { Attempt, LearningItem, SkillId } from "./types.js";

export interface QuestionDraft<TQuestion = unknown> {
  readonly payload: TQuestion;
  /** Defaults to the source item's skills when omitted. */
  readonly skillIds?: readonly SkillId[];
}

export interface SessionQuestion<TQuestion = unknown> {
  readonly id: string;
  readonly itemId: string;
  readonly adapterId: string;
  readonly skillIds: readonly SkillId[];
  readonly payload: TQuestion;
}

export interface PlannedSession<TQuestion = unknown> {
  readonly id: string;
  readonly questions: readonly SessionQuestion<TQuestion>[];
}

export interface QuestionCreationContext<TItemPayload = unknown> {
  readonly sessionId: string;
  readonly position: number;
  readonly item: LearningItem<TItemPayload>;
  readonly random: RandomSource;
}

export interface AnswerEvaluationContext<
  TItemPayload = unknown,
  TQuestion = unknown,
  TAnswer = unknown,
> {
  readonly item: LearningItem<TItemPayload>;
  readonly question: SessionQuestion<TQuestion>;
  readonly answer: TAnswer;
}

export interface EvaluationResult<TFeedback = unknown> {
  readonly correct: boolean;
  /** Normalized score in the inclusive range [0, 1]. */
  readonly score: number;
  readonly errorCode?: string;
  readonly feedback?: TFeedback;
}

/**
 * An application-defined adapter controls question creation and answer semantics.
 * The core ships no built-in subject, prompt, or answer type.
 */
export interface QuestionAdapter<
  TItemPayload = unknown,
  TQuestion = unknown,
  TAnswer = unknown,
  TFeedback = unknown,
> {
  readonly id: string;
  supports(item: LearningItem<TItemPayload>): boolean;
  create(context: QuestionCreationContext<TItemPayload>): QuestionDraft<TQuestion> | null;
  evaluate(
    context: AnswerEvaluationContext<TItemPayload, TQuestion, TAnswer>,
  ): EvaluationResult<TFeedback>;
}

export interface SessionPlanOptions {
  readonly sessionId: string;
  readonly size: number;
  readonly seed?: RandomSeed;
  readonly random?: RandomSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function validatePlanInputs<TItemPayload, TQuestion, TAnswer, TFeedback>(
  items: readonly LearningItem<TItemPayload>[],
  adapters: readonly QuestionAdapter<TItemPayload, TQuestion, TAnswer, TFeedback>[],
  options: SessionPlanOptions,
): void {
  if (!Array.isArray(items)) {
    throw new TypeError("learning items must be an array");
  }
  if (!Array.isArray(adapters)) {
    throw new TypeError("question adapters must be an array");
  }
  if (!isRecord(options)) {
    throw new TypeError("session options must be an object");
  }
  assertNonEmptyString(options.sessionId, "sessionId");
  if (!Number.isSafeInteger(options.size) || options.size < 0) {
    throw new RangeError("session size must be a non-negative safe integer");
  }
  if (
    options.seed !== undefined &&
    ((typeof options.seed !== "string" && typeof options.seed !== "number") ||
      (typeof options.seed === "number" && !Number.isFinite(options.seed)))
  ) {
    throw new TypeError("session seed must be a string or finite number");
  }
  if (options.random !== undefined && typeof options.random !== "function") {
    throw new TypeError("session random must be a function");
  }
  if (options.seed !== undefined && options.random !== undefined) {
    throw new TypeError("provide either seed or random, not both");
  }

  const itemIds = new Set<string>();
  for (const item of items) {
    if (!isRecord(item)) {
      throw new TypeError("learning item must be an object");
    }
    assertNonEmptyString(item.id, "learning item id");
    assertSkillIds(item.skillIds, `learning item ${item.id}`);
    if (itemIds.has(item.id)) {
      throw new TypeError(`duplicate learning item id: ${item.id}`);
    }
    itemIds.add(item.id);
  }

  const adapterIds = new Set<string>();
  for (const adapter of adapters) {
    if (!isRecord(adapter)) {
      throw new TypeError("question adapter must be an object");
    }
    assertNonEmptyString(adapter.id, "question adapter id");
    if (
      typeof adapter.supports !== "function" ||
      typeof adapter.create !== "function" ||
      typeof adapter.evaluate !== "function"
    ) {
      throw new TypeError(
        `question adapter ${adapter.id} must implement supports, create, and evaluate`,
      );
    }
    if (adapterIds.has(adapter.id)) {
      throw new TypeError(`duplicate question adapter id: ${adapter.id}`);
    }
    adapterIds.add(adapter.id);
  }
}

function assertSkillIds(value: unknown, owner: string): asserts value is readonly SkillId[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${owner} skillIds must be an array`);
  }

  const seen = new Set<string>();
  for (const skillId of value) {
    if (typeof skillId !== "string" || skillId.length === 0) {
      throw new TypeError(`${owner} skillIds must contain non-empty strings`);
    }
    if (seen.has(skillId)) {
      throw new TypeError(`${owner} contains duplicate skill id: ${skillId}`);
    }
    seen.add(skillId);
  }
}

function assertEvaluationResult(value: unknown): void {
  if (!isRecord(value)) {
    throw new TypeError("adapter evaluation must return an object");
  }

  const result = value as Partial<EvaluationResult<unknown>>;
  if (typeof result.correct !== "boolean") {
    throw new TypeError("adapter evaluation correct must be a boolean");
  }
  if (
    typeof result.score !== "number" ||
    !Number.isFinite(result.score) ||
    result.score < 0 ||
    result.score > 1
  ) {
    throw new RangeError("adapter score must be a finite number in [0, 1]");
  }
  if (
    result.errorCode !== undefined &&
    (typeof result.errorCode !== "string" || result.errorCode.trim().length === 0)
  ) {
    throw new TypeError("adapter errorCode must be a non-empty string when provided");
  }
}

function resolveRandom(options: SessionPlanOptions): RandomSource {
  if (options.random !== undefined) {
    return options.random;
  }
  return createSeededRandom(options.seed ?? options.sessionId);
}

/**
 * Plans at most one question per item. Unsupported items and adapters returning
 * `null` are skipped, so a plan can contain fewer than the requested size.
 */
export function planSession<TItemPayload, TQuestion, TAnswer, TFeedback = unknown>(
  items: readonly LearningItem<TItemPayload>[],
  adapters: readonly QuestionAdapter<TItemPayload, TQuestion, TAnswer, TFeedback>[],
  options: SessionPlanOptions,
): PlannedSession<TQuestion> {
  validatePlanInputs(items, adapters, options);
  if (options.size === 0 || items.length === 0 || adapters.length === 0) {
    return { id: options.sessionId, questions: [] };
  }

  const random = resolveRandom(options);
  const questions: SessionQuestion<TQuestion>[] = [];

  for (const item of shuffle(items, random)) {
    if (questions.length >= options.size) {
      break;
    }

    const supportedAdapters = adapters.filter((adapter) => {
      const supported = adapter.supports(item);
      if (typeof supported !== "boolean") {
        throw new TypeError(`question adapter ${adapter.id} supports must return a boolean`);
      }
      return supported;
    });
    for (const adapter of shuffle(supportedAdapters, random)) {
      const draft = adapter.create({
        sessionId: options.sessionId,
        position: questions.length,
        item,
        random,
      });

      if (draft === null) {
        continue;
      }

      if (!isRecord(draft)) {
        throw new TypeError(`question adapter ${adapter.id} must return an object or null`);
      }

      const skillIds = draft.skillIds ?? item.skillIds;
      assertSkillIds(skillIds, `question adapter ${adapter.id}`);

      questions.push({
        id: `${options.sessionId}:${questions.length + 1}`,
        itemId: item.id,
        adapterId: adapter.id,
        skillIds: [...skillIds],
        payload: draft.payload,
      });
      break;
    }
  }

  return { id: options.sessionId, questions };
}

/** Evaluates one planned answer with the adapter that created the question. */
export function evaluateSessionAnswer<TItemPayload, TQuestion, TAnswer, TFeedback = unknown>(
  question: SessionQuestion<TQuestion>,
  item: LearningItem<TItemPayload>,
  answer: TAnswer,
  adapters: readonly QuestionAdapter<TItemPayload, TQuestion, TAnswer, TFeedback>[],
): EvaluationResult<TFeedback> {
  if (!isRecord(question)) {
    throw new TypeError("session question must be an object");
  }
  assertNonEmptyString(question.itemId, "session question itemId");
  assertNonEmptyString(question.adapterId, "session question adapterId");
  assertSkillIds(question.skillIds, "session question");
  if (!isRecord(item)) {
    throw new TypeError("learning item must be an object");
  }
  assertNonEmptyString(item.id, "learning item id");
  const adapterInput: unknown = adapters;
  if (!Array.isArray(adapterInput)) {
    throw new TypeError("question adapters must be an array");
  }
  if (item.id !== question.itemId) {
    throw new TypeError("question itemId does not match the supplied learning item");
  }

  const adapter = adapters.find((candidate) => candidate.id === question.adapterId);
  if (adapter === undefined) {
    throw new TypeError(`question adapter not found: ${question.adapterId}`);
  }
  if (typeof adapter.evaluate !== "function") {
    throw new TypeError(`question adapter ${adapter.id} must implement evaluate`);
  }

  const result = adapter.evaluate({ item, question, answer });
  assertEvaluationResult(result);

  return result;
}

export interface AttemptFromEvaluationOptions<TAnswer = unknown> {
  readonly attemptId: string;
  readonly occurredAt: number;
  readonly answer?: TAnswer;
  readonly durationMs?: number;
  readonly sessionId?: string;
  /** A correct answer in a repair round is normalized to `repaired`. */
  readonly repair?: boolean;
}

/** Converts an adapter result into the scheduler's normalized attempt shape. */
export function attemptFromEvaluation<TQuestion, TAnswer>(
  question: SessionQuestion<TQuestion>,
  evaluation: EvaluationResult,
  options: AttemptFromEvaluationOptions<TAnswer>,
): Attempt<TAnswer> {
  if (!isRecord(question)) {
    throw new TypeError("session question must be an object");
  }
  assertNonEmptyString(question.itemId, "session question itemId");
  assertSkillIds(question.skillIds, "session question");
  assertEvaluationResult(evaluation);
  if (!isRecord(options)) {
    throw new TypeError("attempt options must be an object");
  }
  assertNonEmptyString(options.attemptId, "attemptId");
  if (!Number.isSafeInteger(options.occurredAt) || options.occurredAt < 0) {
    throw new RangeError("occurredAt must be a non-negative safe-integer epoch millisecond");
  }
  if (
    options.durationMs !== undefined &&
    (!Number.isSafeInteger(options.durationMs) || options.durationMs < 0)
  ) {
    throw new RangeError("durationMs must be a non-negative safe integer");
  }
  if (options.sessionId !== undefined) {
    assertNonEmptyString(options.sessionId, "attempt sessionId");
  }
  if (options.repair !== undefined && typeof options.repair !== "boolean") {
    throw new TypeError("attempt repair must be a boolean");
  }

  const outcome = evaluation.correct
    ? options.repair === true
      ? "repaired"
      : "correct"
    : "incorrect";

  return {
    id: options.attemptId,
    itemId: question.itemId,
    skillIds: [...question.skillIds],
    outcome,
    score: evaluation.score,
    ...(evaluation.errorCode === undefined ? {} : { errorCode: evaluation.errorCode }),
    occurredAt: options.occurredAt,
    ...(options.answer === undefined ? {} : { answer: options.answer }),
    ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  };
}
