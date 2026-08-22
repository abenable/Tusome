// Per-question breakdown for the teacher view — renders, for one student's
// attempts on one topic, exactly what each attempt looked like: the questions
// in the order the student saw them (reconstructed from the persisted seed),
// the student's answers (option TEXT, not ids), and a right/wrong marker.
//
// DESIGN.md voice: 17px body, right/wrong differ by WEIGHT + a ✓/✗ text marker
// (NOT a second brand color — no green/red). ≥44px targets on controls. No
// shadows on chrome. The drawer is a plain disclosure list: one expandable
// row per attempt, toggled with a <button aria-expanded>.
//
// Data flow:
//   - `reconstructOrder(attempt.seed, topic.quiz)` reproduces the question order
//     + per-question option display order the student saw. If `seed` is null
//     (a pre-Phase-5 / pre-randomization row), we fall back to the authored
//     order — i.e. treat it as "no shuffle". That's documented below; the
//     fallback is safe because authored order is a valid order.
//   - `attempt.answers_json` is parsed to a Record<questionId, AnswerValue>;
//     `AnswerValue` is option id (single) | option id[] (multi) | number
//     (numeric), matching what the quiz route persists.
//   - Right/wrong uses the shared `gradeAnswer` from src/lib/quiz-grade.ts — the
//     SAME rules the quiz route uses, so the breakdown can never disagree with
//     the score the student earned.
//
// No DB access here — the parent (TeacherDashboard) loads the attempts and
// passes them in. This keeps the component testable in isolation and avoids
// a second DB read when the table cell click already implies we want them.

import { useState, type JSX } from "react";

import type { QuestionT, TopicT } from "@/content/schema";
import type { QuizAttemptRow } from "@/db/index";
import { reconstructOrder, type QuizOrder } from "@/lib/rng";
import { gradeAnswer, type AnswerValue } from "@/lib/quiz-grade";

export type QuestionBreakdownProps = {
  topic: TopicT;
  studentId: number;
  /** All attempts for this student+topic, oldest first (db orders by taken_at). */
  attempts: QuizAttemptRow[];
};

