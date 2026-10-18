import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, Check, Presentation, Target } from "lucide-react"

import {
  SUBJECT_ACCENTS,
  SUBJECT_LABELS,
  isSubject,
  type Subject,
} from "@/lib/subjects"
import { type BlockT, type TopicT, topicSims } from "@/content/schema"
import { SimHost } from "@/components/SimHost"
import { LessonBlock } from "@/components/LessonBlock"
import { ListenBar } from "@/components/ListenBar"
import { Presenter } from "@/components/Presenter"
import { useReadAloud } from "@/lib/read-aloud"
import { topicChunks } from "@/lib/speech"
import { getProgress, upsertProgress } from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { topicsInTeachingOrder } from "@/lib/topics-group"

// Cross-builder seam (content-author). See sibling $subject/index.tsx for the
// rationale: importing defensively, try/catch at the call site.
import {
  findTopicInPacks,
  loadPacksCached,
  topicsForSubject,
} from "@/content/loader"

export const Route = createFileRoute("/$subject/$topicId/")({
  beforeLoad: ({ params }) => {
    if (!isSubject(params.subject)) {
      throw notFound()
    }
  },
  loader: async ({
    params,
    context,
  }): Promise<{ topic: TopicT | null; next: TopicT | null }> => {
    try {
      const { packs } = await loadPacksCached(context.queryClient)
      const found = findTopicInPacks(packs, params.topicId)
      // Ids are global, so a stale /chemistry/<physics-id> link would
      // otherwise render a physics lesson under a Chemistry header.
      const topic = found?.subject === params.subject ? found : null
      // "Next" follows the same S1..S4 / term order as the topic list.
      const ordered = topicsInTeachingOrder(
        topicsForSubject(packs, params.subject as TopicT["subject"]),
      )
      const i = topic ? ordered.findIndex((t) => t.id === topic.id) : -1
      return { topic, next: i >= 0 ? (ordered[i + 1] ?? null) : null }
    } catch {
      return { topic: null, next: null }
    }
  },
  component: TopicView,
})

