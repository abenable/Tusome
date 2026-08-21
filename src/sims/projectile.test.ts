import { describe, it, expect } from 'bun:test'
import { projectile } from './projectile'
import type { SimState } from './index'

// The one check this phase owes: assert range ≈ v²·sin(2θ)/g for a couple of
// angles within an explicit tolerance. `step`/`reset` are imported directly —
// no canvas, no DOM, which is the whole point of the step/draw split.

// Small fixed dt keeps the semi-implicit Euler error low so a tight tolerance
// is meaningful. 1/1000 s → ~thousands of steps for a 20 m/s launch, fast in
// JS and trivially under the rAF budget.
const DT = 1 / 1000

// Run the sim from `reset` until grounded, stepping at fixed DT, and return the
// final state. A guard caps the loop so a physics bug can't hang the test.
function runToGround(params: Record<string, number>): SimState {
  let s = projectile.reset(params)
  let guard = 0
  const maxSteps = 1_000_000
  while (guard++ < maxSteps) {
    if (num(s.y) <= 0 && num(s.t) > 0) break
    s = projectile.step(s, DT, params)
  }
  return s
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

// Theoretical range for a projectile launched from ground level, landing at
// ground level, no drag: R = v²·sin(2θ)/g.
const theoreticalRange = (v: number, angleDeg: number, g: number): number =>
  (v * v * Math.sin((2 * angleDeg * Math.PI) / 180)) / g

describe('projectile step', () => {
  it('range ≈ v²·sin(2θ)/g for 30° within 1% relative error', () => {
    const params = { speed: 20, angle: 30, gravity: 9.81 }
    const s = runToGround(params)
    const range = num(s.x)
    const theory = theoreticalRange(20, 30, 9.81)
    const relErr = Math.abs(range - theory) / theory
    // The measured range will slightly *over*shoot because we clamp the last
    // sub-ground step rather than interpolating to the exact crossing, so a
    // 1% tolerance comfortably absorbs a single-DT overshoot at v=20 m/s.
    expect(relErr).toBeLessThan(0.01)
  })

  it('range ≈ v²·sin(2θ)/g for 60° within 1% relative error', () => {
    const params = { speed: 20, angle: 60, gravity: 9.81 }
    const s = runToGround(params)
    const range = num(s.x)
    const theory = theoreticalRange(20, 60, 9.81)
    const relErr = Math.abs(range - theory) / theory
    expect(relErr).toBeLessThan(0.01)
  })

  it('45° gives a longer range than 30° (sanity)', () => {
    const r45 = num(runToGround({ speed: 20, angle: 45, gravity: 9.81 }).x)
    const r30 = num(runToGround({ speed: 20, angle: 30, gravity: 9.81 }).x)
    expect(r45).toBeGreaterThan(r30)
  })

  it('grounded state is idempotent: further step calls do not move it', () => {
    const s = runToGround({ speed: 20, angle: 45, gravity: 9.81 })
    const x0 = num(s.x)
    const t0 = num(s.t)
    // y0 is implicitly 0 (grounded); not re-read, but asserted below.
    // Stepping a grounded state repeatedly must keep it on the ground.
    let s2 = s
    for (let i = 0; i < 50; i++) s2 = projectile.step(s2, DT, { speed: 20, angle: 45, gravity: 9.81 })
    expect(num(s2.y)).toBe(0)
    expect(num(s2.x)).toBe(x0)
    expect(num(s2.t)).toBe(t0)
  })

  it('step is pure: it does not mutate the input state object', () => {
    const before = projectile.reset({ speed: 20, angle: 45, gravity: 9.81 })
    const snapshot = {
      x: num(before.x),
      y: num(before.y),
      vx: num(before.vx),
      vy: num(before.vy),
      t: num(before.t),
      trailLen: (before.trail as [number, number][]).length,
    }
    projectile.step(before, DT, { speed: 20, angle: 45, gravity: 9.81 })
    projectile.step(before, DT, { speed: 20, angle: 45, gravity: 9.81 })
    expect(num(before.x)).toBe(snapshot.x)
    expect(num(before.y)).toBe(snapshot.y)
    expect(num(before.vx)).toBe(snapshot.vx)
    expect(num(before.vy)).toBe(snapshot.vy)
    expect(num(before.t)).toBe(snapshot.t)
    expect((before.trail as [number, number][]).length).toBe(snapshot.trailLen)
  })

  it('reset carries the launch params in state and step preserves them', () => {
    // draw receives only (ctx, state, w, h) — no params — so the launch params
    // must ride inside the state bag. reset seeds them and step must not drop
    // them (a grounded clamp that spreads ...s preserves them by construction).
    const s = projectile.reset({ speed: 20, angle: 45, gravity: 9.81 })
    expect(num(s.speed)).toBe(20)
    expect(num(s.angle)).toBe(45)
    expect(num(s.gravity)).toBe(9.81)
    let s2 = s
    for (let i = 0; i < 50; i++) s2 = projectile.step(s2, DT, { speed: 20, angle: 45, gravity: 9.81 })
    expect(num(s2.speed)).toBe(20)
    expect(num(s2.angle)).toBe(45)
    expect(num(s2.gravity)).toBe(9.81)
    // Also survive the grounded clamp path.
    const grounded = runToGround({ speed: 20, angle: 45, gravity: 9.81 })
    expect(num(grounded.speed)).toBe(20)
    expect(num(grounded.gravity)).toBe(9.81)
  })
})
