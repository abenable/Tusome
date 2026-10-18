// Students — `/settings/students`. The student register: a searchable,
// filterable table with per-student started/completed metrics (across all
// topics), edit (name, class, password reset) + delete dialogs, and a
// per-student topic-progress view.
// The class filter is a fixed S1–S4 pill row (LEVEL_ORDER) rather than
// derived from whatever class_labels happen to exist, so a class with no
// students yet still has a pill to filter to (it just shows an empty table).
//
// Student state comes from the shared `useStudent` context (so a rename here is
// seen everywhere); progress comes from getAllProgress.

import { useEffect, useMemo, useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Pencil, Search, Trash2, Users } from "lucide-react";

import { loadPacksCached } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { deleteClass, getAllProgress, hashPin, moveClass, setStudentPassword } from "@/db/index";
import type { ProgressWithStudent, StudentRow } from "@/db/index";
import { useStudent } from "@/lib/student-context";
import { allTopics } from "@/lib/admin-stats";
import { LEVEL_ORDER } from "@/lib/topics-group";
import { formatDbTime } from "@/lib/utils";
import { SectionCard } from "@/components/admin/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings/students")({
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { packs } = await loadPacksCached(context.queryClient);
    return { packs };
  },
  component: StudentsPage,
});

type Row = {
  student: StudentRow;
  started: number;
  completed: number;
  total: number;
  lastActive: string | null;
};

