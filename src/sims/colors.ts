/**
 * Canvas palette, in sRGB hex.
 *
 * Its own module, not part of ./index, on purpose: `index.ts` imports every
 * sim to populate the registry, so a sim importing a runtime value back out of
 * `index` closes a cycle and the sim's binding is still in its temporal dead
 * zone when the registry line runs. Types were fine (erased); values are not.
 *
 * Canvas2D takes literal colour strings — it cannot read the `--color-*`
 * custom properties that style the rest of the app. These are the sRGB
 * equivalents of the design tokens in src/index.css, resolved once here so a
 * sim's `draw` never inlines a hex and the two palettes can't drift silently.
 * If a token changes there, change it here.
 */
export const SIM_COLORS = {
  /** --color-canvas — the plot background. */
  canvas: '#f3f5f8',
  /** --color-ink — axes, the projectile body, readout text. */
  ink: '#1b1f26',
  /** --color-ink-3 — de-emphasised labels. */
  ink3: '#66696f',
  /** --color-physics — the trajectory itself. */
  physics: '#1f6dd8',
} as const

/** The app's UI font, for `ctx.font`. Matches --font-sans in src/index.css. */
export const SIM_FONT = '"Manrope", system-ui, sans-serif'
