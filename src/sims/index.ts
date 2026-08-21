export interface SimState {
  [key: string]: number
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
