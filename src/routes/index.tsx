// Home — `/`.
//
// Ported from the claude.ai/design project "UI design improvement request"
// (Home.dc.html). Five bands: a welcome hero, a featured simulation, the
// weekly leaderboard, three quiz shortcuts, and a closing CTA.
//
// Deviations from the mock, all forced:
//   - The hero illustration is dropped. The mock pulls an SVG from a rackcdn
//     host; the app ships offline behind `default-src 'self'`, so it could
//     never load, and its licence is unknown. The hero reads fine without it.
//   - Icons come from lucide-react rather than unpkg.com/lucide-static — same
//     glyphs, already a dependency, works with no network.
//   - Every figure on this page is real. The mock's four hardcoded students
//     are replaced by `topScores()` over quiz_attempts, and the featured sim is
//     the first installed topic that actually has one.
//
// The leaderboard is a deliberate exception to
// docs/plan/06-app-features.md:49 ("Nothing comparative; no leaderboards"),
// requested by the project owner for this screen specifically. /dashboard
// stays strictly personal. See `topScores` in src/db/index.ts for the full
// note.

import { useEffect, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Atom, Dna, FlaskConical, Play, Sigma, type LucideIcon } from "lucide-react"

import { loadPacksCached } from "@/content/loader"
import type { PackT, TopicT } from "@/content/schema"
import {
  SUBJECT_ACCENTS,
  SUBJECT_LABELS,
  type Subject,
} from "@/lib/subjects"
import {
  continueTopic,
  getProgress,
  topScores,
  type ProgressRow,
  type TopScoreRow,
} from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { EmptyState } from "@/components/EmptyState"

const SUBJECT_ICONS: Record<Subject, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  mathematics: Sigma,
}

export const Route = createFileRoute("/")({
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { packs } = await loadPacksCached(context.queryClient)
    return { packs }
  },
  component: Home,
})

