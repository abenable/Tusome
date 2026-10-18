import { useEffect, useState } from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, Check, ImageIcon, Target } from "lucide-react"
import katex from "katex"
import "katex/dist/katex.min.css"

import {
  SUBJECT_ACCENTS,
  SUBJECT_LABELS,
  isSubject,
  type Subject,
} from "@/lib/subjects"
import { type BlockT, type TopicT } from "@/content/schema"
import { SimCanvas } from "@/components/SimCanvas"
import { PhETSim } from "@/components/PhETSim"
import { getProgress, upsertProgress } from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { groupTopicsByLevelThenStrand } from "@/lib/topics-group"

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
      // "Next" follows the same S1..S4 / strand order as the topic list.
      const ordered = groupTopicsByLevelThenStrand(
        topicsForSubject(packs, params.subject as TopicT["subject"]),
      ).flatMap((l) => l.strands.flatMap((s) => s.topics))
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
    <article className="flex flex-col gap-10">
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
            {topic.title}
          </h1>
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
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Body blocks: text and equation render directly; image is a placeholder
          for Phase 1 (resolution relative to the pack isn't wired here yet).
          Text is held to a readable measure; equations may use the full
          column and scroll sideways rather than spill out of it. */}
      <section className="flex max-w-[68ch] flex-col gap-5">
        {topic.body.map((block: BlockT, i) => {
          if (block.type === "text") {
            return (
              <p
                key={i}
                className="font-sans text-[19px] leading-[1.65] text-ink"
              >
                {block.text}
              </p>
            )
          }
          if (block.type === "equation") {
            // `latex` → typeset with KaTeX; `expr` → plain readable math.
            //
            // KaTeX's output HTML is generated from a trusted pack math string,
            // not arbitrary pack HTML — KaTeX only emits math markup (no
            // script/links), and `throwOnError: false` renders bad TeX in red
            // rather than throwing. This is the standard safe pattern for math
            // typesetting; it is distinct from doc 07's "never
            // dangerouslySetInnerHTML pack HTML" rule, which is about author
            // content, not the math renderer.
            if (block.latex) {
              const html = katex.renderToString(block.latex, {
                displayMode: true,
                throwOnError: false,
                output: "htmlAndMathml",
              })
              return (
                <div
                  key={i}
                  className="max-w-full overflow-x-auto rounded-tile border border-line bg-surface px-6 py-2 text-[1.1em] text-ink"
                  aria-label="equation"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )
            }
            return (
              <pre
                key={i}
                className="max-w-full overflow-x-auto rounded-tile border border-line bg-surface px-6 py-4 font-sans text-[20px] text-ink"
                aria-label="equation"
              >
                {block.expr ?? ""}
              </pre>
            )
          }
          // image — placeholder for Phase 1
          return (
            <figure
              key={i}
              className="flex flex-col items-center gap-2 rounded-tile border border-dashed border-line bg-surface px-4 py-10 text-center"
            >
              <ImageIcon size={28} aria-hidden className="text-ink-3" />
              <figcaption className="font-sans text-[16px] text-ink-3">
                {block.alt}
              </figcaption>
            </figure>
          )
        })}
      </section>

      {/* Simulation host. Two kinds: a custom TS sim module (registry, rendered
          by <SimCanvas> with its own rAF loop) or a bundled PhET HTML5 sim
          (rendered by <PhETSim> in an iframe via the Tauri asset protocol).
          The pack's sim ref is a union distinguished by shape: `simId` → custom,
          `phet` → PhET file (03-architecture.md §Simulation contract). */}
      {topic.sim ? (
        <section className="flex flex-col gap-3" aria-labelledby="sim">
          <h2
            id="sim"
            className="font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink"
          >
            Simulation
          </h2>
          {"simId" in topic.sim ? (
            <SimCanvas
              simId={topic.sim.simId}
              params={(topic.sim.params as Record<string, number>) ?? {}}
            />
          ) : (
            <PhETSim file={topic.sim.phet} />
          )}
          {topic.sim.caption ? (
            <p className="max-w-[68ch] font-sans text-[16px] leading-[1.5] text-ink-3">
              {topic.sim.caption}
            </p>
          ) : null}
        </section>
      ) : null}

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
