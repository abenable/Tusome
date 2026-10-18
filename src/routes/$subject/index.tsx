import { useEffect, useMemo, useState } from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import {
  SUBJECT_ACCENTS,
  SUBJECT_ICONS,
  SUBJECT_LABELS,
  isSubject,
  type Subject,
} from "@/lib/subjects"
import { type TopicT } from "@/content/schema"
import { groupTopicsByLevelThenStrand, LEVEL_ORDER } from "@/lib/topics-group"
import { EmptyState } from "@/components/EmptyState"
import { TopicGroup, type TopicProgress } from "@/components/TopicGroup"
import { getProgress, type ProgressRow } from "@/db/index"
import { useStudent } from "@/lib/student-context"

// The content loader reads packs from disk (cached in TanStack Query) and
// returns the topics for a subject, or `[]` when none are authored or the
// content directory is unreadable. See docs/plan/04-vertical-slice.md step 3
// and 06-app-features.md §"Topic list".
import { loadPacksCached, topicsForSubject } from "@/content/loader"

export const Route = createFileRoute("/$subject/")({
  // Validate the `$subject` param once, before the component renders. An
  // unknown value (e.g. /foobar) renders the not-found state rather than
  // throwing into the route component.
  beforeLoad: ({ params }) => {
    if (!isSubject(params.subject)) {
      throw notFound()
    }
  },
  loader: async ({ params, context }): Promise<{ topics: TopicT[] }> => {
    try {
      const { packs } = await loadPacksCached(context.queryClient)
      const topics = topicsForSubject(packs, params.subject as TopicT["subject"])
      return { topics: topics ?? [] }
    } catch {
      return { topics: [] }
    }
  },
  component: TopicList,
})

function TopicList() {
  const { subject } = Route.useParams()
  const { topics } = Route.useLoaderData()
  const { studentId } = useStudent()

  // `beforeLoad` validated the subject; the generated route tree types the
  // param as a plain string, so narrow it for the label/accent lookups.
  const subjectKey = subject as Subject
  const label = SUBJECT_LABELS[subjectKey]
  const accent = SUBJECT_ACCENTS[subjectKey]
  const Icon = SUBJECT_ICONS[subjectKey]

  const [progress, setProgress] = useState<ProgressRow[]>([])

  useEffect(() => {
    if (studentId === null) {
      setProgress([])
      return
    }
    let cancelled = false
    void (async () => {
      const prog = await getProgress(studentId)
      if (cancelled) return
      setProgress(prog)
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  const levels = useMemo(
    () => groupTopicsByLevelThenStrand(topics),
    [topics],
  )
  const levelsWithTopics = useMemo(
    () => new Set(levels.map((l) => l.level)),
    [levels],
  )

  // The design defaults the level filter to S1. Defaulting to the first level
  // that actually HAS topics is the same thing whenever S1 is populated, and
  // avoids opening on an empty screen when it isn't — which is the common case
  // today (the only physics pack is S2).
  const [level, setLevel] = useState<string | null>(null)
  const activeLevel =
    level && levelsWithTopics.has(level)
      ? level
      : (levels[0]?.level ?? LEVEL_ORDER[0])

  const activeGroup = levels.find((l) => l.level === activeLevel)
  const shown = activeGroup?.strands.flatMap((s) => s.topics) ?? []

  const progressState = useMemo(() => {
    const byId = new Map(progress.map((r) => [r.topic_id, r.state]))
    return (topicId: string): TopicProgress => ({
      status:
        byId.get(topicId) === "completed"
          ? "completed"
          : byId.get(topicId) === "started"
            ? "in-progress"
            : "not-started",
    })
  }, [progress])

  if (topics.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <EmptyState
          title={`No ${label} topics installed yet`}
          message={`Content packs for ${label} aren't installed. Ask your teacher or admin to add them.`}
        />
      </div>
    )
  }

  return (
    <div>
      <BackLink />

      <header className="mb-6 flex items-center gap-4">
        <span
          className={`flex size-14 shrink-0 items-center justify-center rounded-card ${accent.bg}`}
        >
          <Icon size={28} className="text-white" aria-hidden />
        </span>
        <div>
          <h1 className="font-heading text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
            {label}
          </h1>
          <p className="mt-1 font-sans text-[17px] tabular-nums text-ink-2">
            {activeLevel}, {shown.length}{" "}
            {shown.length === 1 ? "topic" : "topics"}
          </p>
        </div>
      </header>

      {/* Level filter. Levels with no installed topics stay visible but
          disabled — a student should be able to see that S3 exists and simply
          isn't installed yet, rather than wondering where it went. */}
      <div
        className="mb-9 inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1"
        role="group"
        aria-label="Filter by class level"
      >
        {LEVEL_ORDER.map((lvl) => {
          const has = levelsWithTopics.has(lvl)
          const isActive = lvl === activeLevel
          return (
            <button
              key={lvl}
              type="button"
              disabled={!has}
              aria-pressed={isActive}
              onClick={() => setLevel(lvl)}
              className={`min-h-[40px] min-w-[56px] rounded-full px-4 font-sans text-[16px] font-bold transition-colors ${
                isActive
                  ? `${accent.bg} text-white`
                  : has
                    ? "text-ink-2 hover:bg-canvas hover:text-ink"
                    : "cursor-not-allowed text-ink-3 opacity-45"
              }`}
            >
              {lvl}
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <section className="rounded-card border border-dashed border-line p-8 text-center">
          <p className="font-sans text-[18px] text-ink-2">
            No {label} topics in {activeLevel} yet.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          {activeGroup?.strands.map(({ strand, topics: strandTopics }) => (
            <TopicGroup
              key={strand}
              heading={strand}
              topics={strandTopics}
              subject={subjectKey}
              progressOf={progressState}
              headingAs="h2"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/subjects"
      className="mb-4 -ml-1 inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 font-sans text-[16px] font-bold text-ink-2 transition hover:text-ink"
    >
      <ArrowLeft size={18} aria-hidden />
      All subjects
    </Link>
  )
}
