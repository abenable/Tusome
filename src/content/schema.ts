// Zod 4 schemas for content packs — the single source of truth.
//
// Derive JSON Schema for the authoring tools from these with `z.toJSONSchema(...)`
// rather than maintaining a second definition. See docs/plan/03-architecture.md
// §"Content pack schema" and docs/plan/00-decisions.md §2.
//
// Two rules from the architecture doc that matter more than the fields:
//
//   1. `schemaVersion` is `z.literal(1)` from day one. Packs live on machines we
//      cannot reach; a v2 app will meet a v1 pack in a school in 2028. Bump this
//      on any breaking change.
//   2. `explanation` is required on every question. Offline means no teacher
//      Googling the answer. If the schema lets an author skip it, they will —
//      so the schema must not.
//
// Images referenced by body blocks live beside the JSON in the pack folder and
// are resolved relative to it — never absolute paths, never remote URLs. The
// `image` block enforces that with a `.refine`.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export const Question = z
  .object({
    id: z.string(),
    prompt: z.string(),
    kind: z.enum(["single", "multi", "numeric"]),
    options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
    correct: z.array(z.string()).min(1),
    // For `kind: "numeric"` only — absolute tolerance on the correct value.
    tolerance: z.number().optional(),
    // Always shown after answering, regardless of correctness. Required.
    explanation: z.string(),
  })
  .superRefine((q, ctx) => {
    if (q.kind === "single" || q.kind === "multi") {
      // A choice question with no options renders zero inputs, so it can never
      // be answered and Submit stays permanently disabled. Reject it at the
      // schema so authoring tools can't ship an unanswerable question.
      if (!q.options || q.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `a "${q.kind}" question needs at least one option`,
          path: ["options"],
        });
        return;
      }
      // Every correct id must name an actual option, else the question can
      // never be answered right.
      const optionIds = new Set(q.options.map((o) => o.id));
      for (const c of q.correct) {
        if (!optionIds.has(c)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `correct id "${c}" is not among the options`,
            path: ["correct"],
          });
        }
      }
      if (q.kind === "single" && q.correct.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a single-choice question must have exactly one correct answer",
          path: ["correct"],
        });
      }
    } else {
      // numeric: no options; exactly one correct value that parses to a finite
      // number. Without this, `Number("abc") = NaN` validates clean and the
      // quiz can never mark the answer right.
      if (q.options !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a numeric question must not have options",
          path: ["options"],
        });
      }
      if (q.correct.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a numeric question must have exactly one correct value",
          path: ["correct"],
        });
      } else if (!Number.isFinite(Number(q.correct[0]))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "the numeric correct value must parse to a finite number",
          path: ["correct", 0],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Simulation reference
// ---------------------------------------------------------------------------

export const SimRef = z.object({
  // Must exist in the sim registry (src/sims/index.ts). The loader does not
  // enforce this — a pack naming an unknown simId is ignored at render time,
  // never a hard failure.
  simId: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  caption: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Body blocks — a discriminated union on `type`
// ---------------------------------------------------------------------------

const TextBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const EquationBlock = z.object({
  type: z.literal("equation"),
  // Either LaTeX or a plain math expression is accepted; the renderer decides.
  latex: z.string().optional(),
  expr: z.string().optional(),
});

// Rejects anything that is not a relative path within the pack folder:
//   - leading "/" (POSIX absolute)
//   - drive letter like "C:\..." (Windows absolute)
//   - "http://" / "https://" URLs (remote — never allowed offline)
//   - UNC paths "\\..."
const relativeImagePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/"), "absolute paths are not allowed")
  .refine((p) => !/^[a-zA-Z]:[\\/]/.test(p), "drive-letter paths are not allowed")
  .refine((p) => !p.startsWith("\\"), "UNC paths are not allowed")
  .refine(
    (p) => !/^https?:\/\//i.test(p),
    "remote URLs are not allowed — images must live beside the pack JSON",
  );

const ImageBlock = z.object({
  type: z.literal("image"),
  src: relativeImagePath,
  alt: z.string(),
});

export const Block = z.discriminatedUnion("type", [
  TextBlock,
  ImageBlock,
  EquationBlock,
]);

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

export const Topic = z.object({
  // Convention: subject.level.strand.topic — e.g. "phy.s2.motion.projectile".
  id: z.string(),
  title: z.string(),
  subject: z.enum(["physics", "chemistry", "biology", "mathematics"]),
  level: z.enum(["S1", "S2", "S3", "S4"]),
  strand: z.string(), // from the NCDC syllabus
  subStrand: z.string(),
  // Verbatim NCDC learning outcomes — teachers cross-check against the
  // official document. Keep them as authored.
  outcomes: z.array(z.string()).min(1),
  body: z.array(Block),
  sim: SimRef.optional(),
  quiz: z.array(Question).min(1),
});

// ---------------------------------------------------------------------------
// Pack
// ---------------------------------------------------------------------------

export const Pack = z.object({
  packId: z.string(),
  version: z.number().int().positive(),
  // From day one. See header.
  schemaVersion: z.literal(1),
  topics: z.array(Topic).min(1),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type QuestionT = z.infer<typeof Question>;
export type SimRefT = z.infer<typeof SimRef>;
export type BlockT = z.infer<typeof Block>;
export type TopicT = z.infer<typeof Topic>;
export type PackT = z.infer<typeof Pack>;
