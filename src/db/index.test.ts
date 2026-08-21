import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock @tauri-apps/plugin-sql BEFORE importing the data layer ──────────────
//
// The production module imports `Database` (default) and calls `Database.load`.
// We replace the plugin with a fake executor that records every SQL string and
// its bind params so the tests can assert on statement shape (INSERT vs UPDATE,
// ON CONFLICT, table names, column names) without a Tauri runtime or a real
// SQLite file.

type Entry = { kind: "execute" | "select"; query: string; params: unknown[] };

const sqlLog: Entry[] = [];
const selectQueue: unknown[] = [];

const fakeExecute = mock(async (query: string, params?: unknown[]) => {
  sqlLog.push({ kind: "execute", query, params: params ?? [] });
  return { rowsAffected: 1, lastInsertId: 1 } as const;
});

const fakeSelect = mock(async (query: string, params?: unknown[]) => {
  sqlLog.push({ kind: "select", query, params: params ?? [] });
  return selectQueue.length ? selectQueue.shift() : [];
});

// `fakeDb` is the object returned by `Database.load`; its methods record SQL.
const fakeDb = {
  execute: fakeExecute,
  select: fakeSelect,
  close: mock(async () => true),
} as unknown;

const loadMock = mock((_path: string) => Promise.resolve(fakeDb));

await mock.module("@tauri-apps/plugin-sql", () => ({
  default: { load: loadMock },
}));

// Import the module under test AFTER the mock is registered. Bun applies
// `mock.module` registrations before resolving static imports, so this picks
// up the fake plugin.
import {
  getDb,
  getStudents,
  createStudent,
  renameStudent,
  deleteStudent,
  recordAttempt,
  getProgress,
  upsertProgress,
  getSetting,
  setSetting,
  ensureSeedStudent,
  hashPin,
  verifyPin,
  bestScorePerTopic,
  continueTopic,
  classResults,
  getAttemptsForStudentTopic,
  _resetStateForTests,
} from "./index";

function clearLog() {
  sqlLog.length = 0;
  selectQueue.length = 0;
}

beforeEach(() => {
  _resetStateForTests();
  clearLog();
  loadMock.mockClear();
  fakeExecute.mockClear();
  fakeSelect.mockClear();
});

describe("db connection", () => {
  it("Database.load is called once with sqlite:cbclab.db and getDb memoises the promise", async () => {
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith("sqlite:cbclab.db");
  });

  it("does not hardcode a filesystem path — only the sqlite: connection string is passed", () => {
    const calls = loadMock.mock.calls.map((c) => c[0]);
    for (const path of calls) {
      // The only permitted path form is the sqlite: special prefix.
      expect(path).toBe("sqlite:cbclab.db");
      expect(path).not.toContain("/");
      expect(path).not.toContain("\\");
    }
  });
});

describe("students", () => {
  it("createStudent issues exactly one INSERT into students", async () => {
    selectQueue.push([
      { id: 1, display_name: "A", class_label: null, created_at: "2026-01-01" },
    ]);
    await createStudent("A");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^INSERT INTO students\b/i);
    expect(execs[0].params).toEqual(["A", null]);
  });

  it("createStudent accepts an optional class_label", async () => {
    selectQueue.push([
      { id: 2, display_name: "B", class_label: "S2 Blue", created_at: "2026-01-01" },
    ]);
    const row = await createStudent("B", "S2 Blue");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs[0].params).toEqual(["B", "S2 Blue"]);
    expect(row.id).toBe(2); // returned by the canned select result
  });

  it("getStudents issues a SELECT on students ordered by id", async () => {
    selectQueue.push([]);
    await getStudents();
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    expect(selects[0].query).toMatch(/^SELECT .* FROM students\b/i);
    expect(selects[0].query).toMatch(/ORDER BY id/i);
  });
});

