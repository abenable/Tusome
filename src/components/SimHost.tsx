// A topic's simulations. Only one is mounted at a time: each PhET sim is a
// few megabytes of JavaScript plus WebGL, and old school PCs struggle to run
// several side by side. With more than one, a row of buttons switches.

import { useState } from "react"

import type { SimRefT } from "@/content/schema"
import { PhETSim } from "@/components/PhETSim"
import { SimCanvas } from "@/components/SimCanvas"

const SPECIAL: Record<string, string> = {
  ph: "pH",
  dc: "DC",
  ac: "AC",
  faradays: "Faraday's",
  hookes: "Hooke's",
}
const SMALL = new Set(["a", "an", "and", "of", "on", "the"])

/** "circuit-construction-kit-dc_en.html" → "Circuit Construction Kit DC". */
export function simName(sim: SimRefT): string {
  const id = "phet" in sim ? sim.phet.replace(/_en\.html$/, "") : sim.simId
  return id
    .split("-")
    .map((w, i) => SPECIAL[w] ?? (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
}

export function SimView({ sim }: { sim: SimRefT }) {
  return (
    <div className="flex flex-col gap-3">
      {"simId" in sim ? (
        <SimCanvas simId={sim.simId} params={(sim.params as Record<string, number>) ?? {}} />
      ) : (
        <PhETSim file={sim.phet} />
      )}
      {sim.caption ? (
        <p className="max-w-[68ch] font-sans text-[16px] leading-[1.5] text-ink-3">{sim.caption}</p>
      ) : null}
    </div>
  )
}

export function SimHost({ sims }: { sims: SimRefT[] }) {
  const [active, setActive] = useState(0)
  if (sims.length === 0) return null
  const current = sims[Math.min(active, sims.length - 1)]

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sim">
      <h2 id="sim" className="font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
        {sims.length === 1 ? "Simulation" : `Simulations (${sims.length})`}
      </h2>
      {sims.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a simulation">
          {sims.map((sim, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={`inline-flex min-h-[44px] items-center rounded-full px-5 font-sans text-[16px] font-bold transition active:scale-[0.98] ${
                i === active ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {simName(sim)}
            </button>
          ))}
        </div>
      ) : null}
      {/* key: remount on switch so the previous sim is torn down, not hidden. */}
      <SimView key={active} sim={current} />
    </section>
  )
}
