// A sim's state is a string-keyed bag of numbers, arrays of numbers, or a
// trail of [x, y] pairs. `step` must not mutate the state it is given; it
// returns a new state object. Widening from `number` only → `SimValue` is what
// lets a sim carry a trail without leaving the registry-facing interface.
export type SimValue = number | number[] | [number, number][]

export interface SimState {
  [key: string]: SimValue
}

export interface SimModule {
  id: string
  defaults: Record<string, number>
  controls: Array<{ key: string; label: string; min: number; max: number; step: number }>
  /** Advance state by dt seconds. Pure — no drawing, no DOM. */
  step(state: SimState, dt: number, params: Record<string, number>): SimState
  /** Draw current state. No physics. */
  draw(ctx: CanvasRenderingContext2D, state: SimState, w: number, h: number): void
  reset(params: Record<string, number>): SimState
}

/** id -> module registry. Populated in Phase 1 (04-vertical-slice.md). */
export const sims: Record<string, SimModule> = {}

export function getSim(id: string): SimModule | undefined {
  return sims[id]
}

import { projectile } from './projectile'
sims['projectile'] = projectile