export function QuestionBreakdown({
  topic,
  studentId,
  attempts,
}: QuestionBreakdownProps): JSX.Element {
  const [openId, setOpenId] = useState<number | null>(
    attempts.length > 0 ? attempts[attempts.length - 1].id : null,
  );

  if (attempts.length === 0) {
    return (
      <section
        aria-label={`No attempts for student ${studentId} on ${topic.title}`}
      >
        <p className="font-sans text-[17px] leading-relaxed text-ink-3">
          No attempts recorded for this student on this topic.
        </p>
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={`Attempts for student ${studentId} on ${topic.title}`}
    >
      <p className="font-sans text-[14px] text-ink-3">
        {attempts.length} attempt{attempts.length === 1 ? "" : "s"} ·{" "}
        {topic.quiz.length} question{topic.quiz.length === 1 ? "" : "s"} each
      </p>
      <ul className="flex flex-col gap-3">
        {attempts.map((attempt) => {
          const open = openId === attempt.id;
          return (
            <li
              key={attempt.id}
              className="rounded-[20px] border border-line bg-surface px-5 py-4"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : attempt.id)}
                aria-expanded={open}
                aria-controls={`breakdown-attempt-${attempt.id}`}
                className="flex min-h-[44px] w-full items-center justify-between gap-4 font-sans text-[17px] text-ink"
              >
                <span className="text-left">
                  <span className="font-semibold">
                    Score: {attempt.score} / {attempt.max_score}
                  </span>
                  <span className="text-ink-3"> · {attempt.taken_at}</span>
                </span>
                <span className="text-[14px] text-brand">
                  {open ? "Hide" : "Show"}
                </span>
              </button>
              {open ? (
                <AttemptDetail
                  id={`breakdown-attempt-${attempt.id}`}
                  topic={topic}
                  attempt={attempt}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// One attempt, expanded — the reconstructed question list.
// ──────────────────────────────────────────────────────────────────────────

function AttemptDetail({
  id,
  topic,
  attempt,
}: {
  id: string;
  topic: TopicT;
  attempt: QuizAttemptRow;
}): JSX.Element {
  // Reconstruct the exact order the student saw. `seed` is null only for
  // pre-Phase-5 rows (randomization is always-on from W4); fall back to the
  // authored order, which is a valid order — just not shuffled. Using a seed
  // of 0 would NOT reproduce authored order (0 still shuffles), so the clean
  // fallback is to build a QuizOrder straight from the authored array.
  const order: QuizOrder =
    attempt.seed === null
      ? authoredOrder(topic.quiz)
      : reconstructOrder(attempt.seed, topic.quiz);

  // answers_json is the verbatim JSON.stringify the quiz route wrote. Parse
  // defensively — a malformed row (shouldn't happen, but the table is
  // append-only data we don't control) degrades to "no answer" per question
  // rather than crashing the whole drawer.
  let answers: Record<string, AnswerValue> = {};
  try {
    const parsed = JSON.parse(attempt.answers_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      answers = parsed as Record<string, AnswerValue>;
    }
  } catch {
    // leave answers empty — each question renders as "no answer"
  }

  return (
    <ol id={id} className="mt-4 flex flex-col gap-5">
      {order.questions.map((q, i) => (
        <QuestionRow
          key={q.id}
          index={i}
          question={q}
          optionOrder={order.optionOrders[q.id] ?? []}
          answer={answers[q.id]}
        />
      ))}
    </ol>
  );
}

function QuestionRow({
  index,
  question,
  optionOrder,
  answer,
}: {
  index: number;
  question: QuestionT;
  optionOrder: number[];
  answer: AnswerValue | undefined;
}): JSX.Element {
  const correct = gradeAnswer(question, answer);
  // The display order of options: map the original indices back to option
  // objects, exactly as the quiz rendered them. Empty for numeric (no options).
  const authoredOptions = question.options ?? [];
  const displayOptions = optionOrder.length
    ? optionOrder.map((origIdx) => authoredOptions[origIdx])
    : authoredOptions;

  const answerText = renderAnswer(question, answer, displayOptions);
  const correctText = renderCorrect(question, displayOptions);

  // The verdict circle is decorative: `aria-hidden`, and the same verdict is
  // spelled out in the line beneath it ("· Correct" / "· Correct answer: X").
  // These are the app's only red/green, and neither is load-bearing alone.
  return (
    <li className="flex items-start gap-3 rounded-xl bg-canvas px-[14px] py-3">
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-extrabold text-white ${
          correct ? "bg-good" : "bg-bad"
        }`}
      >
        {correct ? "✓" : "✕"}
      </span>
      <div className="min-w-0">
        <p className="font-sans text-[15px] font-semibold leading-snug text-ink">
          {index + 1}. {question.prompt}
        </p>
        <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-3">
          Answered: “{answerText}”
          {correct ? " · Correct" : ` · Correct answer: ${correctText}`}
        </p>
        {question.explanation ? (
          <p className="mt-1 font-sans text-[12px] leading-relaxed text-ink-3">
            {question.explanation}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Answer / correct text rendering helpers
// ──────────────────────────────────────────────────────────────────────────

type DisplayOption = { id: string; text: string };

/** Render the student's answer as option TEXT(s) or the number, not raw ids. */
function renderAnswer(
  question: QuestionT,
  answer: AnswerValue | undefined,
  displayOptions: DisplayOption[],
): string {
  if (answer === undefined) return "— (no answer)";
  if (question.kind === "single") {
    if (typeof answer !== "string") return "— (no answer)";
    const opt = displayOptions.find((o) => o.id === answer);
    return opt ? opt.text : answer;
  }
  if (question.kind === "multi") {
    if (!Array.isArray(answer) || answer.length === 0) return "— (no answer)";
    const texts = answer.map((id) => {
      const opt = displayOptions.find((o) => o.id === id);
      return opt ? opt.text : id;
    });
    return texts.join(", ");
  }
  // numeric
  if (typeof answer !== "number" || !Number.isFinite(answer))
    return "— (no answer)";
  return String(answer);
}

/** Render the correct answer text — shown only for wrong answers. */
function renderCorrect(
  question: QuestionT,
  displayOptions: DisplayOption[],
): string {
  if (question.kind === "numeric") {
    return question.correct[0];
  }
  const texts = question.correct.map((id) => {
    const opt = displayOptions.find((o) => o.id === id);
    return opt ? opt.text : id;
  });
  return texts.join(", ");
}

/**
 * Build a QuizOrder that matches the authored (un-shuffled) order — the
 * fallback for a NULL seed (pre-Phase-5 row). Questions in authored order;
 * options in authored order; no rng draws. This is what `reconstructOrder`
 * would produce iff the shuffle were a no-op, so the rendering code can treat
 * both paths uniformly.
 */
function authoredOrder(questions: QuestionT[]): QuizOrder {
  const optionOrders: Record<string, number[]> = {};
  for (const q of questions) {
    optionOrders[q.id] = q.kind === "numeric" ? [] : (q.options ?? []).map((_, i) => i);
  }
  return { questions: questions.slice(), optionOrders };
}
