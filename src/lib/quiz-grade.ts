// Pure quiz-answer grading — the single source of truth for "right / wrong".
//
// The quiz route (src/routes/$subject/$topicId/quiz.tsx) had this logic inline
// as `isCorrect(q)`. W6 needs the SAME rules to mark a stored attempt's
// answers in the teacher breakdown, and duplicating the rules across two
// files is exactly how they drift. So: the rules live here once, both call
// sites import this, and `quiz-grade.test.ts` pins the edge cases.
//
// Rules (mirroring the quiz route exactly):
//   single  → answer is the chosen option id (string); right iff
//             it equals question.correct[0].
//   multi   → answer is the chosen option ids (string[]); right iff the set
//             is equal to question.correct (order-independent).
//   numeric → answer is a number; right iff |answer - Number(correct[0])|
//             <= (tolerance ?? 0).
//
// Answers are keyed by option ID, never by display position, so shuffling the
// option order does NOT change grading — this is what makes reconstructOrder
// purely a display concern.

import type { QuestionT } from "@/content/schema";

/** Per-question answer value as persisted in `quiz_attempts.answers_json`. */
export type AnswerValue = string | string[] | number;

/**
 * Grade a single answer against a question. Returns true if the answer is
 * correct, false otherwise (including "no answer recorded" — undefined is
 * treated as not answered, hence wrong).
 *
 * `answer` is `unknown` on purpose: `answers_json` is parsed from JSON, so the
 * shape is only as good as what was written. The grader defends against the
 * wrong kind landing there (e.g. a number where a string was expected) by
 * returning false rather than throwing.
 */
export function gradeAnswer(
  question: QuestionT,
  answer: AnswerValue | undefined,
): boolean {
  if (answer === undefined) return false;

  if (question.kind === "single") {
    return typeof answer === "string" && answer === question.correct[0];
  }

  if (question.kind === "multi") {
    if (!Array.isArray(answer)) return false;
    const chosen = answer.filter((x): x is string => typeof x === "string");
    // Set-equality on the chosen vs correct id sets. Sort + join with a
    // unit-separator (\u0001) so ids containing commas don't collide.
    const chosenKey = [...chosen].sort().join("\u0001");
    const expectedKey = [...question.correct].sort().join("\u0001");
    return chosenKey === expectedKey;
  }

  // numeric
  if (typeof answer !== "number" || !Number.isFinite(answer)) return false;
  const target = Number(question.correct[0]);
  const tol = question.tolerance ?? 0;
  return Math.abs(answer - target) <= tol;
}
