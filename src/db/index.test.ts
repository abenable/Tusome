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
  recordAttempt,
  getProgress,
  upsertProgress,
  ensureSeedStudent,
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
    // Column order matches the schema: student, topic, quiz, score, max, answers.
    expect(execs[0].params).toEqual([
      7,
      "phy.s2.motion.projectile",
      "q1",
      3,
      5,
      '{"a":1}',
    ]);
  });

  it("records answers_json as a verbatim string (caller JSON.stringifies)", async () => {
    const payload = JSON.stringify({ q1: "a", q2: ["b", "c"] });
    await recordAttempt(1, "t", "q", 2, 2, payload);
    const exec = sqlLog.filter((e) => e.kind === "execute")[0];
    expect(typeof exec.params[5]).toBe("string");
    expect(exec.params[5]).toBe(payload);
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
