// Home — `/`.
//
// Ported from the claude.ai/design project "UI design improvement request"
// (Home.dc.html). A welcome hero, a featured simulation, and a closing CTA.
//
// Deviations from the mock, all forced:
//   - The hero illustration is dropped. The mock pulls an SVG from a rackcdn
//     host; the app ships offline behind `default-src 'self'`, so it could
//     never load, and its licence is unknown. The hero reads fine without it.
//   - Icons come from lucide-react rather than unpkg.com/lucide-static — same
//     glyphs, already a dependency, works with no network.
//   - The featured sim is the first installed topic that actually has one.
//
// The mock's weekly leaderboard and quiz shortcuts are dropped along with the
// rest of the quiz engine (schema, DB tables, dashboards) — the app isn't
// ready to ship quiz content yet.

import { useEffect, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Play } from "lucide-react"

import { loadPacksCached } from "@/content/loader"
import type { PackT, TopicT } from "@/content/schema"
import { SUBJECT_ACCENTS, SUBJECT_LABELS, type Subject } from "@/lib/subjects"
import { SUBJECT_ILLUSTRATIONS } from "@/lib/subject-illustrations"
import { continueTopic, getProgress, type ProgressRow } from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { EmptyState } from "@/components/EmptyState"

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

  // Same effect-and-state shape the dashboard uses: this is a DB read with a
  // single caller, so a TanStack Query key would buy nothing. Cancelled on
  // unmount / student change so a slow read can't clobber a newer one.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const prog =
        studentId === null ? [] : await getProgress(studentId)
      if (cancelled) return
      setProgress(prog)
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

  // No progress rows at all — a brand-new profile that hasn't opened a
  // lesson yet. Dropping it straight into an arbitrary topic (continueTopic's
  // fallback) skips the subject choice entirely, so send it to the subject
  // picker instead and label the CTA to match.
  const isNew = progress.length === 0

  const continueId = continueTopic(
    topics.map((t) => t.id),
    progress,
  )
  const continueTarget = topics.find((t) => t.id === continueId) ?? topics[0]
  const featured = topics.find((t) => t.sim)

  return (
    <div className="flex flex-col gap-12">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-[560px] flex-col items-center text-center">
        <p className="mb-[10px] font-sans text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">
          Welcome back
        </p>
        <h1 className="mb-3 font-heading text-[40px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
          {name}, ready to pick up where you left off?
        </h1>
        <p className="mb-[22px] font-sans text-[18px] leading-[1.55] text-ink-2">
          Lessons and simulations for Biology, Chemistry, Physics and
          Mathematics — S1 to S4.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {isNew ? (
            <Link
              to="/subjects"
              className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-[26px] font-sans text-[18px] font-bold text-white transition-colors hover:bg-brand-hover"
            >
              Start learning
            </Link>
          ) : (
            <Link
              to="/$subject/$topicId"
              params={{
                subject: continueTarget.subject,
                topicId: continueTarget.id,
              }}
              className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-[26px] font-sans text-[18px] font-bold text-white transition-colors hover:bg-brand-hover"
            >
              Continue learning
            </Link>
          )}
          <Link
            to="/dashboard"
            className="inline-flex min-h-[48px] items-center rounded-full border-[1.5px] border-line px-[26px] font-sans text-[18px] font-bold text-ink transition-colors hover:border-ink-3"
          >
            View my dashboard
          </Link>
        </div>
      </header>

      {featured ? <FeaturedSim topic={featured} /> : null}

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-side px-10 py-9">
        <div>
          <h2 className="mb-[6px] font-heading text-[25px] font-extrabold tracking-[-0.01em] text-white">
            Ready to explore more?
          </h2>
          <p className="font-sans text-[17px] text-white/65">
            Browse every subject or check how far you’ve come.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/subjects"
            className="inline-flex min-h-[46px] items-center rounded-full bg-brand px-6 font-sans text-[17px] font-bold text-white transition-colors hover:bg-brand-hover"
          >
            Browse subjects
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-[46px] items-center rounded-full border-[1.5px] border-white/30 px-6 font-sans text-[17px] font-bold text-white transition-colors hover:border-white/60"
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
      <h2 className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
        Featured simulation
      </h2>
      <div className="flex flex-wrap overflow-hidden rounded-[22px] border border-line bg-surface">
        {/* Subject illustration on its own tint, with the play badge floating
            on top — same illustration as the subject picker, re-tinted per
            subject instead of the diagonal hatch the mock used. */}
        <div
          className={`relative flex h-[200px] min-w-[260px] flex-1 items-center justify-center overflow-hidden ${accent.tint}`}
        >
          <img
            src={SUBJECT_ILLUSTRATIONS[subject]}
            alt=""
            aria-hidden
            className="h-full w-full object-contain p-6"
          />
          <span
            aria-hidden
            className={`absolute flex size-14 items-center justify-center rounded-full bg-white/85 shadow-[0_4px_14px_rgba(0,0,0,.12)] ${accent.text}`}
          >
            <Play size={20} fill="currentColor" />
          </span>
        </div>
        <div className="flex min-w-[260px] flex-1 flex-col justify-center gap-[10px] p-7">
          <span
            className={`inline-flex min-h-[26px] w-fit items-center rounded-full px-[10px] font-sans text-[14px] font-bold ${accent.tint} ${accent.text}`}
          >
            {SUBJECT_LABELS[subject]} · {topic.level}
          </span>
          <h3 className="font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
            {topic.title}
          </h3>
          {topic.sim?.caption ? (
            <p className="font-sans text-[17px] leading-[1.5] text-ink-2">
              {topic.sim.caption}
            </p>
          ) : null}
          <Link
            to="/$subject/$topicId"
            params={{ subject: topic.subject, topicId: topic.id }}
            className={`mt-[6px] inline-flex min-h-[44px] w-fit items-center rounded-full px-[22px] font-sans text-[17px] font-bold text-white ${accent.bg}`}
          >
            Try it
          </Link>
        </div>
      </div>
    </section>
  )
}

