// The four lower-secondary CBC subjects. These four strings will not change.
//
// Single source of truth for the subject enum used by routes, content packs
// (src/content/schema.ts mirrors this list), and the DB. The route `$subject`
// param is validated against `isSubject` so an unknown value renders an empty
// state rather than throwing. See docs/plan/03-architecture.md §"State
// ownership" and 04-vertical-slice.md step 1.
//
// Keep the order stable — it drives the subject picker grid, and a re-order
// is a visible UI change.

export const SUBJECTS = [
  "physics",
  "chemistry",
  "biology",
  "mathematics",
] as const

export type Subject = (typeof SUBJECTS)[number]

// Display names shown in the UI. Sentence-case, human-readable.
export const SUBJECT_LABELS: Record<Subject, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  mathematics: "Mathematics",
}

/** Type guard for an untrusted `$subject` route param. */
export function isSubject(x: string | undefined): x is Subject {
  return x !== undefined && (SUBJECTS as readonly string[]).includes(x)
}

// ── Per-subject accent colours ────────────────────────────────────────────
//
// The design (claude.ai/design "UI design improvement request") colour-codes
// every subject: a solid for icon chips, text and filled buttons, and a pale
// tint for badge backgrounds. These map to the `--color-{subject}` /
// `--color-{subject}-tint` tokens in src/index.css.
//
// Written out as whole class names rather than composed at runtime
// (`bg-${subject}`) because Tailwind scans source text: an interpolated class
// is never generated and the chip renders transparent.

export interface SubjectAccent {
  /** Filled chip / icon tile background. */
  bg: string
  /** Accent text (headings, links). */
  text: string
  /** Pale badge background, e.g. behind "Physics · S2". */
  tint: string
  /** Border for outlined controls in the subject's colour. */
  border: string
}

export const SUBJECT_ACCENTS: Record<Subject, SubjectAccent> = {
  physics: {
    bg: "bg-physics",
    text: "text-physics",
    tint: "bg-physics-tint",
    border: "border-physics",
  },
  chemistry: {
    bg: "bg-chemistry",
    text: "text-chemistry",
    tint: "bg-chemistry-tint",
    border: "border-chemistry",
  },
  biology: {
    bg: "bg-biology",
    text: "text-biology",
    tint: "bg-biology-tint",
    border: "border-biology",
  },
  mathematics: {
    bg: "bg-mathematics",
    text: "text-mathematics",
    tint: "bg-mathematics-tint",
    border: "border-mathematics",
  },
}

/**
 * One-line subject descriptions, shown on the subject picker cards.
 * Verbatim from the design's SubjectPicker screen.
 */
export const SUBJECT_BLURBS: Record<Subject, string> = {
  physics: "Motion, forces, waves and energy.",
  chemistry: "Matter, reactions and the periodic table.",
  biology: "Cells, the human body and genetics.",
  mathematics: "Algebra, geometry and statistics.",
}