describe("quiz_attempts (append-only)", () => {
  it("recordAttempt issues exactly one INSERT into quiz_attempts and never UPDATEs", async () => {
    await recordAttempt(7, "phy.s2.motion.projectile", "q1", 3, 5, '{"a":1}');

    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^INSERT INTO quiz_attempts\b/i);
    // The body must not contain an UPDATE clause — append-only, never mutate.
    expect(execs[0].query).not.toMatch(/\bUPDATE\b/i);
    expect(execs[0].query).not.toMatch(/\bON CONFLICT\b/i);
    // Column order matches the schema: student, topic, quiz, score, max,
    // answers, seed. seed defaults to null when omitted.
    expect(execs[0].params).toEqual([
      7,
      "phy.s2.motion.projectile",
      "q1",
      3,
      5,
      '{"a":1}',
      null,
    ]);
  });

  it("records answers_json as a verbatim string (caller JSON.stringifies)", async () => {
    const payload = JSON.stringify({ q1: "a", q2: ["b", "c"] });
    await recordAttempt(1, "t", "q", 2, 2, payload);
    const exec = sqlLog.filter((e) => e.kind === "execute")[0];
    expect(typeof exec.params[5]).toBe("string");
    expect(exec.params[5]).toBe(payload);
  });

  it("recordAttempt persists a non-null seed as the 7th param", async () => {
    await recordAttempt(11, "t", "q", 4, 5, '{"a":1}', 123456);
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^INSERT INTO quiz_attempts\b/i);
    // The seed column is named in the INSERT.
    expect(execs[0].query).toMatch(/\bseed\b/i);
    expect(execs[0].params).toEqual([
      11,
      "t",
      "q",
      4,
      5,
      '{"a":1}',
      123456,
    ]);
  });
});

describe("progress (upsert)", () => {
  it("upsertProgress issues exactly one INSERT...ON CONFLICT...DO UPDATE", async () => {
    await upsertProgress(5, "phy.s2.motion.projectile", "completed");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^INSERT INTO progress\b/i);
    expect(execs[0].query).toMatch(/\bON CONFLICT\b/i);
    expect(execs[0].query).toMatch(/\bDO UPDATE\b/i);
    expect(execs[0].query).toMatch(/excluded\.state/i);
    // Server-side timestamp, not a client-provided one.
    expect(execs[0].query).toMatch(/datetime\('now'\)/i);
    expect(execs[0].params).toEqual([5, "phy.s2.motion.projectile", "completed"]);
  });

  it("getProgress issues a SELECT on progress scoped to the student", async () => {
    selectQueue.push([]);
    await getProgress(9);
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    expect(selects[0].query).toMatch(/^SELECT .* FROM progress\b/i);
    expect(selects[0].query).toMatch(/WHERE student_id/i);
    expect(selects[0].params).toEqual([9]);
  });
});

describe("ensureSeedStudent (Phase-1 single-row shortcut)", () => {
  it("creates a 'Student' row when the table is empty and memoises its id", async () => {
    // getStudents() -> []  (empty table triggers the insert)
    selectQueue.push([]);
    // createStudent()'s follow-up SELECT * WHERE id = $1
    selectQueue.push([
      { id: 1, display_name: "Student", class_label: null, created_at: "x" },
    ]);

    const id = await ensureSeedStudent();
    expect(id).toBe(1);

    const inserts = sqlLog.filter(
      (e) => e.kind === "execute" && /INSERT INTO students/i.test(e.query),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[0]).toBe("Student");
  });

  it("adopts an existing student and issues no INSERT when the table is non-empty", async () => {
    selectQueue.push([
      { id: 42, display_name: "someone", class_label: null, created_at: "x" },
    ]);

    const id = await ensureSeedStudent();
    expect(id).toBe(42);
    expect(
      sqlLog.filter((e) => e.kind === "execute"),
    ).toHaveLength(0);
  });

  it("is memoised: a second call in the same process makes no further queries", async () => {
    selectQueue.push([
      { id: 7, display_name: "s", class_label: null, created_at: "x" },
    ]);
    await ensureSeedStudent();
    clearLog();
    const again = await ensureSeedStudent();
    expect(again).toBe(7);
    expect(sqlLog).toHaveLength(0);
  });
});

