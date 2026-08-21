// Deterministic, seeded randomization for the quiz engine.
//
// Scope decision 5 (docs/plan/00-decisions.md): randomization is always-on at
// the app level — deterministic seeded shuffle, with the seed persisted per
// attempt in `quiz_attempts.seed`. No per-pack flag (that would need a schema
// change). Retakes get a fresh seed.
//
// All pure, no React, no IO, no DOM. Type-only import of `QuestionT` keeps this
// module free of the Zod runtime.

import type { QuestionT } from "@/content/schema";

// ──────────────────────────────────────────────────────────────────────────
// PRNG
// ──────────────────────────────────────────────────────────────────────────

/**
 * mulberry32 — a tiny, fast, deterministic PRNG that returns a function
 * producing floats in [0, 1). Same seed → same sequence, forever. This is the
 * only source of "randomness" the quiz uses once a seed is fixed; that's what
 * makes `reconstructOrder` able to reproduce exactly what a student saw.
 *
 * Reference implementation (public domain, by Bryan O'Sullivan).
 */
export function mulberry32(seed: number): () => number {
  // The internal state is kept as a 32-bit unsigned int. `>>> 0` keeps the
  // multiplication carries in uint32 range regardless of JS's number width.
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: build an rng function from a seed. */
export function makeRng(seed: number): () => number {
  return mulberry32(seed);
}

/**
 * Generate a fresh uint32 seed. Non-determinism here is fine — the SEED is the
 * thing that gets persisted, and the shuffle then becomes deterministic from
 * it. `crypto.getRandomValues` is available in the Tauri webview and in
 * Node/Bun (test runtime); fall back to `Math.random` if it's somehow absent.
 */
export function randomSeed(): number {
  const c =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
      ? globalThis.crypto
      : null;
  if (c) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Shuffle
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fisher–Yates shuffle. Returns a NEW array; the input is never mutated.
 * Deterministic given the same rng sequence (the caller controls the rng, so
 * the same seed → the same permutation).
 *
 * Iterates from the end so the swap pattern is the canonical
 * "for i = n-1 down to 1, swap(i, randInt(0..i))" — this is the exact shape
 * `reconstructOrder` reproduces, so the two stay in lockstep.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // Integer in [0, i]. `Math.floor(rng() * (i + 1))` is unbiased for the
    // modest sizes we deal with (questions / options per question).
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Quiz order reconstruction — the single source of truth
// ──────────────────────────────────────────────────────────────────────────

export interface QuizOrder {
  /** The questions in the shuffled order the student saw them. */
  questions: QuestionT[];
  /**
   * For each question id, an array of ORIGINAL option indices in the order
   * they were displayed. Empty for numeric questions (no options).
   */
  optionOrders: Record<string, number[]>;
}

/**
 * Reproduce EXACTLY what a student saw, given the seed and the ORIGINAL
 * (authored-order) questions array.
 *
 * The quiz itself calls this to derive its display order, so there is one
 * source of truth — the quiz and `reconstructOrder` cannot drift apart. W6
 * (teacher per-question breakdown) calls this with a persisted seed to show a
 * student's exact view.
 *
 * Order of rng draws:
 *   1. shuffle the question array (one Fisher–Yates pass).
 *   2. for EACH question, in its SHUFFLED order, shuffle its options
 *      (numeric questions skipped — no draws consumed).
 * Because option shuffles consume rng state in shuffled-question order, the
 * same seed reproduces the same option permutations only if you walk the
 * shuffled questions in the same order — which both the quiz and this helper
 * do. Keep that contract: never reorder the draws.
 */
export function reconstructOrder(
  seed: number,
  questions: QuestionT[],
): QuizOrder {
  const rng = mulberry32(seed);

  // 1) Question order.
  const shuffledQuestions = shuffle(questions, rng);

  // 2) Option order per question, drawn in shuffled-question order so the rng
  //    stream matches exactly what the quiz consumed at render time.
  const optionOrders: Record<string, number[]> = {};
  for (const q of shuffledQuestions) {
    if (q.kind === "numeric") {
      optionOrders[q.id] = [];
      continue;
    }
    const originalOptions = q.options ?? [];
    // Original indices: [0, 1, ..., n-1]. Shuffle those, then map back to the
    // options in their authored order — this gives the display order as a list
    // of original positions, which is what a teacher breakdown needs.
    const indices = originalOptions.map((_, i) => i);
    const shuffledIndices = shuffle(indices, rng);
    optionOrders[q.id] = shuffledIndices;
  }

  return { questions: shuffledQuestions, optionOrders };
}
