// Home — `/`.
//
// A greeting, the one thing to do next (resume the last topic, or pick a first
// subject), a featured simulation, and the four subjects with this student's
// progress. Left-aligned on purpose: the content column is narrow on school
// machines and a centred stack wasted it.
//
//   - The featured sim is picked at random from installed topics that have
//     one (memoized on the topic list, so it doesn't reshuffle on every
//     re-render — just on each fresh visit to Home).
//   - Icons are lucide-react, which works with no network.

import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Play } from "lucide-react"

import { loadPacksCached } from "@/content/loader"
import type { PackT, TopicT } from "@/content/schema"
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_ICONS,
  SUBJECT_LABELS,
  type Subject,
} from "@/lib/subjects"
import { SUBJECT_ILLUSTRATIONS } from "@/lib/subject-illustrations"
import { continueTopic, getProgress, type ProgressRow } from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { EmptyState } from "@/components/EmptyState"
import { ContinueHero } from "@/components/StudentDashboard"

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
  const firstName =
    isGuest || student === null ? null : student.display_name.split(" ")[0]

  const withSim = topics.filter((t) => t.sim)
  const featured = useMemo(
    () => (withSim.length === 0 ? undefined : withSim[Math.floor(Math.random() * withSim.length)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // not depending on `withSim` (a new array every render): re-picking only
    // when the topic count changes keeps the choice stable across re-renders.
    [withSim.length],
  )

  if (topics.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Ask your teacher or admin to install content packs, then come back here to start learning."
      />
    )
  }

  // No progress rows at all — a brand-new profile (or Guest) that hasn't
  // opened a lesson yet. Dropping it straight into an arbitrary topic
  // (continueTopic's fallback) skips the subject choice entirely, so offer the
  // subject picker instead.
  const isNew = progress.length === 0
  const byTopic = new Map(progress.map((r) => [r.topic_id, r.state]))

  const continueId = continueTopic(
    topics.map((t) => t.id),
    progress,
  )
  const continueTarget = topics.find((t) => t.id === continueId) ?? null

  return (
    <div className="flex flex-col gap-12">
      <header className="flex max-w-[640px] flex-col gap-3">
        <h1 className="font-heading text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
          {isNew
            ? firstName
              ? `Welcome, ${firstName}.`
              : "Welcome to Tusome."
            : `Welcome back, ${firstName ?? "there"}.`}
        </h1>
        <p className="font-sans text-[19px] leading-[1.55] text-ink-2">
          Lessons and simulations for S1 to S4 Biology, Chemistry, Physics and
          Mathematics.
        </p>
      </header>

      {isNew || continueTarget === null ? (
        <section
          className="flex flex-wrap items-center justify-between gap-6 rounded-card bg-sun-tint px-8 py-7"
          aria-label="Get started"
        >
          <div className="max-w-[460px]">
            <h2 className="mb-1 font-heading text-[27px] font-extrabold tracking-[-0.01em] text-ink">
              {isNew ? "Start with a subject" : "All caught up"}
            </h2>
            <p className="font-sans text-[17px] leading-[1.5] text-ink-2">
              {isNew
                ? "Pick one to see its topics. Your progress saves as you go."
                : "You’ve completed every installed topic. Revisit any of them below."}
            </p>
          </div>
          <Link
            to="/subjects"
            className="inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-full bg-sun px-7 font-sans text-[18px] font-bold text-ink transition hover:bg-sun-hover active:scale-[0.98]"
          >
            Choose a subject
            <ArrowRight size={18} aria-hidden />
          </Link>
        </section>
      ) : (
        <ContinueHero
          topic={continueTarget}
          resuming={byTopic.get(continueTarget.id) === "started"}
        />
      )}

      {featured ? <FeaturedSim topic={featured} /> : null}

      <section aria-labelledby="home-subjects">
        <h2
          id="home-subjects"
          className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink"
        >
          Subjects
        </h2>
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {SUBJECTS.map((subject) => {
            const accent = SUBJECT_ACCENTS[subject]
            const Icon = SUBJECT_ICONS[subject]
            const mine = topics.filter((t) => t.subject === subject)
            const done = mine.filter((t) => byTopic.get(t.id) === "completed").length
            return (
              <li key={subject}>
                <Link
                  to="/$subject"
                  params={{ subject }}
                  className="flex h-full items-center gap-3 rounded-card border border-line bg-surface p-4 transition hover:-translate-y-px hover:shadow-card"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-tile ${accent.bg}`}
                  >
                    <Icon size={20} className="text-white" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-heading text-[19px] font-bold text-ink">
                      {SUBJECT_LABELS[subject]}
                    </span>
                    <span className="font-sans text-[15px] tabular-nums text-ink-3">
                      {done > 0 ? `${done} of ${mine.length} done` : plural(mine.length, "topic")}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
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
    <section aria-labelledby="home-featured">
      <h2
        id="home-featured"
        className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink"
      >
        Try a simulation
      </h2>
      <Link
        to="/$subject/$topicId"
        params={{ subject: topic.subject, topicId: topic.id }}
        className="group grid overflow-hidden rounded-card border border-line bg-surface transition hover:shadow-lift md:grid-cols-[5fr_6fr]"
      >
        {/* Subject illustration on its own tint, with the play badge floating
            on top — the same illustration as the subject picker. */}
        <div
          className={`relative flex h-[200px] items-center justify-center overflow-hidden md:h-auto md:min-h-[220px] ${accent.tint}`}
        >
          <img
            src={SUBJECT_ILLUSTRATIONS[subject]}
            alt=""
            aria-hidden
            className="h-full max-h-[200px] w-full object-contain p-6"
          />
          <span
            aria-hidden
            className={`absolute flex size-14 items-center justify-center rounded-full bg-surface shadow-card transition group-hover:scale-105 ${accent.text}`}
          >
            <Play size={20} fill="currentColor" />
          </span>
        </div>
        <div className="flex flex-col justify-center gap-3 p-7">
          <span
            className={`inline-flex min-h-[28px] w-fit items-center rounded-full px-3 font-sans text-[14px] font-bold ${accent.tint} ${accent.text}`}
          >
            {SUBJECT_LABELS[subject]} · {topic.level}
          </span>
          <h3 className="font-heading text-[25px] font-extrabold leading-tight tracking-[-0.01em] text-ink">
            {topic.title}
          </h3>
          {topic.sim?.caption ? (
            <p className="line-clamp-3 font-sans text-[17px] leading-[1.5] text-ink-2">
              {topic.sim.caption}
            </p>
          ) : null}
          <span
            className={`mt-1 inline-flex items-center gap-2 font-sans text-[17px] font-bold ${accent.text}`}
          >
            Open simulation
            <ArrowRight size={18} aria-hidden className="transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </section>
  )
}
