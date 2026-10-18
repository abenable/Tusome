/**
 * Tusome data layer — a thin typed wrapper over `@tauri-apps/plugin-sql`.
 *
 * No React here; this is pure data access. State ownership is documented in
 * docs/plan/03-architecture.md: DB reads are server-ish state consumed by
 * TanStack Query, mutations are called directly and followed by query
 * invalidation by the caller.
 */
import Database from "@tauri-apps/plugin-sql";

import Q from "./queries.json";

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
    // Drop a rejected load so the next call retries instead of replaying the
    // same failure for the rest of the session.
    dbPromise = Database.load("sqlite:tusome.db").catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// ──────────────────────────────────────────────────────────────────────────
// Lab mode — where student records live
// ──────────────────────────────────────────────────────────────────────────
//
// Standalone (and a lab server) keep students and progress in this PC's
// SQLite. A lab client sends those queries to the lab server instead, so a
// learner's progress follows them to any PC in the lab (src-tauri/src/lab.rs).
// Queries are named: every statement that may cross the network lives in
// queries.json, which the Rust server reads too, so a client can only ask the
// server to run one of these, never arbitrary SQL. Machine-local settings
// (who's signed in on this PC) always stay local.

export type QueryName = keyof typeof Q;

let labClient: Promise<boolean> | null = null;

/** True when this PC is a lab client (read once; changing mode restarts). */
export function isLabClient(): Promise<boolean> {
  labClient ??= (async () => {
    if (!("__TAURI_INTERNALS__" in globalThis)) return false;
    const { invoke } = await import("@tauri-apps/api/core");
    const cfg = await invoke<{ mode: string }>("lab_config").catch(() => null);
    return cfg?.mode === "client";
  })();
  return labClient;
}

async function select<T>(q: QueryName, params: unknown[] = []): Promise<T> {
  if (await isLabClient()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>("lab_query", { q, params, kind: "select" });
  }
  return (await getDb()).select<T>(Q[q], params);
}

async function execute(
  q: QueryName,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  if (await isLabClient()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("lab_query", { q, params, kind: "execute" });
  }
  return (await getDb()).execute(Q[q], params);
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
  return select<StudentRow[]>("students.all");
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
  const result = await execute("students.insert", [
    displayName,
    classLabel ?? null,
    passwordHash ?? null,
  ]);
  const id = result.lastInsertId;
  if (id === undefined || id === null) {
    throw new Error("createStudent: driver did not return lastInsertId");
  }
  const rows = await select<StudentRow[]>("students.byId", [id]);
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
  const rows = await select<Array<{ password_hash: string | null }>>(
    "students.passwordHash",
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
  if (classLabel === undefined) {
    await execute("students.rename", [id, displayName]);
  } else {
    await execute("students.renameWithClass", [id, displayName, classLabel]);
  }
}

/**
 * Replace a student's password hash (admin reset). `passwordHash` is the
 * output of `hashPin`. Also how a pre-004 account with a NULL hash, which can
 * never log in, gets a password.
 */
export async function setStudentPassword(
  id: number,
  passwordHash: string,
): Promise<void> {
  await execute("students.setPassword", [id, passwordHash]);
}

/**
 * Delete a student row. The progress and quiz_attempts FKs carry
 * ON DELETE CASCADE (001_init.sql), so a single DELETE here cascades to both.
 */
export async function deleteStudent(id: number): Promise<void> {
  await execute("students.delete", [id]);
}

/**
 * Start-of-year move: every student in `from` (e.g. "S1") goes to `to`
 * ("S2"). Returns how many moved.
 */
export async function moveClass(from: string, to: string): Promise<number> {
  return (await execute("students.moveClass", [from, to])).rowsAffected;
}

/** Remove a whole class (leavers), with their progress. Returns how many. */
export async function deleteClass(classLabel: string): Promise<number> {
  return (await execute("students.deleteClass", [classLabel])).rowsAffected;
}

// ──────────────────────────────────────────────────────────────────────────
// progress — upsert on the (student_id, topic_id) key
// ──────────────────────────────────────────────────────────────────────────

/** A student's progress rows, most recently touched first. */
export async function getProgress(studentId: number): Promise<ProgressRow[]> {
  return select<ProgressRow[]>("progress.forStudent", [studentId]);
}

/**
 * Insert-or-update the progress row keyed by (student_id, topic_id).
 *
 * `topic_id` is a text key into content, NOT a foreign key (03-architecture.md:
 * content is data on disk and can be swapped; the DB must not break when a
 * pack is removed). The UPSERT keeps the composite-key row stable across
 * updates while refreshing `state` (never completed -> started) and bumping
 * `updated_at` server-side via `datetime('now')` so ordering is robust
 * regardless of client clock skew.
 */
export async function upsertProgress(
  studentId: number,
  topicId: string,
  state: string,
): Promise<void> {
  // Never downgrades: reopening a completed topic records the visit (bumps
  // updated_at) but doesn't flip it back to "started". See queries.json.
  await execute("progress.upsert", [studentId, topicId, state]);
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

// Settings a lab shares: the admin PIN, so a client's teacher area is guarded
// by the same PIN as the server that holds the records. Everything else
// (who's signed in, update preferences) belongs to the PC.
const SHARED_SETTINGS = { admin_pin: ["adminPin.get", "adminPin.set"] } as const;

/** Return the value for `key`, or null if no row exists. */
export async function getSetting(key: string): Promise<string | null> {
  if (key in SHARED_SETTINGS && (await isLabClient())) {
    const [get] = SHARED_SETTINGS[key as keyof typeof SHARED_SETTINGS];
    const rows = await select<Array<{ value: string }>>(get);
    return rows[0]?.value ?? null;
  }
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

/** Insert-or-update the value for `key`. */
export async function setSetting(key: string, value: string): Promise<void> {
  if (key in SHARED_SETTINGS && (await isLabClient())) {
    const [, set] = SHARED_SETTINGS[key as keyof typeof SHARED_SETTINGS];
    await execute(set, [value]);
    return;
  }
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
  return select<ProgressWithStudent[]>("progress.all");
}

/** Distinct non-null class labels in use, alphabetical. */
export async function listClassLabels(): Promise<string[]> {
  const rows = await select<Array<{ class_label: string }>>("students.classLabels");
  return rows.map((r) => r.class_label);
}

/** The most recent `limit` progress updates across all students. */
export async function getRecentActivity(limit = 20): Promise<ActivityRow[]> {
  return select<ActivityRow[]>("progress.recent", [limit]);
}

// ──────────────────────────────────────────────────────────────────────────
// Internal — test-only reset. Not part of the public data API.
// ──────────────────────────────────────────────────────────────────────────

/** @internal Reset module-level memoisation caches between unit tests. */
export function _resetStateForTests(): void {
  dbPromise = null;
  seedStudentId = null;
  labClient = null;
}
