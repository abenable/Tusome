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
