// Pure helper that turns a sim module + its live state into a list of
// screen-reader-friendly `{ label, value }` lines.
//
// Why this exists: the simulation's real-time values are drawn ON the canvas
// as pixels (e.g. projectile.ts draw() paints "height … range … time … g …").
// Canvas text is not exposed to the accessibility tree, so a screen-reader
// user gets nothing from the running sim. This helper builds the DOM text
// alternative that <SimCanvas> renders next to the canvas (role="status",
// aria-live="polite") so the current configuration AND the live in-flight
// telemetry are announced.
//
// Two sources of lines:
//   1. `module.controls` — the launch/configuration keys the slider panel
//      already exposes (always present).
//   2. `module.telemetry(state)` — the dynamic in-flight values (height,
//      range, time, speed) that change every step but aren't control keys.
//      Optional; a sim with no telemetry leaves it off.
//
// Formatting rules (documented for the unit tests):
//   - number, finite, integer  → `String(n)`            (e.g. 10 → "10")
//   - number, finite, non-int   → `n.toFixed(2)`         (e.g. 9.81 → "9.81")
//   - number, not finite (NaN/±∞) → "—"
//   - number[] / [number,number][] (defensive — not expected for control
//     keys, but a sim *could* stash a trail under a key) → a short summary
//     `<n> values` is returned rather than dumping the whole array, so a
//     live region doesn't blurt hundreds of coordinates.
//   - undefined / missing key   → "—"
//   - anything else (defensive) → "—"
//   - telemetry item: number formatted per the rules above, with the unit
//     appended (e.g. { value: 9.81, unit: "m/s²" } → "9.81 m/s²").
//
// The helper is PURE: same inputs → same outputs, no side effects, no I/O,
// no React. That's what makes it unit-testable without a testing library.

import type { SimModule, SimState, SimValue } from "@/sims";

export type SimReadoutLine = { label: string; value: string };

export function simReadoutLines(
  module: Pick<SimModule, "controls" | "telemetry">,
  state: SimState,
): SimReadoutLine[] {
  const lines: SimReadoutLine[] = [];
  for (const control of module.controls) {
    lines.push({
      label: control.label,
      value: formatValue(state[control.key]),
    });
  }
  if (module.telemetry) {
    for (const item of module.telemetry(state)) {
      const num = formatNumber(item.value);
      lines.push({
        label: item.label,
        value: num === "—" ? "—" : `${num}${item.unit ? " " + item.unit : ""}`,
      });
    }
  }
  return lines;
}

/** Format a single SimValue for screen-reader / DOM display. Exported for
 *  unit tests; production callers use `simReadoutLines`. */
export function formatValue(value: SimValue | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "number") return formatNumber(value);
  if (Array.isArray(value)) {
    // A trail or series. Summarise rather than dumping every coordinate into
    // an aria-live region (which would be both noisy and expensive to
    // re-announce). Length is enough for a screen-reader user to know the
    // sim is recording data.
    return `${value.length} values`;
  }
  // Defensive: a future SimValue widening could add a type we don't know
  // about. Never throw — degrade to the placeholder.
  return "—";
}

/** Format a plain number for display (integer → "10", decimal → "9.81",
 *  non-finite → "—"). Shared by control values and telemetry items. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
