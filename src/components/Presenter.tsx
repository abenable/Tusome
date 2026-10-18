// Presenter mode: a lesson as full-screen slides for a projector.
//
// Built for the usual classroom: one screen, 60+ learners, a teacher at the
// front with a keyboard or a clicker. Large type, no sidebar, one section per
// slide. Arrow keys, Space and PageUp/PageDown (what clickers send) move
// between slides; Esc leaves. Read-aloud reads the current slide.
//
// Slides: the title and outcomes, then a slide per heading-led section of the
// lesson (long sections split so text stays large), then one per simulation.

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Target, X } from "lucide-react"

import { topicSims, type BlockT, type SimRefT, type TopicT } from "@/content/schema"
import { LessonBlock } from "@/components/LessonBlock"
import { ListenBar } from "@/components/ListenBar"
import { SimView, simName } from "@/components/SimHost"
import { useReadAloud } from "@/lib/read-aloud"
import { blockChunks, speakable, type Chunk } from "@/lib/speech"
import type { SubjectAccent } from "@/lib/subjects"

type Slide =
  | { kind: "title" }
  | { kind: "blocks"; blocks: Array<{ block: BlockT; i: number }> }
  | { kind: "sim"; sim: SimRefT }

// Most blocks a slide holds before it splits, so type can stay large.
const MAX_BLOCKS = 3

export function slidesFor(topic: TopicT): Slide[] {
  const slides: Slide[] = [{ kind: "title" }]
  let current: Array<{ block: BlockT; i: number }> = []
  const flush = () => {
    if (current.length) slides.push({ kind: "blocks", blocks: current })
    current = []
  }
  topic.body.forEach((block, i) => {
    if (block.type === "heading" || current.length >= MAX_BLOCKS) flush()
    current.push({ block, i })
  })
  flush()
  for (const sim of topicSims(topic)) slides.push({ kind: "sim", sim })
  return slides
}

async function setFullscreen(on: boolean) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().setFullscreen(on)
  } catch {
    // Outside Tauri (plain browser dev): the overlay still fills the window.
  }
}

export function Presenter({
  topic,
  accent,
  onClose,
}: {
  topic: TopicT
  accent: SubjectAccent
  onClose: () => void
}) {
  const slides = useMemo(() => slidesFor(topic), [topic])
  const [n, setN] = useState(0)
  const slide = slides[n]
  const root = useRef<HTMLDivElement>(null)

  const chunks = useMemo<Chunk[]>(() => {
    if (slide.kind === "title") {
      return [topic.title, "What you'll learn.", ...topic.outcomes].map((t, k) => ({
        key: `-1-${k}`,
        text: speakable(t),
      }))
    }
    if (slide.kind === "blocks") return slide.blocks.flatMap(({ block, i }) => blockChunks(block, i))
    return []
  }, [slide, topic])
  const reader = useReadAloud(chunks)

  useEffect(() => {
    void setFullscreen(true)
    root.current?.focus()
    return () => void setFullscreen(false)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const onButton = (e.target as HTMLElement).closest("button, a, iframe")
      if (e.key === "Escape") onClose()
      else if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !onButton))
        setN((v) => Math.min(v + 1, slides.length - 1))
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) setN((v) => Math.max(v - 1, 0))
      else if (e.key === "Home") setN(0)
      else if (e.key === "End") setN(slides.length - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [slides.length, onClose])

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${topic.title}, presenter mode`}
      className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none"
    >
      <header className="flex items-center gap-4 border-b border-line bg-surface px-6 py-3">
        <span className="min-w-0 flex-1 truncate font-heading text-[19px] font-bold text-ink">{topic.title}</span>
        <ListenBar reader={reader} root={root} />
        <span className="font-sans text-[16px] tabular-nums text-ink-3" aria-live="polite">
          {n + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-4 font-sans text-[16px] font-bold text-ink transition hover:bg-canvas"
        >
          <X size={18} aria-hidden />
          Exit
        </button>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-10 py-8">
        {slide.kind === "sim" ? (
          <div className="flex w-full max-w-[1400px] flex-col gap-3">
            <h2 className="font-heading text-[26px] font-extrabold text-ink">{simName(slide.sim)}</h2>
            <SimView key={n} sim={slide.sim} />
          </div>
        ) : (
          // `zoom` scales the whole lesson layout up for the back of the room.
          <div className="flex w-full max-w-[900px] flex-col gap-6" style={{ zoom: 1.35 }}>
            {slide.kind === "title" ? (
              <>
                <h1 className="font-heading text-[48px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">
                  <span data-chunk="-1-0" className={reader.active === "-1-0" ? "bg-sun-tint" : undefined}>
                    {topic.title}
                  </span>
                </h1>
                <ul className={`flex flex-col gap-3 rounded-card px-7 py-6 ${accent.tint}`}>
                  {topic.outcomes.map((o, k) => (
                    <li key={k} className="flex gap-3 font-sans text-[20px] leading-[1.45] text-ink">
                      <Target size={20} aria-hidden className={`mt-1 shrink-0 ${accent.text}`} />
                      <span
                        data-chunk={`-1-${k + 2}`}
                        className={reader.active === `-1-${k + 2}` ? "bg-sun-tint" : undefined}
                      >
                        {o}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : slide.kind === "blocks" ? (
              slide.blocks.map(({ block, i }) => (
                <LessonBlock key={i} block={block} i={i} accent={accent} active={reader.active} />
              ))
            ) : null}
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-line bg-surface px-6 py-3">
        <button
          type="button"
          onClick={() => setN((v) => Math.max(v - 1, 0))}
          disabled={n === 0}
          className="inline-flex min-h-[52px] items-center gap-2 rounded-full px-6 font-sans text-[18px] font-bold text-ink transition hover:bg-canvas disabled:opacity-35"
        >
          <ChevronLeft size={22} aria-hidden />
          Back
        </button>
        <div className="flex gap-1.5" aria-hidden>
          {slides.map((_, k) => (
            <span key={k} className={`h-2 rounded-full transition-all ${k === n ? `w-6 ${accent.bg}` : "w-2 bg-line"}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setN((v) => Math.min(v + 1, slides.length - 1))}
          disabled={n === slides.length - 1}
          className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-sun px-7 font-sans text-[18px] font-bold text-ink transition hover:bg-sun-hover active:scale-[0.98] disabled:opacity-35"
        >
          Next
          <ChevronRight size={22} aria-hidden />
        </button>
      </footer>
    </div>
  )
}
