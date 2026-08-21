import { describe, it, expect } from "bun:test";

import type { QuestionT } from "@/content/schema";
import { gradeAnswer } from "@/lib/quiz-grade";

// Minimal builders that satisfy QuestionT without dragging the Zod refine.
function single(id: string, correct = "opt-a"): QuestionT {
  return {
    id,
    prompt: `${id}?`,
    kind: "single",
    options: [
      { id: "opt-a", text: "A" },
      { id: "opt-b", text: "B" },
    ],
    correct: [correct],
    explanation: "because",
  } as unknown as QuestionT;
}

function multi(id: string, correct: string[]): QuestionT {
  return {
    id,
    prompt: `${id}?`,
    kind: "multi",
    options: [
      { id: "opt-a", text: "A" },
      { id: "opt-b", text: "B" },
      { id: "opt-c", text: "C" },
    ],
    correct,
    explanation: "because",
  } as unknown as QuestionT;
}

function numeric(id: string, correct: string, tolerance?: number): QuestionT {
  return {
    id,
    prompt: `${id}?`,
    kind: "numeric",
    correct: [correct],
    tolerance,
    explanation: "because",
  } as unknown as QuestionT;
}

describe("gradeAnswer — single choice", () => {
  it("is right when the answer id matches correct[0]", () => {
    expect(gradeAnswer(single("q1", "opt-b"), "opt-b")).toBe(true);
  });

  it("is wrong when the answer id differs from correct[0]", () => {
    expect(gradeAnswer(single("q1", "opt-a"), "opt-b")).toBe(false);
  });

  it("is wrong when there is no recorded answer (undefined)", () => {
    expect(gradeAnswer(single("q1", "opt-a"), undefined)).toBe(false);
  });

  it("is wrong when the recorded answer is the wrong type (array for single)", () => {
    expect(gradeAnswer(single("q1", "opt-a"), ["opt-a"])).toBe(false);
  });

  it("is wrong when the recorded answer is a number (type mismatch)", () => {
    expect(gradeAnswer(single("q1", "opt-a"), 1)).toBe(false);
  });
});

describe("gradeAnswer — multi choice (set-equal, order-independent)", () => {
  it("is right when the chosen set equals the correct set (same order)", () => {
    expect(gradeAnswer(multi("q1", ["opt-a", "opt-b"]), ["opt-a", "opt-b"])).toBe(
      true,
    );
  });

  it("is right when the chosen set equals the correct set (different order)", () => {
    expect(gradeAnswer(multi("q1", ["opt-a", "opt-b"]), ["opt-b", "opt-a"])).toBe(
      true,
    );
  });

  it("is wrong when the chosen set is a proper subset of the correct set", () => {
    expect(gradeAnswer(multi("q1", ["opt-a", "opt-b"]), ["opt-a"])).toBe(false);
  });

  it("is wrong when the chosen set is a proper superset of the correct set", () => {
    expect(
      gradeAnswer(multi("q1", ["opt-a", "opt-b"]), ["opt-a", "opt-b", "opt-c"]),
    ).toBe(false);
  });

  it("is wrong when the chosen set is disjoint from the correct set", () => {
    expect(gradeAnswer(multi("q1", ["opt-a", "opt-b"]), ["opt-c"])).toBe(false);
  });

  it("is right for an empty chosen set iff the correct set is also empty", () => {
    // An empty correct set on a multi question is schema-invalid, but the
    // grader should still handle it without throwing — set-equal empty == empty.
    expect(gradeAnswer(multi("q1", []), [])).toBe(true);
    expect(gradeAnswer(multi("q1", ["opt-a"]), [])).toBe(false);
  });

  it("is wrong when the recorded answer is a string instead of an array", () => {
    expect(gradeAnswer(multi("q1", ["opt-a"]), "opt-a")).toBe(false);
  });

  it("is wrong when the recorded answer is undefined (not answered)", () => {
    expect(gradeAnswer(multi("q1", ["opt-a"]), undefined)).toBe(false);
  });
});

describe("gradeAnswer — numeric (tolerance)", () => {
  it("is right on an exact match (default tolerance 0)", () => {
    expect(gradeAnswer(numeric("q1", "42"), 42)).toBe(true);
  });

  it("is wrong when off and tolerance is 0", () => {
    expect(gradeAnswer(numeric("q1", "42"), 42.1)).toBe(false);
  });

  it("is right within the tolerance window", () => {
    expect(gradeAnswer(numeric("q1", "42", 0.5), 42.3)).toBe(true);
    expect(gradeAnswer(numeric("q1", "42", 0.5), 42.5)).toBe(true);
  });

  it("is wrong outside the tolerance window", () => {
    expect(gradeAnswer(numeric("q1", "42", 0.5), 42.6)).toBe(false);
  });

  it("tolerance is inclusive at the boundary", () => {
    expect(gradeAnswer(numeric("q1", "42", 1), 43)).toBe(true);
    expect(gradeAnswer(numeric("q1", "42", 1), 41)).toBe(true);
    expect(gradeAnswer(numeric("q1", "42", 1), 43.01)).toBe(false);
  });

  it("is wrong when the recorded answer is a string (type mismatch)", () => {
    expect(gradeAnswer(numeric("q1", "42"), "42")).toBe(false);
  });

  it("is wrong when the recorded answer is NaN", () => {
    expect(gradeAnswer(numeric("q1", "42"), Number.NaN)).toBe(false);
  });

  it("is wrong when the recorded answer is undefined", () => {
    expect(gradeAnswer(numeric("q1", "42"), undefined)).toBe(false);
  });

  it("handles a negative correct value", () => {
    expect(gradeAnswer(numeric("q1", "-9.8"), -9.8)).toBe(true);
    expect(gradeAnswer(numeric("q1", "-9.8", 0.05), -9.81)).toBe(true);
  });
});