describe("renameStudent", () => {
  it("updates display_name only when classLabel is omitted", async () => {
    await renameStudent(3, "New Name");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^UPDATE students\b/i);
    expect(execs[0].query).toMatch(/SET display_name/i);
    // class_label must NOT be touched when omitted.
    expect(execs[0].query).not.toMatch(/class_label/i);
    expect(execs[0].query).toMatch(/WHERE id/i);
    expect(execs[0].params).toEqual([3, "New Name"]);
  });

  it("updates both display_name and class_label when classLabel is provided", async () => {
    await renameStudent(3, "New Name", "S3 Red");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/SET display_name/i);
    expect(execs[0].query).toMatch(/class_label/i);
    expect(execs[0].params).toEqual([3, "New Name", "S3 Red"]);
  });

  it("sets class_label to NULL when classLabel is null", async () => {
    await renameStudent(3, "New Name", null);
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs[0].params).toEqual([3, "New Name", null]);
  });
});

describe("deleteStudent", () => {
  it("issues exactly one DELETE FROM students WHERE id = $1 (cascade handled by FK)", async () => {
    await deleteStudent(9);
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^DELETE FROM students\b/i);
    expect(execs[0].query).toMatch(/WHERE id/i);
    expect(execs[0].params).toEqual([9]);
  });
});

describe("settings (key/value)", () => {
  it("getSetting returns null when no row is present", async () => {
    selectQueue.push([]); // SELECT value FROM settings WHERE key = $1 -> []
    const value = await getSetting("missing");
    expect(value).toBeNull();
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    expect(selects[0].query).toMatch(/FROM settings\b/i);
    expect(selects[0].query).toMatch(/WHERE key/i);
    expect(selects[0].params).toEqual(["missing"]);
  });

  it("getSetting returns the value when a row is present", async () => {
    selectQueue.push([{ value: "true" }]);
    const value = await getSetting("auto_update");
    expect(value).toBe("true");
  });

  it("setSetting issues an INSERT...ON CONFLICT...DO UPDATE on settings", async () => {
    await setSetting("auto_update", "true");
    const execs = sqlLog.filter((e) => e.kind === "execute");
    expect(execs).toHaveLength(1);
    expect(execs[0].query).toMatch(/^INSERT INTO settings\b/i);
    expect(execs[0].query).toMatch(/ON CONFLICT\(key\)/i);
    expect(execs[0].query).toMatch(/\bDO UPDATE\b/i);
    expect(execs[0].query).toMatch(/excluded\.value/i);
    expect(execs[0].params).toEqual(["auto_update", "true"]);
  });
});

describe("PIN hashing (real Web Crypto)", () => {
  // These tests use the actual Web Crypto API (globalThis.crypto.subtle),
  // available in bun's runtime — no mock involved.

  it("hashPin returns a `<saltHex>:<hashHex>` string with a 16-byte salt", async () => {
    const stored = await hashPin("1234");
    expect(typeof stored).toBe("string");
    expect(stored).toContain(":");
    const [saltHex, hashHex] = stored.split(":");
    // 16-byte salt -> 32 hex chars; SHA-256 -> 64 hex chars.
    expect(saltHex).toHaveLength(32);
    expect(hashHex).toHaveLength(64);
    expect(/^[0-9a-f]{32}$/.test(saltHex)).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(hashHex)).toBe(true);
  });

  it("hashPin generates a fresh salt per call (no two hashes alike)", async () => {
    const a = await hashPin("same");
    const b = await hashPin("same");
    expect(a).not.toBe(b); // salt differs
  });

  it("verifyPin round-trips the same PIN (true)", async () => {
    const stored = await hashPin("letmein");
    expect(await verifyPin("letmein", stored)).toBe(true);
  });

  it("verifyPin rejects a different PIN (false)", async () => {
    const stored = await hashPin("letmein");
    expect(await verifyPin("wrongpass", stored)).toBe(false);
  });

  it("verifyPin rejects a malformed stored string", async () => {
    expect(await verifyPin("anything", "not-a-valid-stored-string")).toBe(false);
  });
});