function Home() {
  const { packs } = Route.useLoaderData()
  const { student, studentId, isGuest } = useStudent()

  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [leaders, setLeaders] = useState<TopScoreRow[]>([])

  // Same effect-and-state shape the dashboard uses: these are DB reads with a
  // single caller, so a TanStack Query key would buy nothing. Cancelled on
  // unmount / student change so a slow read can't clobber a newer one.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [prog, top] = await Promise.all([
        studentId === null
          ? Promise.resolve<ProgressRow[]>([])
          : getProgress(studentId),
        topScores(),
      ])
      if (cancelled) return
      setProgress(prog)
      setLeaders(top)
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  const topics: TopicT[] = packs.flatMap((p) => p.topics)
  const name = isGuest || student === null ? "there" : student.display_name

  if (topics.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Ask your teacher or admin to install content packs, then come back here to start learning."
      />
    )
  }

  const continueId = continueTopic(
    topics.map((t) => t.id),
    progress,
  )
  const continueTarget = topics.find((t) => t.id === continueId) ?? topics[0]
  const featured = topics.find((t) => t.sim)
  const quizShortcuts = topics.filter((t) => t.quiz.length > 0).slice(0, 3)
  const titleOf = new Map(topics.map((t) => [t.id, t.title]))

  return (
    <div className="flex flex-col gap-12">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="max-w-[560px]">
        <p className="mb-[10px] font-sans text-[13px] font-bold uppercase tracking-[.06em] text-ink-3">
          Welcome back
        </p>
        <h1 className="mb-3 font-heading text-[36px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
          {name}, ready to pick up where you left off?
        </h1>
        <p className="mb-[22px] font-sans text-[16px] leading-[1.55] text-ink-2">
          Lessons, simulations and quizzes for Biology, Chemistry, Physics and
          Mathematics — S1 to S4.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/$subject/$topicId"
            params={{
              subject: continueTarget.subject,
              topicId: continueTarget.id,
            }}
            className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-[26px] font-sans text-[16px] font-bold text-white transition-colors hover:bg-brand-hover"
          >
            Continue learning
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-[48px] items-center rounded-full border-[1.5px] border-line px-[26px] font-sans text-[16px] font-bold text-ink transition-colors hover:border-ink-3"
          >
            View my dashboard
          </Link>
        </div>
      </header>

      {featured ? <FeaturedSim topic={featured} /> : null}

      <Leaderboard rows={leaders} titleOf={titleOf} />

      {quizShortcuts.length > 0 ? (
        <section>
          <h2 className="mb-4 font-heading text-[22px] font-extrabold tracking-[-0.01em] text-ink">
            Jump into a quiz
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizShortcuts.map((topic) => {
              const accent = SUBJECT_ACCENTS[topic.subject as Subject]
              const Icon = SUBJECT_ICONS[topic.subject as Subject]
              return (
                <li
                  key={topic.id}
                  className="flex flex-col gap-[10px] rounded-[18px] border border-line bg-surface p-5"
                >
                  <span
                    className={`flex size-[34px] items-center justify-center rounded-[10px] ${accent.bg}`}
                  >
                    <Icon size={18} className="text-white" aria-hidden />
                  </span>
                  <p className="font-sans text-[16px] font-bold text-ink">
                    {topic.title}
                  </p>
                  <Link
                    to="/$subject/$topicId/quiz"
                    params={{ subject: topic.subject, topicId: topic.id }}
                    className={`inline-flex min-h-[44px] w-fit items-center font-sans text-[14px] font-bold ${accent.text} hover:underline`}
                  >
                    Start quiz
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-side px-10 py-9">
        <div>
          <h2 className="mb-[6px] font-heading text-[22px] font-extrabold tracking-[-0.01em] text-white">
            Ready to explore more?
          </h2>
          <p className="font-sans text-[15px] text-white/65">
            Browse every subject or check how far you’ve come.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/subjects"
            className="inline-flex min-h-[46px] items-center rounded-full bg-brand px-6 font-sans text-[15px] font-bold text-white transition-colors hover:bg-brand-hover"
          >
            Browse subjects
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-[46px] items-center rounded-full border-[1.5px] border-white/30 px-6 font-sans text-[15px] font-bold text-white transition-colors hover:border-white/60"
          >
            My dashboard
          </Link>
        </div>
      </section>
    </div>
  )
}

/**
 * The featured-simulation band. The mock hardcodes projectile motion; this
 * surfaces whichever installed topic actually carries a sim, so the card can
 * never advertise something that isn't there.
 */
function FeaturedSim({ topic }: { topic: TopicT }) {
  const subject = topic.subject as Subject
  const accent = SUBJECT_ACCENTS[subject]
  return (
    <section>
      <h2 className="mb-4 font-heading text-[22px] font-extrabold tracking-[-0.01em] text-ink">
        Featured simulation
      </h2>
      <div className="flex flex-wrap overflow-hidden rounded-[22px] border border-line bg-surface">
        {/* The diagonal hatch from the mock, driven by the subject's own token
            so it re-tints per subject instead of being hardcoded to physics. */}
        <div
          className="flex h-[200px] min-w-[260px] flex-1 items-center justify-center"
          style={{
            backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklch, var(--color-${subject}) 14%, white) 0px, color-mix(in oklch, var(--color-${subject}) 14%, white) 12px, white 12px, white 24px)`,
          }}
        >
          <span
            aria-hidden
            className={`flex size-14 items-center justify-center rounded-full bg-white/85 shadow-[0_4px_14px_rgba(0,0,0,.12)] ${accent.text}`}
          >
            <Play size={20} fill="currentColor" />
          </span>
        </div>
        <div className="flex min-w-[260px] flex-1 flex-col justify-center gap-[10px] p-7">
          <span
            className={`inline-flex min-h-[26px] w-fit items-center rounded-full px-[10px] font-sans text-[12px] font-bold ${accent.tint} ${accent.text}`}
          >
            {SUBJECT_LABELS[subject]} · {topic.level}
          </span>
          <h3 className="font-heading text-[22px] font-extrabold tracking-[-0.01em] text-ink">
            {topic.title}
          </h3>
          {topic.sim?.caption ? (
            <p className="font-sans text-[15px] leading-[1.5] text-ink-2">
              {topic.sim.caption}
            </p>
          ) : null}
          <Link
            to="/$subject/$topicId"
            params={{ subject: topic.subject, topicId: topic.id }}
            className={`mt-[6px] inline-flex min-h-[44px] w-fit items-center rounded-full px-[22px] font-sans text-[15px] font-bold text-white ${accent.bg}`}
          >
            Try it
          </Link>
        </div>
      </div>
    </section>
  )
}

/**
 * Weekly leaderboard. Renders as a real <table> rather than the mock's stack
 * of divs — it is tabular data, and a screen reader needs the column headers
 * to make sense of "Diana, Cell structure, 92%".
 *
 * Empty is a legitimate state on a fresh install (nobody has taken a quiz in
 * the last seven days), so it says so rather than rendering an empty box.
 */
function Leaderboard({
  rows,
  titleOf,
}: {
  rows: TopScoreRow[]
  titleOf: Map<string, string>
}) {
  return (
    <section>
      <h2 className="mb-4 font-heading text-[22px] font-extrabold tracking-[-0.01em] text-ink">
        Top scores this week
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-surface px-5 py-6">
          <p className="font-sans text-[15px] text-ink-3">
            No quizzes taken in the last seven days. Scores appear here once
            someone finishes one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-line bg-surface">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Highest quiz scores across all students in the last seven days
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Student</th>
                <th scope="col">Topic</th>
                <th scope="col">Best score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.student_id}-${row.topic_id}`}
                  className="border-b border-line last:border-b-0"
                >
                  <td className="w-[26px] py-[14px] pl-5 text-center font-sans text-[14px] font-extrabold text-ink-3">
                    {i + 1}
                  </td>
                  <td className="py-[14px] pl-[14px]">
                    <div className="flex items-center gap-[14px]">
                      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-brand font-heading text-[13px] font-bold text-white">
                        {row.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-sans text-[15px] font-bold text-ink">
                        {row.display_name}
                      </span>
                    </div>
                  </td>
                  <td className="py-[14px] pl-[14px] font-sans text-[13px] text-ink-3">
                    {titleOf.get(row.topic_id) ?? row.topic_id}
                  </td>
                  <td className="w-[72px] py-[14px] pr-5 text-right font-sans text-[14px] font-extrabold text-ink">
                    {Math.round(row.best * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
