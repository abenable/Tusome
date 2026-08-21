/**
 * Student profile context — the single small context set at the profile picker
 * (00-decisions §4: no student passwords; a name picker IS the whole login;
 * "Guest" records nothing).
 *
 * State ownership: this is the ONE piece of "current student" state in the
 * app, mounted high in __root so every route can read it. It is NOT server-ish
 * state (no TanStack Query) and NOT route state (not in the URL) — it lives in
 * React state here, persisted to the `settings` table as `current_student`
 * (value = student id as a string, or `"guest"`).
 *
 * The provider loads students + the persisted choice on mount and exposes
 * `setStudent(id)` (null = Guest) to persist a choice. Mutations
 * (add/rename/delete) delegate to the db helpers in src/db/index.ts and then
 * refresh the in-memory list.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { StudentRow } from "@/db/index";
import {
  createStudent,
  deleteStudent,
  getSetting,
  getStudents,
  renameStudent,
  setSetting,
} from "@/db/index";

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type StudentStatus = "loading" | "needs-pick" | "ready";

export type StudentContextValue = {
  /** null = Guest chosen (or loading); the resolved StudentRow for the chosen id. */
  student: StudentRow | null;
  /** null = Guest. */
  studentId: number | null;
  /** true when studentId === null AND a choice has been made (status "ready"). */
  isGuest: boolean;
  status: StudentStatus;
  /** all students, oldest first. */
  students: StudentRow[];
  /** null = Guest; persists to settings. */
  setStudent: (id: number | null) => Promise<void>;
  addStudent: (displayName: string, classLabel?: string | null) => Promise<StudentRow>;
  renameStudent: (
    id: number,
    displayName: string,
    classLabel?: string | null,
  ) => Promise<void>;
  deleteStudent: (id: number) => Promise<void>;
  refreshStudents: () => Promise<void>;
  /** Return to the picker (status → needs-pick). Clears the persisted choice. */
  returnToPicker: () => Promise<void>;
};

// ──────────────────────────────────────────────────────────────────────────
// Pure resolution helper — exported for unit tests (no-new-dependency rule
// means we test the pure decision logic, not a React render tree).
// ──────────────────────────────────────────────────────────────────────────

export type ResolvedState = {
  status: Exclude<StudentStatus, "loading">;
  studentId: number | null;
  student: StudentRow | null;
};

/**
 * Resolve the initial provider state from the loaded students list and the
 * persisted `current_student` setting.
 *
 *   persisted === "guest"                       → Guest, ready
 *   persisted === null (or "" / unparsable)      → needs-pick
 *   persisted === "<id>" matching a real row   → that student, ready
 *   persisted === "<id>" with no matching row  → needs-pick (the row was
 *                                                  deleted; force a deliberate
 *                                                  re-pick rather than silently
 *                                                  falling back to Guest)
 */
export function resolveInitialState(
  students: StudentRow[],
  persisted: string | null,
): ResolvedState {
  if (persisted === "guest") {
    return { status: "ready", studentId: null, student: null };
  }
  if (persisted !== null && persisted !== "") {
    const id = Number(persisted);
    if (Number.isInteger(id)) {
      const match = students.find((s) => s.id === id);
      if (match) {
        return { status: "ready", studentId: id, student: match };
      }
    }
    // Persisted id no longer resolves — fall through to needs-pick.
  }
  return { status: "needs-pick", studentId: null, student: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Context + hook
// ──────────────────────────────────────────────────────────────────────────

const StudentContext = createContext<StudentContextValue | null>(null);

/** Throws if used outside <StudentProvider>. */
export function useStudent(): StudentContextValue {
  const ctx = useContext(StudentContext);
  if (!ctx) {
    throw new Error("useStudent must be used inside <StudentProvider>");
  }
  return ctx;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────

export function StudentProvider({ children }: { children: ReactNode }): JSX.Element {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [student, setStudentRow] = useState<StudentRow | null>(null);
  const [status, setStatus] = useState<StudentStatus>("loading");

  const refreshStudents = useCallback(async () => {
    const rows = await getStudents();
    setStudents(rows);
    // If the current student was deleted, clear the current choice and force
    // a deliberate re-pick (don't silently fall back to Guest — the next user
    // should choose intentionally on a shared machine).
    setStudentId((currentId) => {
      if (currentId !== null && !rows.some((s) => s.id === currentId)) {
        setStudentRow(null);
        setStatus("needs-pick");
        return null;
      }
      // Keep the resolved row in sync (rename changes display_name).
      if (currentId !== null) {
        const updated = rows.find((s) => s.id === currentId) ?? null;
        setStudentRow(updated);
      }
      return currentId;
    });
  }, []);

  // On mount: load students + the persisted choice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rows, persisted] = await Promise.all([
          getStudents(),
          getSetting("current_student"),
        ]);
        if (cancelled) return;
        setStudents(rows);
        const resolved = resolveInitialState(rows, persisted);
        setStudentId(resolved.studentId);
        setStudentRow(resolved.student);
        setStatus(resolved.status);
      } catch {
        if (cancelled) return;
        // A DB read failure shouldn't crash the app — drop to needs-pick so the
        // picker can try again (or the user can continue as Guest).
        setStatus("needs-pick");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setStudent = useCallback(
    async (id: number | null) => {
      await setSetting("current_student", id === null ? "guest" : String(id));
      if (id === null) {
        setStudentId(null);
        setStudentRow(null);
      } else {
        const match = students.find((s) => s.id === id) ?? null;
        setStudentId(id);
        setStudentRow(match);
      }
      setStatus("ready");
    },
    [students],
  );

  const addStudent = useCallback(
    async (displayName: string, classLabel?: string | null) => {
      const row = await createStudent(displayName, classLabel);
      await refreshStudents();
      return row;
    },
    [refreshStudents],
  );

  const rename = useCallback(
    async (id: number, displayName: string, classLabel?: string | null) => {
      await renameStudent(id, displayName, classLabel);
      await refreshStudents();
    },
    [refreshStudents],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteStudent(id);
      await refreshStudents();
    },
    [refreshStudents],
  );

  // "Switch user" from the header: drop back to the picker so the next user
  // chooses deliberately. We persist "" so a reload also lands on the picker
  // (resolveInitialState treats "" / null as needs-pick). This is an
  // intentional addition to the documented surface — the header control in
  // __root needs a way back to the picker that the listed API doesn't cover.
  const returnToPicker = useCallback(async () => {
    await setSetting("current_student", "");
    setStudentId(null);
    setStudentRow(null);
    setStatus("needs-pick");
  }, []);

  const value = useMemo<StudentContextValue>(
    () => ({
      student,
      studentId,
      isGuest: studentId === null && status === "ready",
      status,
      students,
      setStudent,
      addStudent,
      renameStudent: rename,
      deleteStudent: remove,
      refreshStudents,
      returnToPicker,
    }),
    [
      student,
      studentId,
      status,
      students,
      setStudent,
      addStudent,
      rename,
      remove,
      refreshStudents,
      returnToPicker,
    ],
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}
