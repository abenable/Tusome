import type { SimModule, SimState } from './index'
import { SIM_COLORS, SIM_FONT } from './colors'

// Internal typed view of the SimState bag. The registry-facing `step`/`reset`
// use the widened `SimState`; we cast to/from this shape at the boundary for
// readability. `SimState` is the contract — this struct is a convenience.
//
// Besides the kinematic state, we carry the launch params (speed, angle,
// gravity) *inside* the state bag. Two reasons:
//   1. `draw` receives only `(ctx, state, w, h)` — no params — yet the on-canvas
//      readout needs the current gravity and the view needs the launch params
//      to size a stable scale. Stashing them in state at `reset` is how they
//      reach `draw` without changing the SimModule.draw contract.
//   2. The scale is computed from the *theoretical* full trajectory, not the
//      current extents, so the view is fixed for a given launch and the arc
//      grows into it instead of rescaling every frame (which read as a
//      stutter on a slow machine).
interface ProjectileState {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  trail: Array<[number, number]>
  speed: number
  angle: number
  gravity: number
}

// Cap the trail length to bound memory on long-running sims. The trail is a
// visual aid; once it is full we drop the oldest point rather than growing
// without limit. 1000 points is plenty for the arc of a single projectile.
const TRAIL_CAP = 1000

// World → pixel scale is chosen so a typical launch arc fits the canvas. The
// draw routine computes the scale dynamically from the current state, so these
// are just the margins we leave around the plot.
const MARGIN_PX = 40

const toState = (s: ProjectileState): SimState => ({
  x: s.x,
  y: s.y,
  vx: s.vx,
  vy: s.vy,
  t: s.t,
  trail: s.trail,
  speed: s.speed,
  angle: s.angle,
  gravity: s.gravity,
})

const fromState = (state: SimState): ProjectileState => ({
  x: num(state.x),
  y: num(state.y),
  vx: num(state.vx),
  vy: num(state.vy),
  t: num(state.t),
  trail: (state.trail as [number, number][]) ?? [],
  speed: num(state.speed),
  angle: num(state.angle),
  gravity: num(state.gravity),
})

const num = (v: SimState[keyof SimState]): number =>
  typeof v === 'number' ? v : 0

