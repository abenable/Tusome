/**
 * Tusome data layer — a thin typed wrapper over `@tauri-apps/plugin-sql`.
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
// `Database.load("sqlite:tusome.db")` uses the `sqlite:` special prefix.
// tauri-plugin-sql resolves that prefix against the Tauri *app config dir*
// (`app_config_dir()`), NOT the app data dir (`appDataDir()`). On Windows the
// two coincide (`%APPDATA%\ug.tusome`); on Linux they split — the DB lands in
// `~/.config/ug.tusome/tusome.db` while content lives under
// `~/.local/share/ug.tusome/tusome/content/`. Two roots, but the three-directory
// guarantee the architecture doc cares about (install / content / data are all
// distinct and reinstall-safe) still holds. We pass only the bare
// `"sqlite:tusome.db"` connection string and never hardcode a filesystem path
// or call `appDataDir()` to build one — the plugin owns that resolution. The
// actual relaunch-survival property is a human Gate-1 check
// (docs/plan/04-vertical-slice.md §2), not something this file can prove.

let dbPromise: Promise<Database> | null = null;

/** Open (once) and return the memoised SQLite connection. */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:tusome.db");
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
  /** Salted-SHA256 `<saltHex>:<hashHex>` (see hashPin/verifyPin below), or
   *  null for a pre-login-flow row created before 004_student_passwords.sql. */
  password_hash: string | null;
  created_at: string;
}

export interface ProgressRow {
  student_id: number;
  topic_id: string;
  state: string; // 'started' | 'completed'
  updated_at: string;
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
 * `passwordHash` is the already-hashed value (caller runs `hashPin(password)`
 * first, same pattern PinGate uses for the admin PIN) — this function never
 * sees the raw password. Every account created through the login/sign-up flow
 * sets one; it is nullable only because pre-existing rows from before
 * 004_student_passwords.sql have none.
 *
 * `lastInsertId` comes back from the plugin's `execute` for SQLite; we then
 * fetch the full row so callers get `created_at` (set by the column default)
 * without a second hand-rolled timestamp.
 */
export async function createStudent(
  displayName: string,
  classLabel?: string | null,
  passwordHash?: string | null,
): Promise<StudentRow> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO students(display_name, class_label, password_hash) VALUES ($1, $2, $3)",
    [displayName, classLabel ?? null, passwordHash ?? null],
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
 * Verify a password for one student. False if the student doesn't exist or
 * has no password_hash set (a pre-login-flow row — see StudentRow), not just
 * on a wrong password, so a caller can't tell the two cases apart from the
 * return value alone (no user-enumeration signal beyond "that didn't work").
 */
export async function verifyStudentPassword(
  id: number,
  password: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<Array<{ password_hash: string | null }>>(
    "SELECT password_hash FROM students WHERE id = $1",
    [id],
  );
  const stored = rows[0]?.password_hash;
  if (!stored) return false;
  return verifyPin(password, stored);
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
// Admin analytics — read-only aggregations over students + progress. The
// subject/topic dimension lives in content packs (JS), so these return flat
// joined rows; the pure grouping/aggregation is done in src/lib/admin-stats.ts
// (testable without a DB). No quiz helpers — the quiz engine was removed, so
// the only tracking signal is `progress.state` (started|completed).
// ──────────────────────────────────────────────────────────────────────────

/** A progress row joined with its student's name + class (for admin tables). */
export interface ProgressWithStudent extends ProgressRow {
  display_name: string;
  class_label: string | null;
}

/** One row of recent activity (a progress update + who did it). */
export interface ActivityRow {
  student_id: number;
  display_name: string;
  class_label: string | null;
  topic_id: string;
  state: string;
  updated_at: string;
}

/** Every progress row, joined to its student, most recent first. One query
 *  backs all admin analytics (overview, per-student, per-class, per-subject). */
export async function getAllProgress(): Promise<ProgressWithStudent[]> {
  const db = await getDb();
  return db.select<ProgressWithStudent[]>(
    "SELECT p.student_id, p.topic_id, p.state, p.updated_at, " +
      "s.display_name, s.class_label " +
      "FROM progress p JOIN students s ON s.id = p.student_id " +
      "ORDER BY p.updated_at DESC",
  );
}

/** Distinct non-null class labels in use, alphabetical. */
export async function listClassLabels(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ class_label: string }>>(
    "SELECT DISTINCT class_label FROM students WHERE class_label IS NOT NULL " +
      "ORDER BY class_label",
  );
  return rows.map((r) => r.class_label);
}

/** The most recent `limit` progress updates across all students. */
export async function getRecentActivity(limit = 20): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.select<ActivityRow[]>(
    "SELECT p.student_id, s.display_name, s.class_label, p.topic_id, " +
      "p.state, p.updated_at " +
      "FROM progress p JOIN students s ON s.id = p.student_id " +
      "ORDER BY p.updated_at DESC LIMIT $1",
    [limit],
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Internal — test-only reset. Not part of the public data API.
// ──────────────────────────────────────────────────────────────────────────

/** @internal Reset module-level memoisation caches between unit tests. */
export function _resetStateForTests(): void {
  dbPromise = null;
  seedStudentId = null;
}
