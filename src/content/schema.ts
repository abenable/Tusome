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
// No quiz: the quiz engine (question schema, seeded randomization, DB writes,
// dashboards) was removed — the app isn't ready to ship quiz content yet. A
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
  // Position within the syllabus's own term-by-term programme planner (1 =
  // taught first). Optional so single-topic packs can omit it; the grouping
  // helper (src/lib/topics-group.ts) falls back to a stable but undefined
  // order for topics that don't set it. Without this, topics render in
  // whatever order the filesystem happens to list pack directories, which has
  // no relationship to teaching order.
  order: z.number().int().optional(),
  // Verbatim NCDC learning outcomes — teachers cross-check against the
  // official document. Keep them as authored.
  outcomes: z.array(z.string()).min(1),
  body: z.array(Block),
  sim: SimRef.optional(),
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

export type SimRefT = z.infer<typeof SimRef>;
export type BlockT = z.infer<typeof Block>;
export type TopicT = z.infer<typeof Topic>;
export type PackT = z.infer<typeof Pack>;
