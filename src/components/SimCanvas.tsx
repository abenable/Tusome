import * as React from "react"

import { getSim, type SimState } from "@/sims"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { simReadoutLines } from "@/lib/sim-readout"

// Fixed physics timestep. The accumulator drains in FIXED_DT-sized chunks so the
// physics is deterministic regardless of render rate; a slow machine drops draw
// frames, not physics steps. (03-architecture.md §Simulation contract)
const FIXED_DT = 1 / 120

// Clamp the per-frame delta so a tab switch / debugger pause can't trigger a
// spiral-of-death where the loop tries to catch up thousands of steps at once.
const MAX_FRAME_DT = 0.1

// Cap the device pixel ratio so a weak integrated GPU doesn't get handed a
// 4×-scaled backing store on a high-DPI panel. 2 is the usual crisp/cheap
// balance. (work-unit acceptance criterion #9)
const MAX_DPR = 2

// Fixed canvas CSS height. Width is responsive to the container. The backing
// store is scaled by DPR for crispness without growing unbounded.
const CANVAS_CSS_HEIGHT = 420

interface SimCanvasProps {
  simId: string
  params?: Record<string, number>
}

export function SimCanvas({ simId, params = {} }: SimCanvasProps) {
  const module = getSim(simId)

  // Keep a ref to the latest prop params so the init effect can read them
  // without depending on the `params` object identity (which would re-init the
  // sim — wiping the trail — every time the parent re-renders with a new object
  // of the same values).
  const propParamsRef = React.useRef(params)
  propParamsRef.current = params

  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const ctxRef = React.useRef<CanvasRenderingContext2D | null>(null)
  const sizeRef = React.useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  // ── Sim state lives in a ref, NEVER useState. ──────────────────────────
  // It changes 60× a second; React state would re-render every frame.
  // (03-architecture.md §State ownership)
  const stateRef = React.useRef<SimState | null>(null)
  const paramsRef = React.useRef<Record<string, number>>({})

  // rAF handle kept in a ref so the visibility handler can cancel it
  // immediately (before the `playing` state update flushes).
  const rafIdRef = React.useRef<number | null>(null)

  // `playing` changes rarely (user taps) → useState is fine. Slider display
  // values likewise change only on user interaction → useState is fine.
  const [playing, setPlaying] = React.useState(false)
  const [sliderValues, setSliderValues] = React.useState<Record<string, number>>(
    {},
  )

  // ── Screen-reader DOM readout (W8 a11y). ───────────────────────────────
  // The canvas paints telemetry as pixels — invisible to the accessibility
  // tree. This readout mirrors the sim's current CONTROL values (the launch
  // configuration: speed/angle/gravity for the projectile) as DOM text in an
  // aria-live region, so a screen-reader user hears the configuration.
  //
  // Throttling: stateRef changes 60× a second, but re-rendering React every
  // frame would defeat the whole point of keeping sim state in a ref. So a
  // ~200ms interval snapshots stateRef.current into React state — five
  // updates/second is enough for a human-readable config readout and keeps
  // the screen-reader announcement cadence sane (aria-live regions blurt on
  // every text change; 60×/s would be unusable). The interval reads the ref,
  // never the rAF loop, so the loop is untouched. Cleared on unmount.
  //
  // The readout is driven by `simReadoutLines(module, state)`: control values
  // (launch params) plus, when the sim implements `telemetry(state)`, its
  // live in-flight values (projectile exposes height/range/time/speed). Both
  // come from the module generically — no sim-specific knowledge here.
  const [readoutLines, setReadoutLines] = React.useState<
    Array<{ label: string; value: string }>
  >([])
  React.useEffect(() => {
    if (!module) return
    // Seed the readout immediately so the region isn't empty on first paint.
    setReadoutLines(simReadoutLines(module, stateRef.current ?? {}))
    const id = window.setInterval(() => {
      if (module) {
        setReadoutLines(simReadoutLines(module, stateRef.current ?? {}))
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [module])

  // Draw the current state once. Reads refs only, so it's stable across frames
  // apart from the `module` dependency. Called as a method on `module` so
  // `this.defaults` inside projectile.ts resolves correctly (work-unit #7).
  const draw = React.useCallback(() => {
    if (!module) return
    const ctx = ctxRef.current
    const state = stateRef.current
    if (!ctx || !state) return
    const { w, h } = sizeRef.current
    if (!w || !h) return
    module.draw(ctx, state, w, h)
  }, [module])

  // Initialize sim state + merged params when the module (i.e. simId) changes.
  // Re-init only on sim change, not on `params` prop churn — see propParamsRef.
  React.useEffect(() => {
    if (!module) return
    const merged = { ...module.defaults, ...propParamsRef.current }
    paramsRef.current = merged
    stateRef.current = module.reset(merged)
    setSliderValues(merged)
  }, [module])

  // Canvas backing-store setup + resize. Scales by a capped DPR for crispness
  // without huge buffers on weak GPUs. Re-draws on resize so a paused sim
  // stays correct when the window changes.
  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctxRef.current = ctx

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const cssW = container.clientWidth
      const cssH = CANVAS_CSS_HEIGHT
      canvas.width = Math.max(1, Math.floor(cssW * dpr))
      canvas.height = Math.max(1, Math.floor(cssH * dpr))
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      sizeRef.current = { w: canvas.width, h: canvas.height }
      draw()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  // ── The rAF loop with a fixed-timestep accumulator. ────────────────────
  // Owns its own `last`/`acc` locals; the cleanup cancels the frame, which
  // covers route-change unmount (the topic route unmounts when navigating to
  // the quiz) and the play/pause toggle. `module.step` is called as a method
  // (bound to `module`) so `this.defaults` works inside projectile.ts.
  React.useEffect(() => {
    if (!module || !playing) return

    let last = performance.now()
    let acc = 0

    const loop = (now: number) => {
      rafIdRef.current = requestAnimationFrame(loop)

      let frameDt = (now - last) / 1000
      last = now
      if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT
      if (frameDt < 0) frameDt = 0
      acc += frameDt

      // Drain the accumulator in fixed steps. The guard bounds the worst case
      // (a long pause caught by the MAX_FRAME_DT clamp still can't run away).
      let guard = 0
      while (acc >= FIXED_DT && guard < 2000) {
        const s = stateRef.current
        if (s) stateRef.current = module.step(s, FIXED_DT, paramsRef.current)
        acc -= FIXED_DT
        guard++
      }

      draw()
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [playing, module, draw])

  // Pause when the tab/window becomes hidden. A rAF loop running behind a
  // background tab is pure CPU/battery waste on a machine that has neither to
  // spare. We cancel immediately via rafIdRef (before the state flush) and set
  // playing=false. When the tab becomes visible again we do NOT auto-resume —
  // the user re-presses Play — so a stale loop can never restart itself.
  // (04-vertical-slice.md step 4)
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        setPlaying(false)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  // ── All hooks above this line run unconditionally; the early return for a
  // missing module must come after them so hook order stays stable. ──────
  if (!module) {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-[11px] border border-hairline bg-[#f5f5f7] px-6 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
          Simulation unavailable
        </p>
        <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
          The simulation &ldquo;{simId}&rdquo; isn&rsquo;t installed. Ask your
          teacher to update the content packs.
        </p>
      </div>
    )
  }

  const handlePlay = () => setPlaying(true)
  const handlePause = () => setPlaying(false)

  const handleReset = () => {
    // Reset physics to launch conditions using the current params (slider
    // positions are kept; only the state resets). Cancels any running loop
    // and re-draws a static frame immediately.
    setPlaying(false)
    stateRef.current = module.reset(paramsRef.current)
    draw()
  }

  const handleSliderChange = (key: string, value: number) => {
    const next = { ...paramsRef.current, [key]: value }
    paramsRef.current = next
    setSliderValues(next)
    // Re-launch from the origin with the new params. `step` reads only gravity,
    // so without this a speed/angle change moves a number and changes nothing
    // until the student happens to press Reset. Re-launching makes every
    // slider take effect at once; while playing the next step flies the new
    // arc, while paused we draw a static frame of the new launch.
    stateRef.current = module.reset(next)
    draw()
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-[11px] border border-hairline bg-[#f5f5f7]"
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height: CANVAS_CSS_HEIGHT }}
          aria-label={`${module.id} simulation`}
          role="img"
        />
      </div>

      {/* Screen-reader DOM readout (W8 a11y). The canvas paints telemetry as
          pixels; this region mirrors the sim's current CONTROL values (the
          launch configuration) as text for assistive tech. Visually hidden —
          the on-canvas readout + the slider value displays already show the
          numbers to sighted users, so a visible duplicate would be noise.
          aria-live="polite" announces updates without interrupting. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {readoutLines.length > 0
          ? readoutLines.map((l) => `${l.label}: ${l.value}`).join(", ")
          : ""}
      </div>

      <div className="flex flex-col gap-4">
        {/* Transport controls. Pills per DESIGN.md; 44px min touch target
            (08-hardening-and-pilot.md). Action Blue is the single accent. */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handlePlay}
            disabled={playing}
            className="min-h-[44px] rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white hover:bg-[#0071e3] disabled:opacity-50"
          >
            Play
          </Button>
          <Button
            type="button"
            onClick={handlePause}
            disabled={!playing}
            className="min-h-[44px] rounded-[9999px] border border-[#0066cc] bg-transparent px-6 text-[17px] text-[#0066cc] hover:bg-[#0066cc]/5 disabled:opacity-50"
          >
            Pause
          </Button>
          <Button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] rounded-[9999px] bg-[#fafafc] px-6 text-[17px] text-[#333333] hover:bg-[#f0f0f0]"
          >
            Reset
          </Button>
        </div>

        {/* Sliders generated from module.controls — one per control key. */}
        <div className="flex flex-col gap-5">
          {module.controls.map((control) => {
            const val = sliderValues[control.key] ?? module.defaults[control.key]
            return (
              <div key={control.key} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label
                    htmlFor={`sim-${module.id}-${control.key}`}
                    className="font-sans text-[14px] font-semibold text-[#1d1d1f]"
                  >
                    {control.label}
                  </Label>
                  <span className="font-sans text-[14px] tabular-nums text-[#666666]">
                    {val}
                  </span>
                </div>
                <Slider
                  id={`sim-${module.id}-${control.key}`}
                  value={[val]}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  onValueChange={(v) => {
                    // `value` is passed as a single-element array, so the
                    // callback receives a number[]; take the first element.
                    // (The union type covers the single-number form too.)
                    const next = Array.isArray(v) ? v[0] : (v as number)
                    handleSliderChange(control.key, next)
                  }}
                  aria-label={control.label}
                  className="min-h-[44px]"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
