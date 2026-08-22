// Subject picker — `/subjects`.
//
// Ported from the claude.ai/design project "UI design improvement request"
// (SubjectPicker.dc.html): a 2x2 grid of cards, each with a tinted header, an
// icon chip, a progress ring and a topic count.
//
// This used to be the content of `/`. The design separates the two — `/` is now
// a welcome page — so the picker moved here and the sidebar's four subject
// links cover the same ground for anyone who doesn't come via Home.
//
// Deviations:
//   - The mock's four illustrations are unDraw pieces (MIT-licensed, free for
//     commercial use, no attribution required — undraw.co/license), vendored
//     into public/illustrations/ so they load offline under CSP `default-src
//     'self'` like everything else here. See SUBJECT_ILLUSTRATIONS below.
//   - The mock hardcodes "50% / 3 topics". Both figures here are real: the
//     count comes from installed packs, the ring from this student's completed
//     progress rows.

import { useEffect, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Atom, Dna, FlaskConical, Sigma, type LucideIcon } from "lucide-react"

import { loadPacksCached } from "@/content/loader"
import type { PackT } from "@/content/schema"
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_BLURBS,
  SUBJECT_LABELS,
  type Subject,
} from "@/lib/subjects"
import { getProgress, type ProgressRow } from "@/db/index"
import { useStudent } from "@/lib/student-context"
import { SUBJECT_ILLUSTRATIONS } from "@/lib/subject-illustrations"

const SUBJECT_ICONS: Record<Subject, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  mathematics: Sigma,
}

export const Route = createFileRoute("/subjects")({
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { packs } = await loadPacksCached(context.queryClient)
    return { packs }
  },
  component: SubjectPicker,
})

function SubjectPicker() {
  const { packs } = Route.useLoaderData()
  const { studentId } = useStudent()
  const [progress, setProgress] = useState<ProgressRow[]>([])

  useEffect(() => {
    if (studentId === null) {
      setProgress([])
      return
    }
    let cancelled = false
    void (async () => {
      const rows = await getProgress(studentId)
      if (!cancelled) setProgress(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  const topics = packs.flatMap((p) => p.topics)
  const completed = new Set(
    progress.filter((r) => r.state === "completed").map((r) => r.topic_id),
  )

  return (
    <div className="mx-auto max-w-[920px]">
      <header className="mx-auto mb-10 max-w-[640px] text-center">
        <h1 className="mb-[10px] font-heading text-[42px] font-extrabold tracking-[-0.02em] text-ink">
          Pick a subject
        </h1>
        <p className="font-sans text-[19px] leading-[1.55] text-ink-2">
          Lower-secondary CBC lessons and simulations — pick a subject
          to begin.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SUBJECTS.map((subject) => {
          const accent = SUBJECT_ACCENTS[subject]
          const Icon = SUBJECT_ICONS[subject]
          const mine = topics.filter((t) => t.subject === subject)
          const done = mine.filter((t) => completed.has(t.id)).length
          // Integer percent so the ring and the label can never disagree.
          const pct = mine.length === 0 ? 0 : Math.round((done / mine.length) * 100)

          return (
            <li key={subject}>
              <Link
                to="/$subject"
                params={{ subject }}
                className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,.04),0_16px_32px_-22px_rgba(0,0,0,.2)] transition-transform hover:-translate-y-[3px]"
              >
                <div
                  className={`flex h-[140px] items-center justify-center overflow-hidden ${accent.tint}`}
                >
                  <img
                    src={SUBJECT_ILLUSTRATIONS[subject]}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain p-4"
                  />
                </div>
                <div className="flex flex-col gap-[10px] px-[22px] pb-6 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-[10px]">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${accent.bg}`}
                      >
                        <Icon size={18} className="text-white" aria-hidden />
                      </span>
                      <span className="font-heading text-[22px] font-bold tracking-[-0.01em] text-ink">
                        {SUBJECT_LABELS[subject]}
                      </span>
                    </div>
                    <ProgressRing subject={subject} pct={pct} />
                  </div>
                  <p className="font-sans text-[16px] leading-[1.5] text-ink-2">
                    {SUBJECT_BLURBS[subject]}
                  </p>
                  <span className="font-sans text-[15px] font-semibold text-ink-3">
                    {mine.length === 1 ? "1 topic" : `${mine.length} topics`}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The donut from the mock: a conic-gradient ring with the percentage in the
 * hole. At 0% the ring stays neutral rather than showing a sliver of subject
 * colour, so "not started" reads as not started.
 *
 * The number is also announced as text — a ring alone is invisible to a screen
 * reader, and colour alone can't carry the meaning.
 */
function ProgressRing({ subject, pct }: { subject: Subject; pct: number }) {
  const accent = SUBJECT_ACCENTS[subject]
  const track = "var(--color-line)"
  const fill = pct === 0 ? track : `var(--color-${subject})`
  return (
    <div
      className="flex size-[38px] shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${fill} ${pct}%, ${track} 0)` }}
      role="img"
      aria-label={`${SUBJECT_LABELS[subject]} ${pct}% complete`}
    >
      <span
        className={`flex size-7 items-center justify-center rounded-full bg-surface font-sans text-[10px] font-extrabold ${
          pct === 0 ? "text-ink-3" : accent.text
        }`}
        aria-hidden
      >
        {pct}%
      </span>
    </div>
  )
}
