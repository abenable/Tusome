// Students — `/settings/students`. The student register: a searchable,
// filterable table with per-student started/completed metrics (across all
// topics), rename + delete (dialog), and a per-student topic-progress view.
// The class filter is a fixed S1–S4 pill row (LEVEL_ORDER) rather than
// derived from whatever class_labels happen to exist, so a class with no
// students yet still has a pill to filter to (it just shows an empty table).
//
// Student state comes from the shared `useStudent` context (so a rename here is
// seen everywhere); progress comes from getAllProgress.

import { useEffect, useMemo, useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Search, Trash2, Users } from "lucide-react";

import { loadPacksCached } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { getAllProgress } from "@/db/index";
import type { ProgressWithStudent, StudentRow } from "@/db/index";
import { useStudent } from "@/lib/student-context";
import { allTopics } from "@/lib/admin-stats";
import { LEVEL_ORDER } from "@/lib/topics-group";
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
      const p = await getAllProgress();
      if (!cancelled) setProgress(p);
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
                  <TableHead className="font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Student
                  </TableHead>
                  <TableHead className="font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Class
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Started
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Done
                  </TableHead>
                  <TableHead className="font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Last active
                  </TableHead>
                  <TableHead className="text-right font-sans text-[15px] font-bold uppercase tracking-wide text-ink-3">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.student.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-[14px] font-bold text-white">
                          {r.student.display_name.slice(0, 1).toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewing(r.student)}
                          className="font-sans text-[17px] font-semibold text-ink hover:underline"
                        >
                          {r.student.display_name}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="font-sans text-[16px] text-ink-2">
                      {r.student.class_label ?? <span className="text-ink-3">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-sans text-[17px] text-ink-2">
                      {r.started}
                    </TableCell>
                    <TableCell className="text-right font-sans text-[17px] text-ink-2">
                      {r.completed}
                    </TableCell>
                    <TableCell className="font-sans text-[15px] text-ink-3">
                      {r.lastActive ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRenaming(r.student)}
                          aria-label={`Rename ${r.student.display_name}`}
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

      {renaming ? (
        <RenameDialog
          student={renaming}
          onClose={() => setRenaming(null)}
          onSave={async (name, label) => {
            await renameStudent(renaming.id, name, label);
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
// Rename dialog.
// ──────────────────────────────────────────────────────────────────────────

function RenameDialog({
  student,
  onClose,
  onSave,
}: {
  student: StudentRow;
  onClose: () => void;
  onSave: (name: string, classLabel: string | null) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(student.display_name);
  const [label, setLabel] = useState(student.class_label ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename student</DialogTitle>
          <DialogDescription>Update the display name and class label.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const trimmed = name.trim();
            if (trimmed.length < 1) return;
            setBusy(true);
            await onSave(trimmed, label.trim() === "" ? null : label.trim());
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5 font-sans text-[16px] text-ink-2">
            Display name
            <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px]" />
          </label>
          <label className="flex flex-col gap-1.5 font-sans text-[16px] text-ink-2">
            Class <span className="text-ink-3">(optional)</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. S2 Blue" className="min-h-[44px]" />
          </label>
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
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {student.display_name}?</DialogTitle>
          <DialogDescription>
            This also deletes their progress. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            className="rounded-full bg-ink text-white hover:bg-ink/90"
            onClick={async () => {
              setBusy(true);
              await onConfirm();
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
            {student.class_label ? `Class ${student.class_label} · ` : ""}
            {topics.length} topics installed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="flex flex-col gap-1.5">
            {topics.map((t) => {
              const state = stateOf.get(t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-canvas px-3 py-2"
                >
                  <span className="font-sans text-[16px] text-ink">{t.title}</span>
                  <span
                    className={
                      state === "completed"
                        ? "font-sans text-[15px] font-bold text-brand"
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

