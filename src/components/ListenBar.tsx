// Listen / Pause / Stop controls for read-aloud. Renders nothing on a machine
// that can't speak. Keeps the sentence being read in view, without moving
// keyboard focus (so it never fights a screen reader).

import { useEffect, type RefObject } from "react"
import { Pause, Play, Square, Volume2 } from "lucide-react"

import type { ReadAloud } from "@/lib/read-aloud"

const BTN =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 font-sans text-[16px] font-bold transition active:scale-[0.98]"

export function ListenBar({ reader, root }: { reader: ReadAloud; root: RefObject<HTMLElement | null> }) {
  const { available, status, active } = reader

  useEffect(() => {
    if (!active) return
    root.current
      ?.querySelector(`[data-chunk="${active}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active, root])

  if (!available) return null

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Read aloud">
      {status === "playing" ? (
        <button type="button" onClick={reader.pause} className={`${BTN} bg-brand text-white hover:bg-brand-hover`}>
          <Pause size={18} aria-hidden />
          Pause
        </button>
      ) : (
        <button type="button" onClick={reader.play} className={`${BTN} bg-brand text-white hover:bg-brand-hover`}>
          {status === "paused" ? <Play size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          {status === "paused" ? "Resume" : "Listen"}
        </button>
      )}
      {status !== "idle" ? (
        <button type="button" onClick={reader.stop} className={`${BTN} border border-line bg-surface text-ink hover:bg-canvas`}>
          <Square size={15} aria-hidden />
          Stop
        </button>
      ) : null}
      <button
        type="button"
        aria-pressed={reader.slow}
        onClick={() => reader.setSlow(!reader.slow)}
        className={`${BTN} border ${
          reader.slow ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:text-ink"
        }`}
      >
        Slower
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "playing" ? "Reading aloud" : status === "paused" ? "Paused" : ""}
      </span>
    </div>
  )
}
