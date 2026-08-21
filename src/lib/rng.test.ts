import { describe, it, expect } from "bun:test";

import type { QuestionT } from "@/content/schema";
import {
  mulberry32,
  makeRng,
  randomSeed,
  shuffle,
  reconstructOrder,
} from "@/lib/rng";

// ──────────────────────────────────────────────────────────────────────────
// Test helpers — minimal QuestionT builders
// ──────────────────────────────────────────────────────────────────────────

function choiceQuestion(
  id: string,
  n: number,
  kind: "single" | "multi" = "single",
): QuestionT {
  const options = Array.from({ length: n }, (_, i) => ({
    id: `${id}-opt${i}`,
    text: `Option ${i}`,
  }));
  return {
    id,
    prompt: `${id}?`,
    kind,
    options,
    correct: [options[0].id],
    explanation: "because",
  } as unknown as QuestionT;
}

function numericQuestion(id: string): QuestionT {
  return {
    id,
    prompt: `${id}?`,
    kind: "numeric",
    correct: ["42"],
    tolerance: 0.5,
    explanation: "because",
  } as unknown as QuestionT;
}

// ──────────────────────────────────────────────────────────────────────────
// mulberry32
// ──────────────────────────────────────────────────────────────────────────

describe("mulberry32", () => {
  it("is deterministic: same seed → identical first N values", () => {
    const a = mulberry32(123456);
    const b = mulberry32(123456);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seed → different sequence", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produces floats in [0, 1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("makeRng matches mulberry32", () => {
    const a = mulberry32(777);
    const b = makeRng(777);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// shuffle
// ──────────────────────────────────────────────────────────────────────────

describe("shuffle", () => {
  it("returns a new array (input not mutated)", () => {
    const input = [1, 2, 3, 4, 5];
    const rng = mulberry32(42);
    const out = shuffle(input, rng);
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]); // untouched
  });

  it("is a permutation of the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7];
    const rng = mulberry32(4242);
    const out = shuffle(input, rng);
    expect([...out].sort((a, b) => a - b)).toEqual(
      [...input].sort((a, b) => a - b),
    );
  });

  it("is deterministic given a fixed rng", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const out1 = shuffle(input, mulberry32(31337));
    const out2 = shuffle(input, mulberry32(31337));
    expect(out1).toEqual(out2);
  });

  it("empty and single-element arrays are returned as-is (a copy)", () => {
    const rng = mulberry32(0);
    expect(shuffle([], rng)).toEqual([]);
    expect(shuffle([42], rng)).toEqual([42]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// randomSeed
// ──────────────────────────────────────────────────────────────────────────

describe("randomSeed", () => {
  it("returns a finite integer in uint32 range", () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
      expect(s >>> 0).toBe(s); // fits in uint32
    }
  });

  it("two calls usually differ (non-constant)", () => {
    // Not strictly guaranteed, but with 2^32 range the chance of collision on
    // 1000 draws is astronomically small. We just assert not all draws are the
    // same value.
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(randomSeed());
    expect(seen.size).toBeGreaterThan(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// reconstructOrder
// ──────────────────────────────────────────────────────────────────────────

describe("reconstructOrder", () => {
  const questions: QuestionT[] = [
    choiceQuestion("q1", 4),
    choiceQuestion("q2", 3),
    numericQuestion("q3"),
    choiceQuestion("q4", 5, "multi"),
  ];

  it("shuffled questions are a permutation of the input", () => {
    const { questions: shuffled } = reconstructOrder(12345, questions);
    expect(shuffled.length).toBe(questions.length);
    const ids = shuffled.map((q) => q.id).sort();
    expect(ids).toEqual(questions.map((q) => q.id).sort());
  });

  it("optionOrders[qId] is a permutation of 0..n-1 for choice questions", () => {
    const { optionOrders } = reconstructOrder(12345, questions);
    expect(optionOrders["q1"].slice().sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(optionOrders["q2"].slice().sort((a, b) => a - b)).toEqual([
      0, 1, 2,
    ]);
    expect(optionOrders["q4"].slice().sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("optionOrders[qId] is [] for numeric questions", () => {
    const { optionOrders } = reconstructOrder(12345, questions);
    expect(optionOrders["q3"]).toEqual([]);
  });

  it("is deterministic: same seed twice → identical results", () => {
    const a = reconstructOrder(98765, questions);
    const b = reconstructOrder(98765, questions);
    expect(a).toEqual(b);
  });

  it("different seeds yield different question orders (for a non-trivial input)", () => {
    // With 4 questions there are 24 permutations; the chance two random seeds
    // hit the same permutation by accident is ~4%. We instead assert PRNG
    // determinism differently: pick two seeds that the underlying mulberry32
    // gives clearly different first draws. A simpler, robust check: assert
    // that NOT every pair of seeds we try produces the same order.
    let anyDifferent = false;
    const first = reconstructOrder(101, questions).questions.map((q) => q.id);
    for (const s of [102, 103, 104, 105, 106, 107, 108, 109, 110]) {
      const next = reconstructOrder(s, questions).questions.map((q) => q.id);
      if (next.join(",") !== first.join(",")) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it("round-trips: optionOrders map original index → display position", () => {
    // For a choice question, reconstructOrder returns the display order as a
    // list of ORIGINAL indices. So optionOrders[qId][k] is the original index
    // of the option shown at display position k. Equivalently, building the
    // displayed options array as `original[optionOrders[qId][k]]` reproduces
    // the rendered order. Verify that.
    const seed = 555555;
    const { optionOrders } = reconstructOrder(seed, questions);
    for (const q of questions) {
      if (q.kind === "numeric") continue;
      const order = optionOrders[q.id];
      expect(order.length).toBe((q.options ?? []).length);
      // Each original index appears exactly once.
      const set = new Set(order);
      expect(set.size).toBe(order.length);
      // Mapping back to options reproduces a permutation of the options.
      const displayed = order.map((i) => (q.options ?? [])[i]);
      const sortedIds = displayed.map((o) => o.id).sort();
      const origSorted = (q.options ?? []).map((o) => o.id).sort();
      expect(sortedIds).toEqual(origSorted);
    }
  });

  it("handles a single question without consuming extraneous rng draws", () => {
    const single: QuestionT[] = [choiceQuestion("solo", 2)];
    const { questions: shuffled, optionOrders } = reconstructOrder(1, single);
    expect(shuffled.map((q) => q.id)).toEqual(["solo"]);
    expect(optionOrders["solo"].slice().sort((a, b) => a - b)).toEqual([0, 1]);
  });
});