// ── W5: dashboard helpers ────────────────────────────────────────────────────

describe("bestScorePerTopic (computed, never stored)", () => {
  it("issues a SELECT that computes MAX(score * 1.0 / max_score) GROUP BY topic_id, scoped by student_id", async () => {
    selectQueue.push([]);
    await bestScorePerTopic(7);
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    // The aggregation must use MAX(score * 1.0 / max_score) — the * 1.0 forces
    // floating-point division so the 0..1 fraction survives the integer columns.
    expect(selects[0].query).toMatch(/MAX\(score \* 1\.0 \/ max_score\)/i);
    expect(selects[0].query).toMatch(/GROUP BY topic_id/i);
    expect(selects[0].query).toMatch(/WHERE student_id = \$1/i);
    expect(selects[0].params).toEqual([7]);
  });

  it("returns the rows as-is from the driver (best is the max fraction per topic)", async () => {
    selectQueue.push([
      { topic_id: "phy.s2.motion.projectile", best: 0.8 },
      { topic_id: "phy.s2.electricity.circuits", best: 0.6 },
    ]);
    const rows = await bestScorePerTopic(1);
    expect(rows).toEqual([
      { topic_id: "phy.s2.motion.projectile", best: 0.8 },
      { topic_id: "phy.s2.electricity.circuits", best: 0.6 },
    ]);
  });

  it("returns [] for a student with no attempts (empty select result)", async () => {
    selectQueue.push([]);
    const rows = await bestScorePerTopic(99);
    expect(rows).toEqual([]);
  });

  it("does not reference a best_score column anywhere (best is computed, not stored)", async () => {
    selectQueue.push([]);
    await bestScorePerTopic(1);
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects[0].query).not.toMatch(/\bbest_score\b/i);
  });
});

describe("continueTopic (pure selection — no DB)", () => {
  // Helper to build a ProgressRow; progressRows are expected pre-ordered by
  // updated_at DESC (getProgress's ORDER BY), so we hand them in that order.
  function row(
    topicId: string,
    state: "started" | "completed",
    updatedAt: string,
  ) {
    return { student_id: 1, topic_id: topicId, state, updated_at: updatedAt };
  }

  it("returns the most-recent started-not-completed topic (first started in DESC order)", () => {
    const progress = [
      row("t1", "completed", "2026-01-05"),
      row("t2", "started", "2026-01-04"), // most recent started
      row("t3", "started", "2026-01-03"),
    ];
    expect(continueTopic(["t1", "t2", "t3", "t4"], progress)).toBe("t2");
  });

  it("when no topic is started, returns the first installed topic with no progress row", () => {
    const progress = [
      row("t1", "completed", "2026-01-05"),
      row("t2", "completed", "2026-01-04"),
    ];
    // t3 has no progress row and is the first not-started installed topic.
    expect(continueTopic(["t1", "t2", "t3", "t4"], progress)).toBe("t3");
  });

  it("returns null when every installed topic is completed", () => {
    const progress = [
      row("t1", "completed", "2026-01-05"),
      row("t2", "completed", "2026-01-04"),
    ];
    expect(continueTopic(["t1", "t2"], progress)).toBeNull();
  });

  it("returns null when there are no topics installed", () => {
    const progress = [row("tX", "started", "2026-01-01")];
    expect(continueTopic([], progress)).toBeNull();
  });

  it("returns null when there are no topics and no progress", () => {
    expect(continueTopic([], [])).toBeNull();
  });

  it("ignores a started topic whose id is NOT in allTopicIds (pack uninstalled)", () => {
    const progress = [
      row("uninstalled", "started", "2026-01-10"), // recent, but pack gone
      row("t2", "completed", "2026-01-05"),
    ];
    // "uninstalled" is the most-recent started but not in allTopicIds, so it
    // is skipped; t1 is the first installed topic with no progress row.
    expect(continueTopic(["t1", "t2", "t3"], progress)).toBe("t1");
  });

  it("with no progress rows at all, returns the first installed topic", () => {
    expect(continueTopic(["t1", "t2", "t3"], [])).toBe("t1");
  });

  it("a started topic later in DESC order still beats a completed one earlier", () => {
    const progress = [
      row("t1", "completed", "2026-01-09"),
      row("t2", "started", "2026-01-08"),
    ];
    expect(continueTopic(["t1", "t2"], progress)).toBe("t2");
  });
});

