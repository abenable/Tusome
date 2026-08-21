import { describe, it, expect } from "bun:test";

import { resolveInitialState } from "@/lib/student-context";
import type { StudentRow } from "@/db/index";

// Minimal StudentRow builder — resolveInitialState only reads `id`.
function row(id: number, display_name = "x"): StudentRow {
  return {
    id,
    display_name,
    class_label: null,
    created_at: "2026-01-01",
  };
}

describe("resolveInitialState — Guest default & persisted choice", () => {
  it("with no persisted setting and an empty students list → needs-pick", () => {
    const state = resolveInitialState([], null);
    expect(state.status).toBe("needs-pick");
    expect(state.studentId).toBeNull();
    expect(state.student).toBeNull();
  });

  it("with no persisted setting and a non-empty students list → needs-pick (Guest is selectable, not automatic)", () => {
    const state = resolveInitialState([row(1, "A")], null);
    expect(state.status).toBe("needs-pick");
    expect(state.studentId).toBeNull();
    expect(state.student).toBeNull();
  });

  it('persisted "guest" → ready, Guest (studentId null, student null)', () => {
    const state = resolveInitialState([row(1, "A")], "guest");
    expect(state.status).toBe("ready");
    expect(state.studentId).toBeNull();
    expect(state.student).toBeNull();
  });

  it("persisted id matching a real row → ready, that student", () => {
    const students = [row(1, "A"), row(2, "B")];
    const state = resolveInitialState(students, "2");
    expect(state.status).toBe("ready");
    expect(state.studentId).toBe(2);
    expect(state.student).toEqual(students[1]);
  });

  it("persisted id that no longer matches a row → needs-pick (deleted student forces a deliberate re-pick)", () => {
    const state = resolveInitialState([row(1, "A")], "99");
    expect(state.status).toBe("needs-pick");
    expect(state.studentId).toBeNull();
    expect(state.student).toBeNull();
  });

  it("empty persisted string → needs-pick (treated as not-yet-picked)", () => {
    const state = resolveInitialState([row(1, "A")], "");
    expect(state.status).toBe("needs-pick");
  });

  it("non-numeric persisted value → needs-pick (defensive)", () => {
    const state = resolveInitialState([row(1, "A")], "not-a-number");
    expect(state.status).toBe("needs-pick");
  });

  it("persisted id with a matching row takes priority over students list order", () => {
    const students = [row(3, "C"), row(1, "A"), row(2, "B")];
    const state = resolveInitialState(students, "1");
    expect(state.studentId).toBe(1);
    expect(state.student?.display_name).toBe("A");
  });
});
