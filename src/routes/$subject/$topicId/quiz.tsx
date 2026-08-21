import { useState } from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { SUBJECT_LABELS, isSubject } from "@/lib/subjects"
import { type QuestionT, type TopicT } from "@/content/schema"

// Cross-builder seam (content-author). See sibling $subject/index.tsx.
import { findTopicInPacks, loadPacksCached } from "@/content/loader"

// Data layer (db-author). Phase-1 write path: exactly one quiz_attempts
// INSERT and one progress upsert per submit. See src/db/index.ts.
import { ensureSeedStudent, recordAttempt, upsertProgress } from "@/db/index"

import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/$subject/$topicId/quiz")({
  beforeLoad: ({ params }) => {
    if (!isSubject(params.subject)) {
      throw notFound()
    }
  },
  loader: async ({ params, context }): Promise<{ topic: TopicT | null }> => {
    try {
      const { packs } = await loadPacksCached(context.queryClient)
      const topic = findTopicInPacks(packs, params.topicId)
      return { topic }
    } catch {
      return { topic: null }
    }
  },
  component: QuizShell,
})

function QuizShell() {
  const { subject, topicId } = Route.useParams()
  const { topic } = Route.useLoaderData()

  if (!topic) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink subject={subject} topicId={topicId} />
        <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          Topic not found
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#7a7a7a]">
          This topic isn’t available yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <BackLink subject={subject} topicId={topicId} />

      <header className="flex flex-col gap-2">
        <p className="font-sans text-[14px] uppercase tracking-wide text-[#7a7a7a]">
          Quiz
        </p>
        <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          Quiz: {topic.title}
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          {topic.quiz.length} question{topic.quiz.length === 1 ? "" : "s"}.
        </p>
      </header>

      <Quiz topic={topic} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Quiz — the Phase-1 dumb quiz.
//
// Goal (04-vertical-slice.md step 5): prove the SQLite write path. Render the
// topic's questions, give immediate per-question feedback + the explanation
// (shown regardless of correctness), then on submit write exactly one
// `quiz_attempts` row and one `progress` upsert. The real quiz engine lands in
// Phase 5 (06-app-features.md); keep this dumb.
// ──────────────────────────────────────────────────────────────────────────

// Per-question answer value:
//   single  → the chosen option id (string)
//   multi   → the chosen option ids (string[])
//   numeric → a number
// A question that has not been answered yet simply has no key in `answers`.
type AnswerValue = string | string[] | number

function Quiz({ topic }: { topic: TopicT }) {
  const questions = topic.quiz
  const maxScore = questions.length

  // Three local state slices, no library (state-ownership rule #1).
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  // A question is "revealed" once the user has answered it — feedback +
  // explanation then show and stay through submit.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const [lastScore, setLastScore] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // A question counts as answered when it has a non-empty value:
  //   single  → a non-empty string
  //   multi   → a non-empty array
  //   numeric → a finite number
  function isAnswered(q: QuestionT): boolean {
    const a = answers[q.id]
    if (a === undefined) return false
    if (Array.isArray(a)) return a.length > 0
    if (typeof a === "number") return Number.isFinite(a)
    return a !== ""
  }

  // Correctness check per kind.
  //   single  → exact match to correct[0]
  //   multi   → set-equal to correct (order-independent)
  //   numeric → |answer - Number(correct[0])| <= tolerance (default 0)
  function isCorrect(q: QuestionT): boolean {
    const a = answers[q.id]
    if (a === undefined) return false
    if (q.kind === "single") {
      return typeof a === "string" && a === q.correct[0]
    }
    if (q.kind === "multi") {
      if (!Array.isArray(a)) return false
      const chosen = [...a].sort().join("\u0001")
      const expected = [...q.correct].sort().join("\u0001")
      return chosen === expected
    }
    // numeric
    if (typeof a !== "number" || !Number.isFinite(a)) return false
    const target = Number(q.correct[0])
    const tol = q.tolerance ?? 0
    return Math.abs(a - target) <= tol
  }

  // setAnswer only records the answer; it does NOT reveal feedback. Reveal is
  // a separate, explicit act — the per-question "Check answer" button — so a
  // student commits their selection (especially for multi, where they pick
  // several) before seeing the answer. Once revealed, the question's inputs
  // lock, so the recorded score is a real first-commit measurement rather
  // than "edit until ✓ shows, then submit".
  function setAnswer(q: QuestionT, value: AnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev }
      if (value === undefined) {
        delete next[q.id]
      } else {
        next[q.id] = value
      }
      return next
    })
  }

  // Reveal one question's feedback + lock its inputs.
  function checkQuestion(q: QuestionT) {
    if (!isAnswered(q) || submitted) return
    setRevealed((prev) => ({ ...prev, [q.id]: true }))
  }

  const allChecked = questions.every((q) => revealed[q.id])

  // Submit: one attempt INSERT + one progress upsert, awaited in try/catch.
  // The write path is what this phase proves, so failures surface visibly
  // rather than being swallowed silently.
  async function handleSubmit() {
    if (submitted) return
    const score = questions.filter(isCorrect).length
    setSubmitError(null)
    try {
      const studentId = await ensureSeedStudent()
      // quiz_id convention: topic id + "#quiz". One quiz per topic in Phase 1.
      const quizId = `${topic.id}#quiz`
      await recordAttempt(
        studentId,
        topic.id,
        quizId,
        score,
        maxScore,
        JSON.stringify(answers),
      )
      await upsertProgress(studentId, topic.id, "completed")
      setLastScore(score)
      setSubmitted(true)
    } catch (err) {
      setSubmitError(
        `Could not save your result: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  // Retake: reset state so the user can go again. A retake appends a SECOND
  // quiz_attempts row on its own submit — never an UPDATE (append-only).
  function handleRetake() {
    setAnswers({})
    setRevealed({})
    setSubmitted(false)
    setLastScore(null)
    setSubmitError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-8">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            value={answers[q.id]}
            revealed={!!revealed[q.id]}
            correct={isCorrect(q)}
            submitted={submitted}
            canCheck={isAnswered(q) && !revealed[q.id] && !submitted}
            onChange={(v) => setAnswer(q, v)}
            onCheck={() => checkQuestion(q)}
          />
        ))}
      </ol>

      {submitError ? (
        <p
          role="alert"
          className="rounded-[8px] bg-[#f5f5f7] px-4 py-3 font-sans text-[17px] leading-relaxed text-[#1d1d1f]"
        >
          {submitError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-6">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allChecked}
            className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white transition active:scale-95 hover:bg-[#0071e3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRetake}
            className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white transition active:scale-95 hover:bg-[#0071e3]"
          >
            Retake
          </button>
        )}

        {submitted && lastScore !== null ? (
          <p className="font-sans text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
            Score: {lastScore} / {maxScore}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// One question + its inputs + immediate feedback + explanation.
// ──────────────────────────────────────────────────────────────────────────

function QuestionCard({
  index,
  question,
  value,
  revealed,
  correct,
  submitted,
  canCheck,
  onChange,
  onCheck,
}: {
  index: number
  question: QuestionT
  value: AnswerValue | undefined
  revealed: boolean
  correct: boolean
  submitted: boolean
  canCheck: boolean
  onChange: (value: AnswerValue | undefined) => void
  onCheck: () => void
}) {
  // Inputs lock once the question is revealed (so the committed answer can't
  // be edited after feedback is shown) and again once the whole quiz is
  // submitted.
  const locked = revealed || submitted
  return (
    <li className="flex flex-col gap-3">
      <p className="font-sans text-[17px] leading-relaxed text-[#1d1d1f]">
        <span className="font-semibold">{index + 1}. </span>
        {question.prompt}
      </p>

      {question.kind === "single" ? (
        <fieldset
          disabled={locked}
          className="flex flex-col gap-1"
          aria-label={question.prompt}
        >
          {(question.options ?? []).map((opt) => {
            const id = `${question.id}-${opt.id}`
            const checked = value === opt.id
            return (
              <label
                key={opt.id}
                htmlFor={id}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 font-sans text-[17px] text-[#1d1d1f] hover:bg-[#f5f5f7]"
              >
                <input
                  id={id}
                  type="radio"
                  name={question.id}
                  value={opt.id}
                  checked={checked}
                  onChange={() => onChange(opt.id)}
                  className="size-5 accent-[#0066cc]"
                />
                <span>{opt.text}</span>
              </label>
            )
          })}
        </fieldset>
      ) : question.kind === "multi" ? (
        <fieldset
          disabled={locked}
          className="flex flex-col gap-1"
          aria-label={question.prompt}
        >
          {(question.options ?? []).map((opt) => {
            const id = `${question.id}-${opt.id}`
            const selected = Array.isArray(value) && value.includes(opt.id)
            return (
              <label
                key={opt.id}
                htmlFor={id}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 font-sans text-[17px] text-[#1d1d1f] hover:bg-[#f5f5f7]"
              >
                <input
                  id={id}
                  type="checkbox"
                  name={question.id}
                  value={opt.id}
                  checked={selected}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : []
                    const next = e.target.checked
                      ? [...current, opt.id]
                      : current.filter((id2) => id2 !== opt.id)
                    onChange(next.length > 0 ? next : undefined)
                  }}
                  className="size-5 accent-[#0066cc]"
                />
                <span>{opt.text}</span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        // numeric
        <Input
          type="number"
          inputMode="decimal"
          aria-label={question.prompt}
          value={typeof value === "number" ? value : ""}
          disabled={locked}
          onChange={(e) => {
            const n = e.target.valueAsNumber
            // valueAsNumber is NaN when the field is empty/cleared. Treat that
            // as "not answered" so the question no longer counts as answered.
            if (Number.isFinite(n)) {
              onChange(n)
            } else {
              onChange(undefined)
            }
          }}
          className="min-h-[44px] w-full max-w-[240px] rounded-[8px] border border-[#e0e0e0] bg-[#ffffff] px-3 py-2 font-sans text-[17px] text-[#1d1d1f]"
        />
      )}

      {/* The per-question commit: reveals feedback + locks inputs. Disabled
          until the question has an answer and not yet checked. */}
      {!submitted ? (
        <button
          type="button"
          onClick={onCheck}
          disabled={!canCheck}
          className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] border border-[#0066cc] bg-transparent px-5 text-[17px] text-[#0066cc] transition active:scale-95 hover:bg-[#0066cc]/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revealed ? "Checked" : "Check answer"}
        </button>
      ) : null}

      {/* Immediate per-question feedback + explanation, shown only after the
          student commits (checks) the question. The explanation is shown
          REGARDLESS of correctness (04-vertical-slice.md step 5). No second
          brand color — correct and wrong differ by weight + a checkmark, not
          by hue. */}
      {revealed ? (
        <div className="rounded-[8px] bg-[#f5f5f7] px-4 py-3">
          <p className="font-sans text-[14px] font-semibold tracking-tight text-[#1d1d1f]">
            {correct ? "✓ Correct" : "Not quite yet"}
          </p>
          <p className="mt-1 font-sans text-[17px] leading-relaxed text-[#1d1d1f]">
            {question.explanation}
          </p>
        </div>
      ) : null}
    </li>
  )
}

function BackLink({
  subject,
  topicId,
}: {
  subject: string
  topicId: string
}) {
  return (
    <nav>
      <Link
        to="/$subject/$topicId"
        params={{ subject, topicId }}
        className="text-[17px] text-[#0066cc] hover:underline"
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
      >
        Back to {SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? subject}
      </Link>
    </nav>
  )
}