// ── W6: teacher class grid + per-question breakdown reads ───────────────────

describe("classResults (computed, never stored)", () => {
  it("issues a SELECT that computes MAX(score * 1.0 / max_score) GROUP BY student_id, topic_id", async () => {
    selectQueue.push([]);
    await classResults();
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    // Same computation shape as bestScorePerTopic, minus the student filter.
    expect(selects[0].query).toMatch(/MAX\(score \* 1\.0 \/ max_score\)/i);
    expect(selects[0].query).toMatch(/GROUP BY student_id, topic_id/i);
    // No WHERE clause — this returns ALL students (the whole class grid).
    expect(selects[0].query).not.toMatch(/\bWHERE\b/i);
    expect(selects[0].params).toEqual([]);
  });

  it("returns the rows as-is from the driver", async () => {
    selectQueue.push([
      { student_id: 1, topic_id: "phy.s2.motion.projectile", best: 0.8 },
      { student_id: 1, topic_id: "phy.s2.electricity.circuits", best: 0.6 },
      { student_id: 2, topic_id: "phy.s2.motion.projectile", best: 1.0 },
    ]);
    const rows = await classResults();
    expect(rows).toEqual([
      { student_id: 1, topic_id: "phy.s2.motion.projectile", best: 0.8 },
      { student_id: 1, topic_id: "phy.s2.electricity.circuits", best: 0.6 },
      { student_id: 2, topic_id: "phy.s2.motion.projectile", best: 1.0 },
    ]);
  });

  it("returns [] when there are no attempts at all (empty select result)", async () => {
    selectQueue.push([]);
    expect(await classResults()).toEqual([]);
  });

  it("does not reference a best_score column anywhere (best is computed)", async () => {
    selectQueue.push([]);
    await classResults();
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects[0].query).not.toMatch(/\bbest_score\b/i);
  });
});

describe("getAttemptsForStudentTopic", () => {
  it("issues a SELECT * FROM quiz_attempts scoped by student_id AND topic_id, ordered by taken_at", async () => {
    selectQueue.push([]);
    await getAttemptsForStudentTopic(7, "phy.s2.motion.projectile");
    const selects = sqlLog.filter((e) => e.kind === "select");
    expect(selects).toHaveLength(1);
    expect(selects[0].query).toMatch(/^SELECT \* FROM quiz_attempts\b/i);
    expect(selects[0].query).toMatch(/WHERE student_id = \$1/i);
    expect(selects[0].query).toMatch(/AND topic_id = \$2/i);
    expect(selects[0].query).toMatch(/ORDER BY taken_at/i);
    expect(selects[0].params).toEqual([7, "phy.s2.motion.projectile"]);
  });

  it("returns the rows as-is from the driver", async () => {
    const rows = [
      {
        id: 1,
        student_id: 3,
        topic_id: "t",
        quiz_id: "t#quiz",
        score: 2,
        max_score: 5,
        answers_json: "{}",
        taken_at: "2026-01-01 10:00:00",
        seed: 123,
      },
    ];
    selectQueue.push(rows);
    const got = await getAttemptsForStudentTopic(3, "t");
    expect(got).toEqual(rows);
  });

  it("returns [] when the student has no attempts on that topic", async () => {
    selectQueue.push([]);
    expect(await getAttemptsForStudentTopic(99, "nope")).toEqual([]);
  });
});
