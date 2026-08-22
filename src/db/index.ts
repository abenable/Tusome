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
  seed: number | null; // NULL = pre-Phase-5 attempt, order not randomised
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

/**
 * Rename a student and optionally set a new class_label.
 *
 * `classLabel` semantics:
 *   - undefined → update display_name only, leave class_label untouched.
 *   - null      → set class_label to NULL (clear it).
 *   - string    → set class_label to the given value.
 */
export async function renameStudent(
  id: number,
  displayName: string,
  classLabel?: string | null,
): Promise<void> {
  const db = await getDb();
  if (classLabel === undefined) {
    await db.execute(
      "UPDATE students SET display_name = $2 WHERE id = $1",
      [id, displayName],
    );
  } else {
    await db.execute(
      "UPDATE students SET display_name = $2, class_label = $3 WHERE id = $1",
      [id, displayName, classLabel],
    );
  }
}

/**
 * Delete a student row. The progress and quiz_attempts FKs carry
 * ON DELETE CASCADE (001_init.sql), so a single DELETE here cascades to both.
 */
export async function deleteStudent(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM students WHERE id = $1", [id]);
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
 *
 * `seed` is the PRNG seed used to shuffle question order for this attempt.
 * Omit / pass null to record a non-randomised attempt (or a pre-Phase-5 row).
 */
export async function recordAttempt(
  studentId: number,
  topicId: string,
  quizId: string,
  score: number,
  maxScore: number,
  answersJson: string,
  seed?: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO quiz_attempts(student_id, topic_id, quiz_id, score, max_score, answers_json, seed) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [studentId, topicId, quizId, score, maxScore, answersJson, seed ?? null],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Dashboard reads (Phase 5, W5) — best score is COMPUTED, never stored.
//
// `best_score` is deliberately not a column. The architecture (00-decisions §3:
// "best_score computed, not stored") and the append-only contract on
// quiz_attempts together mean the best fraction is always derivable as
// MAX(score/max_score) per topic at read time. Storing it would duplicate
// source-of-truth data and risk drift; a teacher reviewing attempts wants the
// raw rows, not a cached aggregate.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Best (max) score FRACTION per topic for a student, computed from
 * quiz_attempts. Returns `{ topic_id, best }[]` where `best` is a 0..1
 * fraction. Returns `[]` for a student with no attempts.
 *
 * `MAX(score * 1.0 / max_score)` — the `* 1.0` forces floating-point division
 * (SQLite integer division would truncate 3/5 to 0) so the fraction survives
 * the MAX. Grouped by topic_id; scoped by student_id.
 */
export async function bestScorePerTopic(
  studentId: number,
): Promise<Array<{ topic_id: string; best: number }>> {
  const db = await getDb();
  return db.select<Array<{ topic_id: string; best: number }>>(
    "SELECT topic_id, MAX(score * 1.0 / max_score) AS best FROM quiz_attempts WHERE student_id = $1 GROUP BY topic_id",
    [studentId],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Teacher class grid (W6) — best score per (student, topic), all students.
//
// Same computation as `bestScorePerTopic` but WITHOUT the student_id filter,
// so the GROUP BY now has two keys (student_id, topic_id). One query returns
// the whole class grid. Like the per-student helper, `best` is a 0..1 fraction
// COMPUTED at read time — never stored. No `best_score` column exists.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Best (max) score FRACTION per (student, topic) across ALL students, from
 * quiz_attempts. Returns `{ student_id, topic_id, best }[]` where `best` is a
 * 0..1 fraction. The teacher's class grid (W6) is built from this.
 *
 * `MAX(score * 1.0 / max_score)` — same `* 1.0` as `bestScorePerTopic` to force
 * floating-point division; `GROUP BY student_id, topic_id` produces one row
 * per (student, topic) pair that has at least one attempt.
 */
export async function classResults(): Promise<
  Array<{ student_id: number; topic_id: string; best: number }>
> {
  const db = await getDb();
  return db.select<
    Array<{ student_id: number; topic_id: string; best: number }>
  >(
    "SELECT student_id, topic_id, MAX(score * 1.0 / max_score) AS best FROM quiz_attempts GROUP BY student_id, topic_id",
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Home leaderboard — top scores in a recent window, across all students.
//
// DELIBERATE PLAN DEVIATION. docs/plan/06-app-features.md:49 says of the
// progress dashboard: "Nothing comparative; no leaderboards." That rule still
// governs /dashboard, which stays strictly personal. The Home screen carries a
// leaderboard because the project owner asked for one on Home specifically,
// after the conflict was raised. Two consequences worth knowing before this is
// changed again:
//   - It puts other students' names on a shared classroom machine's first
//     screen. Guests are excluded (they record no attempts at all), but named
//     students are visible to whoever is sitting at the machine.
//   - It is a `best score` board, not a `most improved` one, so it rewards the
//     already-confident. If that turns out to demotivate in the pilot, the
//     honest fix is to change what it ranks, not to hide it.
// ──────────────────────────────────────────────────────────────────────────

export interface TopScoreRow {
  student_id: number;
  display_name: string;
  topic_id: string;
  /** 0..1 fraction, computed at read time. Never stored. */
  best: number;
  /** Most recent attempt for this (student, topic), UTC 'YYYY-MM-DD HH:MM:SS'. */
  last_at: string;
}

/**
 * Best score per (student, topic) for attempts in the last `days` days,
 * ranked highest first.
 *
 * `taken_at` is written by SQLite's `datetime('now')` (UTC, lexicographically
 * sortable), so a string comparison against `datetime('now', '-N days')` is a
 * correct window filter. The modifier is bound rather than interpolated.
 *
 * `MAX(a.taken_at)` rather than a bare `a.taken_at` in ORDER BY: with a GROUP
 * BY, a bare column picks an arbitrary row from the group. SQLite tolerates
 * it; being explicit makes the tie-break (most recent first) actually mean
 * what it says.
 *
 * Returns at most `limit` rows. A student appears once per topic, so a strong
 * student can legitimately occupy several rows.
 */
export async function topScores(
  days = 7,
  limit = 5,
): Promise<TopScoreRow[]> {
  const db = await getDb();
  return db.select<TopScoreRow[]>(
    "SELECT a.student_id AS student_id, s.display_name AS display_name, " +
      "a.topic_id AS topic_id, MAX(a.score * 1.0 / a.max_score) AS best, " +
      "MAX(a.taken_at) AS last_at " +
      "FROM quiz_attempts a JOIN students s ON s.id = a.student_id " +
      "WHERE a.taken_at >= datetime('now', $1) " +
      "GROUP BY a.student_id, a.topic_id " +
      "ORDER BY best DESC, last_at DESC LIMIT $2",
    [`-${days} days`, limit],
  );
}

/**
 * All quiz_attempts for one student on one topic, oldest first — the rows
 * the W6 per-question breakdown renders. Append-only table (never UPDATE), so
 * ordering by `taken_at` gives a stable chronological list of retakes.
 *
 * `seed` may be NULL on pre-Phase-5 rows (randomization is always-on only from
 * W4); the breakdown falls back to authored order in that case.
 */
export async function getAttemptsForStudentTopic(
  studentId: number,
  topicId: string,
): Promise<QuizAttemptRow[]> {
  const db = await getDb();
  return db.select<QuizAttemptRow[]>(
    "SELECT * FROM quiz_attempts WHERE student_id = $1 AND topic_id = $2 ORDER BY taken_at",
    [studentId, topicId],
  );
}

/**
 * Pick the "Continue where you left off" topic for a student. PURE — no DB.
 *
 * Decision order:
 *   1. The most-recent `started` (but not completed) topic by `updated_at` DESC.
 *      `progressRows` is already ordered by `updated_at` DESC from `getProgress`,
 *      so the first matching row is the most recent. A topic's progress row has
 *      a composite-key single row, so `state` is exactly "started" or
 *      "completed" — "started" alone means in-progress.
 *   2. Else the first topic in `allTopicIds` with NO progress row at all (not
 *      yet started). Completed topics are excluded here — they have a row.
 *   3. Else null (every installed topic is completed, or there are no topics).
 *
 * Topics whose pack was uninstalled are ignored: `progressRows` is filtered to
 * those whose `topic_id` appears in `allTopicIds`, so a started-but-uninstalled
 * topic can never be the continue target.
 */
export function continueTopic(
  allTopicIds: readonly string[],
  progressRows: ProgressRow[],
): string | null {
  const installed = new Set(allTopicIds);
  // Only installed topics are eligible — a started topic whose pack was removed
  // must not be the continue target.
  const installedProgress = progressRows.filter((r) => installed.has(r.topic_id));

  // 1. Most-recent started-not-completed (progressRows pre-ordered DESC).
  for (const row of installedProgress) {
    if (row.state === "started") return row.topic_id;
  }

  // 2. First installed topic with no progress row (not started at all).
  const hasProgress = new Set(installedProgress.map((r) => r.topic_id));
  for (const id of allTopicIds) {
    if (!hasProgress.has(id)) return id;
  }

  // 3. All installed topics completed, or no topics installed.
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// settings — general key/value store (W1: admin flags, etc.)
// ──────────────────────────────────────────────────────────────────────────

/** Return the value for `key`, or null if no row exists. */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

/** Insert-or-update the value for `key`. */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings(key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PIN hashing — admin speed-bump only (07-updates-and-security.md: the online
// update toggle is "behind a PIN-gated admin screen separate from the student
// UI"). This is deliberately a salted SHA-256, not a slow KDF: the threat model
// is a curious student on a shared machine, not an offline cracking rig. No
// new dependency — uses the Web Crypto API available in the Tauri webview.
// ──────────────────────────────────────────────────────────────────────────

/** Hex-encode a byte array. */
function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Hex-decode a string to a byte array. */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/**
 * Salted SHA-256 of `pin`. Returns `<saltHex>:<hashHex>` where salt is 16
 * random bytes. Pure Web Crypto — no native dependency.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinBytes = new TextEncoder().encode(pin);
  const input = new Uint8Array(salt.length + pinBytes.length);
  input.set(salt, 0);
  input.set(pinBytes, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return `${toHex(salt)}:${toHex(new Uint8Array(digest))}`;
}

/**
 * Verify a PIN against a stored `<saltHex>:<hashHex>`.
 *
 * NOTE: the comparison is a plain string equality on the derived hash. This is
 * not a constant-time compare and is theoretically timing-attackable, but the
 * PIN is a speed-bump for a shared-machine student, not a crypto secret, and a
 * remote attacker with timing access already has the machine. A constant-time
 * compare would be a nice-to-have; plain equality is acceptable here.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const sep = stored.indexOf(":");
  if (sep < 0) return false;
  const saltHex = stored.slice(0, sep);
  const hashHex = stored.slice(sep + 1);
  const salt = fromHex(saltHex);
  const pinBytes = new TextEncoder().encode(pin);
  const input = new Uint8Array(salt.length + pinBytes.length);
  input.set(salt, 0);
  input.set(pinBytes, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return toHex(new Uint8Array(digest)) === hashHex;
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
