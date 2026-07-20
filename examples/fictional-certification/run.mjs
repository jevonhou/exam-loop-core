import { readFile } from "node:fs/promises";

import {
  attemptFromEvaluation,
  createArchive,
  evaluateCheckpoint,
  evaluateSessionAnswer,
  planSession,
  scheduleAttempt,
  serializeArchive,
  validateContentPackage,
  verifyArchive,
} from "../../dist/index.js";

const contentUrl = new URL("./content-package.json", import.meta.url);
const unknownContent = JSON.parse(await readFile(contentUrl, "utf8"));
const validation = validateContentPackage(unknownContent);

if (!validation.valid) {
  throw new Error(`Content package is invalid: ${JSON.stringify(validation.issues)}`);
}

function isChoicePrompt(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.prompt === "string" &&
    Array.isArray(value.choices) &&
    value.choices.every(
      (choice) =>
        typeof choice === "object" &&
        choice !== null &&
        typeof choice.id === "string" &&
        typeof choice.label === "string",
    ) &&
    typeof value.correctChoiceId === "string"
  );
}

const items = validation.value.items.map((item) => {
  if (!isChoicePrompt(item.payload)) {
    throw new Error(`Unsupported example payload: ${item.id}`);
  }

  return {
    id: item.id,
    skillIds: item.skillIds,
    payload: item.payload,
  };
});

const choiceAdapter = {
  id: "single-choice",
  supports: (item) => isChoicePrompt(item.payload),
  create: ({ item }) => ({
    payload: {
      prompt: item.payload.prompt,
      choices: item.payload.choices,
    },
  }),
  evaluate: ({ item, answer }) => {
    if (!isChoicePrompt(item.payload)) {
      throw new TypeError("The adapter received an unsupported payload.");
    }

    const correct = answer === item.payload.correctChoiceId;
    return {
      correct,
      score: correct ? 1 : 0,
      feedback: correct ? "accepted" : "retry",
    };
  },
};

const session = planSession(items, [choiceAdapter], {
  sessionId: "example-session",
  size: 3,
  seed: "repeatable-example",
});

const attempts = session.questions.map((question, index) => {
  const item = items.find((candidate) => candidate.id === question.itemId);
  if (item === undefined || !isChoicePrompt(item.payload)) {
    throw new Error(`Missing item for question ${question.id}`);
  }

  const answer = index === 1 ? "deliberately-wrong" : item.payload.correctChoiceId;
  const evaluation = evaluateSessionAnswer(question, item, answer, [choiceAdapter]);

  return attemptFromEvaluation(question, evaluation, {
    attemptId: `attempt-${index + 1}`,
    occurredAt: Date.UTC(2026, 0, 1, 9, index),
    answer,
    sessionId: session.id,
  });
});

const reviewStates = attempts.map((attempt) => scheduleAttempt(undefined, attempt));
const checkpoint = evaluateCheckpoint(
  attempts,
  {
    minimumAttempts: 3,
    minimumOverallScore: 0.8,
    minimumScoreBySkill: {
      "rule-lookup": 0.7,
      "sequence-reasoning": 0.7,
    },
  },
  items.map(({ id, skillIds }) => ({ itemId: id, skillIds })),
);

const archive = await createArchive(
  { checkpoint, reviewStates },
  { createdAt: "2026-01-01T10:00:00.000Z" },
);
const serializedArchive = serializeArchive(archive);
const verifiedArchive = await verifyArchive(serializedArchive);

if (!verifiedArchive.ok) {
  throw new Error(`Archive verification failed: ${verifiedArchive.code}`);
}

console.log(
  JSON.stringify(
    {
      contentPackage: validation.value.id,
      plannedQuestions: session.questions.length,
      outcomes: attempts.map(({ itemId, outcome }) => ({ itemId, outcome })),
      checkpointPassed: checkpoint.passed,
      remediationItemIds: checkpoint.remediation.map(({ itemId }) => itemId),
      archiveChecksum: verifiedArchive.archive.checksum,
    },
    null,
    2,
  ),
);