function StudentsPage(): JSX.Element {
  const { packs } = Route.useLoaderData();
  const { students, renameStudent, deleteStudent, refreshStudents } = useStudent();
  const [progress, setProgress] = useState<ProgressWithStudent[] | null>(null);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [renaming, setRenaming] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [viewing, setViewing] = useState<StudentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await getAllProgress();
        if (!cancelled) setProgress(p);
      } catch (err) {
        // Names still list from the student context; metrics just read zero.
        console.error("[Students] getAllProgress failed:", err);
        if (!cancelled) setProgress([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    const inScope = allTopics(packs).map((t) => t.id);
    const scopeSet = new Set(inScope);
    const total = inScope.length;
    const byStudent = new Map<number, ProgressWithStudent[]>();
    if (progress) {
      for (const p of progress) {
        if (!scopeSet.has(p.topic_id)) continue;
        let arr = byStudent.get(p.student_id);
        if (!arr) {
          arr = [];
          byStudent.set(p.student_id, arr);
        }
        arr.push(p);
      }
    }
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => classFilter === "all" || s.class_label === classFilter)
      .filter((s) => q === "" || s.display_name.toLowerCase().includes(q))
      .map((s) => {
        const arr = byStudent.get(s.id) ?? [];
        let started = 0;
        let completed = 0;
        let lastActive: string | null = null;
        for (const p of arr) {
          if (p.state === "completed") completed++;
          else if (p.state === "started") started++;
          if (!lastActive || p.updated_at > lastActive) lastActive = p.updated_at;
        }
        return {
          student: s,
          started,
          completed,
          total,
          lastActive,
        };
      });
  }, [students, progress, packs, query, classFilter]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <SectionCard icon={Users} title="Students" count={students.length} ariaLabel="Student register">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search students"
              className="min-h-[44px] rounded-full border border-line bg-surface pl-12 pr-4 font-sans text-[18px] text-ink"
            />
          </div>
        </div>

        {/* Class filter — pills instead of a second dropdown, so picking a
            class is one tap rather than open-menu-then-select. */}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by class"
        >
          <button
            type="button"
            onClick={() => setClassFilter("all")}
            aria-pressed={classFilter === "all"}
            className={`inline-flex min-h-[38px] items-center rounded-full px-4 font-sans text-[15px] font-bold transition-colors ${
              classFilter === "all"
                ? "bg-brand text-white"
                : "border border-line bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            All classes
          </button>
          {LEVEL_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClassFilter(c)}
              aria-pressed={classFilter === c}
              className={`inline-flex min-h-[38px] items-center rounded-full px-4 font-sans text-[15px] font-bold transition-colors ${
                classFilter === c
                  ? "bg-brand text-white"
                  : "border border-line bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="font-sans text-[18px] text-ink-3">
            {students.length === 0
              ? "No students yet. Add one from the login screen."
              : "No students match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">
                    Student
                  </TableHead>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">
                    Class
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold text-ink-3">
                    Started
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold text-ink-3">
                    Done
                  </TableHead>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">
                    Last active
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold text-ink-3">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.student.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun font-heading text-[14px] font-bold text-ink">
                          {r.student.display_name.slice(0, 1).toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewing(r.student)}
                          className="rounded-full font-sans text-[17px] font-bold text-ink hover:underline"
                        >
                          {r.student.display_name}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-[16px] text-ink-2">
                      {r.student.class_label ?? <span className="text-ink-3">Not set</span>}
                    </TableCell>
                    <TableCell className="text-right font-sans text-[17px] tabular-nums text-ink-2">
                      {r.started}
                    </TableCell>
                    <TableCell className="text-right font-sans text-[17px] tabular-nums text-ink-2">
                      {r.completed}
                    </TableCell>
                    <TableCell className="font-sans text-[15px] tabular-nums text-ink-3">
                      {r.lastActive ? formatDbTime(r.lastActive) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRenaming(r.student)}
                          aria-label={`Edit ${r.student.display_name}`}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(r.student)}
                          aria-label={`Delete ${r.student.display_name}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <NewYearCard students={students} onDone={refreshStudents} />

      {renaming ? (
        <RenameDialog
          student={renaming}
          onClose={() => setRenaming(null)}
          onSave={async (name, label, password) => {
            await renameStudent(renaming.id, name, label);
            if (password) {
              await setStudentPassword(renaming.id, await hashPin(password));
            }
            await refreshStudents();
            setRenaming(null);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteDialog
          student={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteStudent(deleting.id);
            await refreshStudents();
            setProgress((prev) =>
              prev ? prev.filter((p) => p.student_id !== deleting.id) : prev,
            );
            setDeleting(null);
          }}
        />
      ) : null}

      {viewing ? (
        <ProgressDialog
          student={viewing}
          packs={packs}
          progress={progress ?? []}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Edit dialog: name, class, optional password reset.
//
// Class is a required S1–S4 select, never free text: login groups profiles by
// an exact class match, so a typed "S2 Blue" (or a cleared class) hid the
// student from every class on the login screen.
// ──────────────────────────────────────────────────────────────────────────

const FIELD_LABEL = "flex flex-col gap-1.5 font-sans text-[16px] font-bold text-ink-2";
const ERROR_TEXT = "font-sans text-[16px] font-bold text-bad";

function RenameDialog({
  student,
  onClose,
  onSave,
}: {
  student: StudentRow;
  onClose: () => void;
  onSave: (name: string, classLabel: string, password: string | null) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(student.display_name);
  // A legacy free-text label that isn't S1–S4 starts unselected, so the admin
  // must pick a real class rather than silently keeping a broken one.
  const [label, setLabel] = useState<string>(
    (LEVEL_ORDER as readonly string[]).includes(student.class_label ?? "")
      ? (student.class_label as string)
      : "",
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>Change the name or class, or set a new password.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const trimmed = name.trim();
            if (trimmed.length < 1) {
              setError("Enter a name.");
              return;
            }
            if (label === "") {
              setError("Choose a class.");
              return;
            }
            if (password !== "" && password.length < 4) {
              setError("The new password must be at least 4 characters.");
              return;
            }
            setError(null);
            setBusy(true);
            try {
              await onSave(trimmed, label, password === "" ? null : password);
            } catch (err) {
              console.error("[Students] save failed:", err);
              setError("Could not save. Try again.");
              setBusy(false);
            }
          }}
          className="flex flex-col gap-4"
        >
          <label className={FIELD_LABEL}>
            Display name
            <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px] font-normal" />
          </label>
          <label className={FIELD_LABEL}>
            Class
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="min-h-[44px] rounded-lg border border-line bg-surface px-3 font-sans text-[17px] font-normal text-ink"
            >
              <option value="" disabled>
                Choose a class
              </option>
              {LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_LABEL}>
            New password
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[44px] font-normal"
            />
            <span className="font-normal text-ink-3">
              Leave blank to keep the current password.
            </span>
          </label>
          {error ? (
            <p role="alert" className={ERROR_TEXT}>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="rounded-full bg-brand text-white hover:bg-brand-hover"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Delete confirm dialog.
// ──────────────────────────────────────────────────────────────────────────

function DeleteDialog({
  student,
  onClose,
  onConfirm,
}: {
  student: StudentRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {student.display_name}?</DialogTitle>
          <DialogDescription>
            This also deletes their progress. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className={ERROR_TEXT}>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            className="rounded-full bg-bad text-white hover:bg-bad/90"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (err) {
                console.error("[Students] delete failed:", err);
                setError("Could not delete. Try again.");
                setBusy(false);
              }
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Per-student progress dialog — every installed topic with its state.
// ──────────────────────────────────────────────────────────────────────────

function ProgressDialog({
  student,
  packs,
  progress,
  onClose,
}: {
  student: StudentRow;
  packs: PackT[];
  progress: ProgressWithStudent[];
  onClose: () => void;
}): JSX.Element {
  const topics = allTopics(packs);
  const stateOf = new Map<string, string>();
  for (const p of progress) {
    if (p.student_id === student.id) stateOf.set(p.topic_id, p.state);
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{student.display_name}’s progress</DialogTitle>
          <DialogDescription>
            {student.class_label ? `Class ${student.class_label}. ` : ""}
            {topics.length} {topics.length === 1 ? "topic" : "topics"} installed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="flex flex-col gap-1.5">
            {topics.map((t) => {
              const state = stateOf.get(t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-tile border border-line-soft bg-canvas px-3 py-2"
                >
                  <span className="font-sans text-[16px] text-ink">{t.title}</span>
                  <span
                    className={
                      state === "completed"
                        ? "font-sans text-[15px] font-bold text-good"
                        : state === "started"
                          ? "font-sans text-[15px] font-bold text-ink-2"
                          : "font-sans text-[15px] text-ink-3"
                    }
                  >
                    {state === "completed" ? "Completed" : state === "started" ? "In progress" : "Not started"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Start of a school year: every class moves up one (S1 → S2 … S3 → S4) and
// S4 leavers are removed with their progress, so records aren't kept longer
// than they're needed. Done top-down so no two classes ever merge.
function NewYearCard({
  students,
  onDone,
}: {
  students: StudentRow[];
  onDone: () => Promise<void>;
}): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = (c: string) => students.filter((s) => s.class_label === c).length;

  async function moveUp() {
    setBusy(true);
    setError(null);
    try {
      const left = await deleteClass("S4");
      for (const [from, to] of [["S3", "S4"], ["S2", "S3"], ["S1", "S2"]]) await moveClass(from, to);
      await onDone();
      setDone(`Done. Every class moved up${left ? ` and ${left} S4 leaver${left === 1 ? " was" : "s were"} removed` : ""}.`);
      setConfirming(false);
    } catch (err) {
      console.error("[Students] new year move failed:", err);
      setError("Could not move the classes. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard icon={CalendarClock} title="New school year" ariaLabel="Move classes up for a new school year">
      <p className="max-w-[62ch] font-sans text-[18px] leading-relaxed text-ink-2">
        At the start of a year, move every learner up a class in one go. S4 learners have finished, so
        they're removed with their progress.
      </p>
      <p className="font-sans text-[16px] tabular-nums text-ink-3">
        {LEVEL_ORDER.map((c) => `${c}: ${count(c)}`).join(" · ")}
      </p>
      {done ? (
        <p role="status" className="font-sans text-[16px] font-bold text-good">
          {done}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="min-h-[48px] w-fit rounded-full px-6 text-[17px] font-bold"
        onClick={() => {
          setDone(null);
          setConfirming(true);
        }}
      >
        Move everyone up a class
      </Button>
      {confirming ? (
        <Dialog open onOpenChange={(o) => { if (!o && !busy) setConfirming(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move everyone up a class?</DialogTitle>
              <DialogDescription>
                S1 becomes S2, S2 becomes S3 and S3 becomes S4. The {count("S4")} learners in S4 are
                removed with their progress. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className={ERROR_TEXT}>
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={() => void moveUp()} className="rounded-full">
                {busy ? "Moving…" : "Move classes up"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}