export const projectile: SimModule = {
  id: 'projectile',

  // Units: speed in m/s, angle in degrees, gravity in m/s².
  defaults: { speed: 20, angle: 45, gravity: 9.81 },

  controls: [
    { key: 'speed', label: 'Initial speed (m/s)', min: 5, max: 50, step: 1 },
    { key: 'angle', label: 'Launch angle (°)', min: 0, max: 90, step: 1 },
    { key: 'gravity', label: 'Gravity (m/s²)', min: 1, max: 25, step: 0.01 },
    // mass omitted until drag exists — without drag it cancels out and a knob
    // that does nothing is a worse UX than no knob.
  ],

  // Live in-flight values for the screen-reader / DOM readout. These change
  // every step but aren't slider `controls` — they're what the on-canvas
  // readout paints (height/range/time) plus the current speed magnitude, so a
  // screen-reader user gets the same live information a sighted user does.
  telemetry(state: SimState): Array<{ label: string; value: number; unit?: string }> {
    const s = fromState(state)
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy)
    return [
      { label: 'Height', value: s.y, unit: 'm' },
      { label: 'Range', value: s.x, unit: 'm' },
      { label: 'Time', value: s.t, unit: 's' },
      { label: 'Speed', value: speed, unit: 'm/s' },
    ]
  },

  reset(params: Record<string, number>): SimState {
    const speed = params.speed ?? this.defaults.speed
    const angleDeg = params.angle ?? this.defaults.angle
    const gravity = params.gravity ?? this.defaults.gravity
    const rad = (angleDeg * Math.PI) / 180
    const vx = speed * Math.cos(rad)
    const vy = speed * Math.sin(rad)
    return toState({
      x: 0,
      y: 0,
      vx,
      vy,
      t: 0,
      // Start the trail at the launch point so the very first frame already has
      // something to draw if the host renders before the first step.
      trail: [[0, 0]],
      // Carry the launch params in state so `draw` (which gets no params) can
      // render the live gravity readout and a stable view sized to the whole
      // predicted trajectory.
      speed,
      angle: angleDeg,
      gravity,
    })
  },

  step(state: SimState, dt: number, params: Record<string, number>): SimState {
    const s = fromState(state)
    const gravity = params.gravity ?? this.defaults.gravity

    // Idempotent grounded state: once the projectile is on the ground it stays
    // there regardless of further step calls. This keeps the sim stable if the
    // host keeps ticking after landing (e.g. a paused-but-accumulating loop).
    // The spread preserves the carried launch params.
    if (s.y <= 0 && s.t > 0) {
      return toState({ ...s, y: 0 })
    }

    // Semi-implicit Euler: update velocity first, then position with the new
    // velocity. For projectile motion (no drag) this is symplectic-ish and
    // conserves energy better than explicit Euler over many steps.
    let vy = s.vy - gravity * dt
    let vx = s.vx // no drag → horizontal velocity is constant
    let x = s.x + vx * dt
    let y = s.y + vy * dt
    let t = s.t + dt

    // Stop when the projectile reaches/below ground. Clamp y to 0 and freeze
    // position/time so the grounded state is idempotent on the next call.
    if (y <= 0) {
      // Linear interpolation back to the exact ground-crossing would tighten the
      // range estimate; we clamp instead so `step` stays a single fixed-size
      // nudge and the test tolerance (1% rel. error at dt=1/1000) covers the
      // overshoot of the last sub-ground step.
      y = 0
      vx = 0
      vy = 0
      // We still advance x to its last in-flight position (already computed
      // above) and freeze t at the moment of landing.
    }

    // Push the new point and cap the trail length, dropping the oldest entry.
    const trail = s.trail.concat([[x, y]])
    if (trail.length > TRAIL_CAP) {
      trail.splice(0, trail.length - TRAIL_CAP)
    }

    return toState({ x, y, vx, vy, t, trail, speed: s.speed, angle: s.angle, gravity: s.gravity })
  },

  draw(ctx: CanvasRenderingContext2D, state: SimState, w: number, h: number): void {
    const s = fromState(state)

    // Background
    ctx.fillStyle = SIM_COLORS.canvas
    ctx.fillRect(0, 0, w, h)

    // Size the view from the *theoretical* full trajectory for this launch, not
    // the current extents. Computing scale from s.x/s.y made it change every
    // frame, so the arc zoomed continuously while flying — which on a slow
    // machine reads as the very stutter this phase exists to test for. The
    // launch params are carried in state (see reset/step), so the view is fixed
    // for a given launch and only changes when the student re-launches.
    const rad = (s.angle * Math.PI) / 180
    const g = s.gravity > 0 ? s.gravity : 1
    const range = (s.speed * s.speed * Math.sin(2 * rad)) / g // R = v²sin(2θ)/g
    const apex = (s.speed * s.speed * Math.sin(rad) * Math.sin(rad)) / (2 * g) // H = v²sin²θ/2g
    const maxX = Math.max(range, 1)
    const maxY = Math.max(apex, 1)
    const plotW = w - MARGIN_PX * 2
    const plotH = h - MARGIN_PX * 2
    const sx = plotW / maxX
    const sy = plotH / maxY
    // Use the smaller scale so neither axis is cropped, then ground sits at the
    // bottom margin and the launch sits at the left margin.
    const scale = Math.min(sx, sy)

    const toPx = (x: number, y: number): [number, number] => [
      MARGIN_PX + x * scale,
      h - MARGIN_PX - y * scale,
    ]

    // Ground line
    ctx.strokeStyle = SIM_COLORS.ink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(MARGIN_PX, h - MARGIN_PX)
    ctx.lineTo(w - MARGIN_PX, h - MARGIN_PX)
    ctx.stroke()

    // Trail
    ctx.strokeStyle = SIM_COLORS.physics
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < s.trail.length; i++) {
      const [px, py] = toPx(s.trail[i][0], s.trail[i][1])
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Projectile
    const [cx, cy] = toPx(s.x, s.y)
    ctx.fillStyle = SIM_COLORS.ink
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fill()

    // Live readout of height (y), range (x), time (t), and the current gravity
    // from state (not this.defaults — the slider now takes effect immediately).
    ctx.fillStyle = SIM_COLORS.ink
    ctx.font =
      `14px ${SIM_FONT}`
    const readout =
      `height ${s.y.toFixed(2)} m   ` +
      `range ${s.x.toFixed(2)} m   ` +
      `time ${s.t.toFixed(2)} s   ` +
      `g ${s.gravity.toFixed(2)} m/s²`
    ctx.fillText(readout, MARGIN_PX, MARGIN_PX - 12)
  },
}
