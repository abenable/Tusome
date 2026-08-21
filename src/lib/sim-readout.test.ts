// Unit tests for the sim-readout pure helper (W8).
// Run with `bun test`. No testing-library dependency — these are pure
// function assertions, which is all the a11y smoke we can do without adding
// a dep (the human Gate-3 traversal covers the rest).

import { describe, expect, it } from "bun:test";

import { simReadoutLines, formatValue } from "@/lib/sim-readout";
import type { SimModule, SimState } from "@/sims";

// A minimal mock module shape — only `controls` is read by the helper, so we
// cast a partial object to SimModule for the test (the helper's signature is
// `Pick<SimModule, "controls" | "telemetry">`, which is exactly what we pass).
function mockModule(
  controls: SimModule["controls"],
  telemetry?: SimModule["telemetry"],
): Pick<SimModule, "controls" | "telemetry"> {
  return telemetry ? { controls, telemetry } : { controls };
}

describe("simReadoutLines", () => {
  it("returns one line per control with the control's label and a formatted value", () => {
    const controls = [
      { key: "speed", label: "Initial speed", min: 0, max: 50, step: 1 },
      { key: "angle", label: "Launch angle", min: 0, max: 90, step: 1 },
      { key: "gravity", label: "Gravity", min: 0, max: 20, step: 0.01 },
    ];
    const state: SimState = {
      speed: 20,
      angle: 45,
      gravity: 9.81,
    };
    const lines = simReadoutLines(mockModule(controls), state);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ label: "Initial speed", value: "20" });
    expect(lines[1]).toEqual({ label: "Launch angle", value: "45" });
    expect(lines[2]).toEqual({ label: "Gravity", value: "9.81" });
  });

  it("formats a finite float to two decimals", () => {
    const controls = [{ key: "g", label: "Gravity", min: 0, max: 20, step: 0.01 }];
    const state: SimState = { g: 9.81 };
    expect(simReadoutLines(mockModule(controls), state)[0]).toEqual({
      label: "Gravity",
      value: "9.81",
    });
  });

  it("formats a finite integer without decimals", () => {
    const controls = [{ key: "n", label: "Count", min: 0, max: 10, step: 1 }];
    const state: SimState = { n: 7 };
    expect(simReadoutLines(mockModule(controls), state)[0]).toEqual({
      label: "Count",
      value: "7",
    });
  });

  it("returns '—' for a control whose state key is missing (no crash)", () => {
    const controls = [
      { key: "speed", label: "Speed", min: 0, max: 50, step: 1 },
      { key: "angle", label: "Angle", min: 0, max: 90, step: 1 },
    ];
    const state: SimState = { speed: 10 }; // angle missing
    const lines = simReadoutLines(mockModule(controls), state);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ label: "Speed", value: "10" });
    expect(lines[1]).toEqual({ label: "Angle", value: "—" });
  });

  it("returns [] for a module with empty controls (no crash)", () => {
    const lines = simReadoutLines(mockModule([]), {});
    expect(lines).toEqual([]);
  });

  it("handles a control whose state value is an array (defensive — no throw)", () => {
    const controls = [
      { key: "trail", label: "Trail", min: 0, max: 100, step: 1 },
    ];
    // A sim wouldn't normally put a trail under a control key, but be safe.
    const state: SimState = { trail: [[0, 0], [1, 1], [2, 2]] };
    const lines = simReadoutLines(mockModule(controls), state);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ label: "Trail", value: "3 values" });
  });

  it("appends telemetry lines after control lines, with units", () => {
    const controls = [
      { key: "speed", label: "Initial speed", min: 0, max: 50, step: 1 },
    ];
    const telemetry: SimModule["telemetry"] = (s) => [
      { label: "Height", value: typeof s.y === "number" ? s.y : 0, unit: "m" },
      { label: "Time", value: typeof s.t === "number" ? s.t : 0, unit: "s" },
    ];
    const state: SimState = { speed: 20, y: 8.62, t: 1.37 };
    const lines = simReadoutLines(mockModule(controls, telemetry), state);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ label: "Initial speed", value: "20" });
    expect(lines[1]).toEqual({ label: "Height", value: "8.62 m" });
    expect(lines[2]).toEqual({ label: "Time", value: "1.37 s" });
  });

  it("renders no telemetry lines when the sim has no telemetry hook", () => {
    const controls = [
      { key: "speed", label: "Initial speed", min: 0, max: 50, step: 1 },
    ];
    const state: SimState = { speed: 20 };
    const lines = simReadoutLines(mockModule(controls), state);
    expect(lines).toHaveLength(1);
  });

  it("the real projectile module exposes height/range/time/speed telemetry", () => {
    const { projectile } = require("@/sims/projectile") as {
      projectile: SimModule;
    };
    const s = projectile.reset({ speed: 20, angle: 45, gravity: 9.81 });
    const lines = simReadoutLines(projectile, s);
    const labels = lines.map((l) => l.label);
    expect(labels).toContain("Height");
    expect(labels).toContain("Range");
    expect(labels).toContain("Time");
    expect(labels).toContain("Speed");
  });
});

describe("formatValue", () => {
  it("returns '—' for undefined", () => {
    expect(formatValue(undefined)).toBe("—");
  });

  it("returns '—' for NaN and ±Infinity", () => {
    expect(formatValue(NaN)).toBe("—");
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatValue(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("returns a plain integer string for integer numbers", () => {
    expect(formatValue(0)).toBe("0");
    expect(formatValue(-3)).toBe("-3");
    expect(formatValue(42)).toBe("42");
  });

  it("returns a 2-decimal string for non-integer finite numbers", () => {
    expect(formatValue(9.81)).toBe("9.81");
    expect(formatValue(3.14159)).toBe("3.14");
    expect(formatValue(-1.5)).toBe("-1.50");
  });

  it("returns a '<n> values' summary for number[] and [number,number][]", () => {
    expect(formatValue([1, 2, 3])).toBe("3 values");
    expect(formatValue([[0, 1], [2, 3]])).toBe("2 values");
    expect(formatValue([])).toBe("0 values");
  });
});