function TopicView() {
  const { subject } = Route.useParams()
  const { topic, next } = Route.useLoaderData()
  const { studentId } = useStudent()
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const root = useRef<HTMLElement>(null)
  const chunks = useMemo(() => (topic ? topicChunks(topic) : []), [topic])
  const reader = useReadAloud(chunks)

  // Opening a topic records it as started (the upsert never downgrades a
  // completed one), and reads back whether it's already done. Guests save
  // nothing — that's the point of Guest.
  const topicId = topic?.id
  useEffect(() => {
    setCompleted(false)
    if (studentId === null || !topicId) return
    let cancelled = false
    void (async () => {
      try {
        await upsertProgress(studentId, topicId, "started")
        const rows = await getProgress(studentId)
        if (cancelled) return
        setCompleted(
          rows.some((r) => r.topic_id === topicId && r.state === "completed"),
        )
      } catch (err) {
        console.error("[TopicView] progress write failed:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [studentId, topicId])

  if (!topic) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink subject={subject} />
        <h1 className="font-heading text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
          Topic not found
        </h1>
        <p className="font-sans text-[19px] leading-relaxed text-ink-2">
          This topic isn’t installed on this computer yet.
        </p>
      </div>
    )
  }

  const subjectKey = subject as Subject
  const accent = SUBJECT_ACCENTS[subjectKey]

  async function markComplete() {
    if (studentId === null || !topicId || saving) return
    setSaving(true)
    try {
      await upsertProgress(studentId, topicId, "completed")
      setCompleted(true)
    } catch (err) {
      console.error("[TopicView] mark complete failed:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article ref={root} className="flex flex-col gap-10">
      {presenting ? (
        <Presenter topic={topic} accent={accent} onClose={() => setPresenting(false)} />
      ) : null}
      <div className="flex flex-col gap-4">
        <BackLink subject={subject} />
        <header className="flex max-w-[760px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`inline-flex min-h-[28px] items-center rounded-full px-3 font-sans text-[14px] font-bold ${accent.tint} ${accent.text}`}
            >
              {SUBJECT_LABELS[subjectKey]}, {topic.level}
            </span>
            {topic.strand ? (
              <span className="font-sans text-[16px] text-ink-3">
                {topic.strand}
              </span>
            ) : null}
          </div>
          <h1 className="font-heading text-[44px] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink">
            <span data-chunk="-1-0" className={reader.active === "-1-0" ? "bg-sun-tint" : undefined}>
              {topic.title}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ListenBar reader={reader} root={root} />
            <button
              type="button"
              onClick={() => {
                reader.stop()
                setPresenting(true)
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-5 font-sans text-[16px] font-bold text-ink transition hover:bg-canvas active:scale-[0.98]"
            >
              <Presentation size={18} aria-hidden />
              Present
            </button>
          </div>
        </header>
      </div>

      {/* Learning outcomes, verbatim from the NCDC syllabus. */}
      {topic.outcomes.length > 0 && (
        <section
          className={`max-w-[760px] rounded-card px-6 py-5 ${accent.tint}`}
          aria-labelledby="outcomes"
        >
          <h2
            id="outcomes"
            className="mb-3 font-heading text-[21px] font-bold tracking-[-0.01em] text-ink"
          >
            What you’ll learn
          </h2>
          <ul className="flex flex-col gap-2">
            {topic.outcomes.map((o, i) => (
              <li
                key={i}
                className="flex gap-3 font-sans text-[18px] leading-[1.5] text-ink"
              >
                <Target
                  size={18}
                  aria-hidden
                  className={`mt-[4px] shrink-0 ${accent.text}`}
                />
                <span
                  data-chunk={`-1-${i + 2}`}
                  className={reader.active === `-1-${i + 2}` ? "bg-sun-tint" : undefined}
                >
                  {o}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Text is held to a readable measure; equations may use the full
          column and scroll sideways rather than spill out of it. */}
      <section className="flex max-w-[68ch] flex-col gap-5">
        {topic.body.map((block: BlockT, i) => (
          <LessonBlock key={i} block={block} i={i} accent={accent} active={reader.active} />
        ))}
      </section>

      {/* Simulations: a custom TS sim (registry, <SimCanvas>) or a bundled
          PhET HTML5 sim (iframe, <PhETSim>), one mounted at a time. */}
      <SimHost sims={topicSims(topic)} />

      <section
        className="flex flex-wrap items-center justify-between gap-5 rounded-card border border-line bg-surface px-6 py-5"
        aria-label="Your progress on this topic"
      >
        {studentId === null ? (
          <p className="font-sans text-[17px] text-ink-2">
            You’re practising as a guest, so progress isn’t saved.
          </p>
        ) : completed ? (
          <p className="flex items-center gap-3 font-sans text-[18px] font-bold text-ink">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${accent.bg}`}
            >
              <Check size={16} strokeWidth={3} aria-hidden />
            </span>
            You’ve completed this topic.
          </p>
        ) : (
          <>
            <p className="font-sans text-[18px] text-ink-2">
              Finished the lesson?
            </p>
            <button
              type="button"
              onClick={() => void markComplete()}
              disabled={saving}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-brand px-6 font-sans text-[17px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50"
            >
              <Check size={18} strokeWidth={3} aria-hidden />
              Mark as complete
            </button>
          </>
        )}
        {next && (completed || studentId === null) ? (
          <Link
            to="/$subject/$topicId"
            params={{ subject: next.subject, topicId: next.id }}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sun px-6 font-sans text-[17px] font-bold text-ink transition hover:bg-sun-hover active:scale-[0.98]"
          >
            Next: {next.title}
            <ArrowRight size={18} aria-hidden />
          </Link>
        ) : null}
      </section>
    </article>
  )
}

function BackLink({ subject }: { subject: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <Link
        to="/$subject"
        params={{ subject }}
        className="-ml-1 inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 font-sans text-[16px] font-bold text-ink-2 transition hover:text-ink"
      >
        <ArrowLeft size={18} aria-hidden />
        {SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? subject}
      </Link>
    </nav>
  )
}
