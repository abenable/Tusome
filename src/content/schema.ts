// Zod 4 schemas for content packs — the single source of truth.
//
// Derive JSON Schema for the authoring tools from these with `z.toJSONSchema(...)`
// rather than maintaining a second definition. See docs/plan/03-architecture.md
// §"Content pack schema" and docs/plan/00-decisions.md §2.
//
// `schemaVersion` is `z.literal(1)` from day one. Packs live on machines we
// cannot reach; a v2 app will meet a v1 pack in a school in 2028. Bump this
// on any breaking change.
//
// Images referenced by body blocks live beside the JSON in the pack folder and
// are resolved relative to it — never absolute paths, never remote URLs. The
// `image` block enforces that with a `.refine`.
//
// No quizzes or marks, by design: Tusome is for learning without pressure. A
// topic is body + an optional sim only.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Simulation reference
// ---------------------------------------------------------------------------

export const SimRef = z.union([
  // Custom TS sim module from the registry (src/sims/index.ts). The existing
  // projectile pack uses this shape. The loader distinguishes by the presence
  // of `simId` (custom) vs `phet` (PhET).
  z.object({
    simId: z.string(),
    params: z.record(z.string(), z.unknown()).default({}),
    caption: z.string().optional(),
  }),
  // PhET HTML5 sim — a single self-contained HTML file in content/sims/, loaded
  // in an iframe via the Tauri asset protocol. `phet` is the filename (e.g.
  // "circuit-construction-kit-dc_en.html"). See content/sims/phet-manifest.json
  // for the curated list; scripts/fetch-phet-sims.sh downloads + sha256-verifies.
  z.object({
    phet: z.string(),
    caption: z.string().optional(),
  }),
]);

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
  // How read-aloud says it, e.g. "rho equals m over V". Without it the
  // equation is skipped when reading aloud — raw LaTeX is unspeakable.
  speech: z.string().optional(),
});

const HeadingBlock = z.object({
  type: z.literal("heading"),
  text: z.string(),
});

const ListBlock = z.object({
  type: z.literal("list"),
  items: z.array(z.string()).min(1),
  ordered: z.boolean().optional(),
});

// A worked example: a problem and the steps to its answer.
const ExampleBlock = z.object({
  type: z.literal("example"),
  title: z.string(),
  steps: z.array(z.string()).min(1),
});

// A boxed aside. `activity` is something to do with everyday materials,
// `think` a question to discuss (never marked), `remember` a key fact.
const CalloutBlock = z.object({
  type: z.literal("callout"),
  kind: z.enum(["activity", "think", "remember"]),
  title: z.string().optional(),
  text: z.string(),
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
  HeadingBlock,
  ListBlock,
  ExampleBlock,
  CalloutBlock,
]);

export const BLOCK_TYPES: ReadonlySet<string> = new Set(
  Block.options.map((o) => o.shape.type.value),
);

// Packs reach schools by update long before the app does, so an older app
// will meet block types it doesn't know. Drop those (the rest of the lesson
// still shows) instead of failing the whole pack. A known type with bad
// fields still fails — that's an authoring bug. `validate:content` rejects
// unknown types, so a typo can't hide behind this.
const Body = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.filter(
          (b) =>
            typeof b === "object" &&
            b !== null &&
            BLOCK_TYPES.has(String((b as { type?: unknown }).type)),
        )
      : v,
  z.array(Block),
);

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
  // Position within the syllabus's own term-by-term programme planner (1 =
  // taught first). Optional so single-topic packs can omit it; the grouping
  // helper (src/lib/topics-group.ts) falls back to a stable but undefined
  // order for topics that don't set it. Without this, topics render in
  // whatever order the filesystem happens to list pack directories, which has
  // no relationship to teaching order.
  order: z.number().int().optional(),
  // Term of the school year (1-3) the syllabus's programme planner puts this
  // topic in. Optional so older packs still load; they list under "Other".
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // Verbatim NCDC learning outcomes — teachers cross-check against the
  // official document. Keep them as authored.
  outcomes: z.array(z.string()).min(1),
  body: Body,
  sim: SimRef.optional(),
  // More simulations after `sim`. A separate field (not `sim` as an array)
  // so an older app, which drops keys it doesn't know, still shows `sim`.
  sims: z.array(SimRef).optional(),
});

/** Every simulation a topic offers, in order. */
export function topicSims(topic: { sim?: SimRefT; sims?: SimRefT[] }): SimRefT[] {
  return [...(topic.sim ? [topic.sim] : []), ...(topic.sims ?? [])];
}

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

export type SimRefT = z.infer<typeof SimRef>;
export type BlockT = z.infer<typeof Block>;
export type TopicT = z.infer<typeof Topic>;
export type PackT = z.infer<typeof Pack>;
