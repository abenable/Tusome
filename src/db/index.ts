/**
 * CBCLab data layer — a thin typed wrapper over `@tauri-apps/plugin-sql`.
 *
 * No React here; this is pure data access. State ownership is documented in
 * docs/plan/03-architecture.md: DB reads are server-ish state consumed by
 * TanStack Query, mutations are called directly and followed by query
 * invalidation by the caller.
 */
import Database from "@tauri-apps/plugin-sql";

// ──────────────────────────────────────────────────────────────────────────
// Connection / memoisation
// ──────────────────────────────────────────────────────────────────────────
//
// appDataDir reasoning — and the app_config_dir correction:
//
// `Database.load("sqlite:cbclab.db")` uses the `sqlite:` special prefix.
// tauri-plugin-sql resolves that prefix against the Tauri *app config dir*
// (`app_config_dir()`), NOT the app data dir (`appDataDir()`). On Windows the
// two coincide (`%APPDATA%\ug.cbclab`); on Linux they split — the DB lands in
// `~/.config/ug.cbclab/cbclab.db` while content lives under
// `~/.local/share/ug.cbclab/cbclab/content/`. Two roots, but the three-directory
// guarantee the architecture doc cares about (install / content / data are all
// distinct and reinstall-safe) still holds. We pass only the bare
// `"sqlite:cbclab.db"` connection string and never hardcode a filesystem path
// or call `appDataDir()` to build one — the plugin owns that resolution. The
// actual relaunch-survival property is a human Gate-1 check
// (docs/plan/04-vertical-slice.md §2), not something this file can prove.

let dbPromise: Promise<Database> | null = null;

/** Open (once) and return the memoised SQLite connection. */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:cbclab.db");
  }
  return dbPromise;
}

// ──────────────────────────────────────────────────────────────────────────
// Row types — column names match 001_init.sql exactly (no aliasing).
// ──────────────────────────────────────────────────────────────────────────

export interface StudentRow {
  id: number;
  display_name: string;
  class_label: string | null;
  created_at: string;
}

export interface ProgressRow {
  student_id: number;
  topic_id: string;
  state: string; // 'started' | 'completed'
  updated_at: string;
}

export interface QuizAttemptRow {
  id: number;
  student_id: number;
  topic_id: string;
  quiz_id: string;
  score: number;
  max_score: number;
  answers_json: string;
  taken_at: string;
}

// ──────────────────────────────────────────────────────────────────────────
// students
// ──────────────────────────────────────────────────────────────────────────

/** All students, oldest first (stable for the Phase-1 name picker). */
export async function getStudents(): Promise<StudentRow[]> {
  const db = await getDb();
  return db.select<StudentRow[]>("SELECT * FROM students ORDER BY id");
}

/**
 * Insert one student and return the created row.
 *
 * `lastInsertId` comes back from the plugin's `execute` for SQLite; we then
 * fetch the full row so callers get `created_at` (set by the column default)
 * without a second hand-rolled timestamp.
 */
export async function createStudent(
  displayName: string,
  classLabel?: string | null,
): Promise<StudentRow> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO students(display_name, class_label) VALUES ($1, $2)",
    [displayName, classLabel ?? null],
  );
  const id = result.lastInsertId;
  if (id === undefined || id === null) {
    throw new Error("createStudent: driver did not return lastInsertId");
  }
  const rows = await db.select<StudentRow[]>(
    "SELECT * FROM students WHERE id = $1",
    [id],
  );
  return rows[0];
}

// ──────────────────────────────────────────────────────────────────────────
// progress — upsert on the (student_id, topic_id) key
// ──────────────────────────────────────────────────────────────────────────

/** A student's progress rows, most recently touched first. */
export async function getProgress(studentId: number): Promise<ProgressRow[]> {
  const db = await getDb();
  return db.select<ProgressRow[]>(
    "SELECT * FROM progress WHERE student_id = $1 ORDER BY updated_at DESC",
    [studentId],
  );
}

/**
 * Insert-or-update the progress row keyed by (student_id, topic_id).
 *
 * `topic_id` is a text key into content, NOT a foreign key (03-architecture.md:
 * content is data on disk and can be swapped; the DB must not break when a
 * pack is removed). The UPSERT keeps the composite-key row stable across
 * updates while refreshing `state` and bumping `updated_at` server-side via
 * `datetime('now')` so ordering is robust regardless of client clock skew.
 */
export async function upsertProgress(
  studentId: number,
  topicId: string,
  state: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO progress(student_id, topic_id, state) VALUES ($1, $2, $3) " +
      "ON CONFLICT(student_id, topic_id) DO UPDATE SET state = excluded.state, updated_at = datetime('now')",
    [studentId, topicId, state],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// quiz_attempts — APPEND-ONLY. Never UPDATE a row.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Record one quiz attempt. Append-only by design (03-architecture.md: "Never
 * update a row — a teacher wants to see the second try improved on the
 * first"). `answersJson` is the JSON.stringify of the per-question answers
 * object, stored verbatim for teacher review.
 */
export async function recordAttempt(
  studentId: number,
  topicId: string,
  quizId: string,
  score: number,
  maxScore: number,
  answersJson: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO quiz_attempts(student_id, topic_id, quiz_id, score, max_score, answers_json) " +
      "VALUES ($1, $2, $3, $4, $5, $6)",
    [studentId, topicId, quizId, score, maxScore, answersJson],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Phase-1 seed student
// ──────────────────────────────────────────────────────────────────────────
//
// 04-vertical-slice.md §"What not to build in this phase": student profile
// management is explicitly skipped; "one hardcoded student row is fine". We
// create a single row named "Student" the first time the DB is used and
// memoise its id in-process so the vertical slice has a student_id to write
// against with zero profile UI. This is replaced by the real profile picker
// in Phase 5 (06-app-features.md).

let seedStudentId: number | null = null;

/**
 * Ensure one student row exists and return its id. Idempotent: on first call
 * with an empty `students` table it inserts "Student"; otherwise it adopts
 * the lowest-id existing row. The id is memoised for the process.
 */
export async function ensureSeedStudent(): Promise<number> {
  if (seedStudentId !== null) return seedStudentId;
  const students = await getStudents();
  if (students.length > 0) {
    seedStudentId = students[0].id;
    return seedStudentId;
  }
  const created = await createStudent("Student");
  seedStudentId = created.id;
  return seedStudentId;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal — test-only reset. Not part of the public data API.
// ──────────────────────────────────────────────────────────────────────────

/** @internal Reset module-level memoisation caches between unit tests. */
export function _resetStateForTests(): void {
  dbPromise = null;
  seedStudentId = null;
}
