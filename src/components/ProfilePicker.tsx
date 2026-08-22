// Profile picker — the shared-machine "login" (00-decisions §4: no student
// passwords; a name picker IS the whole login). Anyone can pick anyone's
// name (acceptable — data is quiz scores). "Guest" records nothing.
//
// Two modes:
//   - First run (no students exist): an "Add your name" form + "Continue as
//     Guest". On submit → addStudent(name, classLabel) then setStudent(newId).
//   - Subsequent runs: a grid of existing names (one tap selects), a Guest
//     tile, and a small "+ Add name" affordance.
//
// A deliberately unobtrusive "Manage profiles" control (gear) opens a
// PIN-gated panel where a teacher can rename or delete profiles. The gear is
// small and out of the way so a bored student doesn't stumble into it — the
// same principle that keeps the W7 admin entry quiet.

import { useEffect, useRef, useState } from "react";
import { Cog, Plus, Trash2, Pencil } from "lucide-react";

import { useStudent, type StudentContextValue } from "@/lib/student-context";
import { SUBJECTS, SUBJECT_ACCENTS } from "@/lib/subjects";
import type { StudentRow } from "@/db/index";
import { Input } from "@/components/ui/input";
import { PinGate } from "@/components/PinGate";

export function ProfilePicker() {
  const ctx = useStudent();
  const firstRun = ctx.students.length === 0;

  return (
    <section
      className="flex flex-col gap-8"
      aria-label="Choose a profile"
    >
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Who’s using CBCLab?
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-ink-2">
          {firstRun
            ? "Add your name to save your progress, or continue as a guest."
            : "Pick your name to continue, or use Guest."}
        </p>
      </header>

      {firstRun ? <FirstRunForm ctx={ctx} /> : <NameGrid ctx={ctx} />}

      <ManageProfiles ctx={ctx} />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// First-run: add a name (or continue as Guest).
// ──────────────────────────────────────────────────────────────────────────

function FirstRunForm({ ctx }: { ctx: StudentContextValue }) {
  const [name, setName] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Autofocus the name input on first-run (a11y: focus management).
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function addAndPick(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("Enter a name to continue.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const row = await ctx.addStudent(trimmed, classLabel.trim() || null);
      await ctx.setStudent(row.id);
    } catch {
      setError("Could not save the name. Try again.");
      setBusy(false);
    }
  }

  async function guest() {
    if (busy) return;
    setBusy(true);
    await ctx.setStudent(null);
  }

  return (
    <form onSubmit={addAndPick} className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface px-6 py-5">
        <label className="flex flex-col gap-2 font-sans text-[14px] text-ink-2">
          Your name
          <Input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aisha"
            className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-2 font-sans text-[14px] text-ink-2">
          Class <span className="text-ink-3">(optional)</span>
          <Input
            type="text"
            value={classLabel}
            onChange={(e) => setClassLabel(e.target.value)}
            placeholder="e.g. S2 Blue"
            className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
          />
        </label>
      </div>

      {error ? (
        <p className="font-sans text-[14px] leading-relaxed text-ink-3">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-brand px-6 text-[17px] text-white transition active:scale-95 hover:bg-brand-hover disabled:opacity-50"
        >
          Add name &amp; start
        </button>
        <button
          type="button"
          onClick={guest}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-[9999px] border border-brand bg-transparent px-6 text-[17px] text-brand transition active:scale-95 hover:bg-brand/5 disabled:opacity-50"
        >
          Continue as Guest
        </button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Subsequent runs: a grid of names + Guest + "+ Add name".
// ──────────────────────────────────────────────────────────────────────────

function NameGrid({ ctx }: { ctx: StudentContextValue }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <ul
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        aria-label="Student profiles"
      >
        {ctx.students.map((s) => (
          <li key={s.id}>
            <NameTile student={s} onPick={() => ctx.setStudent(s.id)} />
          </li>
        ))}
        <li>
          {/* Guest tile — distinct (muted, no border) so it reads as "no
              record" vs the named cards. */}
          <button
            type="button"
            onClick={() => ctx.setStudent(null)}
            className="flex min-h-20 w-full items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line bg-transparent px-[18px] text-left transition active:scale-95 hover:bg-canvas"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-canvas font-sans text-[13px] text-ink-3"
              aria-hidden
            >
              ?
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-sans text-[16px] font-semibold text-ink-2">
                Guest
              </span>
              <span className="font-sans text-[13px] text-ink-3">
                Practise without saving
              </span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-20 w-full items-center gap-[10px] rounded-[18px] border-[1.5px] border-dashed border-line bg-transparent px-[18px] text-left font-sans text-[16px] font-semibold text-brand transition active:scale-95 hover:bg-canvas"
          >
            <Plus className="size-5" aria-hidden />
            <span>Add name</span>
          </button>
        </li>
      </ul>

      {adding ? (
        <AddNameInline ctx={ctx} onDone={() => setAdding(false)} />
      ) : null}
    </div>
  );
}

/**
 * A stable avatar colour per student, cycling the four subject accents the way
 * the design's mock does (Aisha blue, Brian green, Diana orange...). Keyed on
 * the row id so a person keeps the same colour across sessions and machines —
 * a hash of the name would change the moment a teacher fixes a typo.
 */
function avatarAccent(id: number) {
  return SUBJECT_ACCENTS[SUBJECTS[Math.abs(id) % SUBJECTS.length]];
}

function NameTile({
  student,
  onPick,
}: {
  student: StudentRow;
  onPick: () => void;
}) {
  const accent = avatarAccent(student.id);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-20 w-full items-center gap-3 rounded-[18px] border border-line bg-surface px-[18px] text-left shadow-[0_1px_2px_rgba(0,0,0,.03)] transition active:scale-95 hover:bg-canvas"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-[15px] font-bold text-white ${accent.bg}`}
        aria-hidden
      >
        {student.display_name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-sans text-[17px] font-bold text-ink">
          {student.display_name}
        </span>
        {student.class_label ? (
          <span className="truncate font-sans text-[13px] text-ink-3">
            {student.class_label}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function AddNameInline({
  ctx,
  onDone,
}: {
  ctx: StudentContextValue;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("Enter a name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const row = await ctx.addStudent(trimmed, classLabel.trim() || null);
      await ctx.setStudent(row.id);
      onDone();
    } catch {
      setError("Could not save the name. Try again.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface px-6 py-5"
      aria-label="Add a new profile"
    >
      <label className="flex flex-col gap-2 font-sans text-[14px] text-ink-2">
        Name
        <Input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
        />
      </label>
      <label className="flex flex-col gap-2 font-sans text-[14px] text-ink-2">
        Class <span className="text-ink-3">(optional)</span>
        <Input
          type="text"
          value={classLabel}
          onChange={(e) => setClassLabel(e.target.value)}
          placeholder="e.g. S2 Blue"
          className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
        />
      </label>
      {error ? (
        <p className="font-sans text-[14px] leading-relaxed text-ink-3">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-brand px-6 text-[17px] text-white transition active:scale-95 hover:bg-brand-hover disabled:opacity-50"
        >
          Save &amp; continue
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-[8px] px-4 text-[17px] text-ink-2 transition hover:bg-canvas disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Manage profiles — PIN-gated, deliberately quiet (small gear link).
// ──────────────────────────────────────────────────────────────────────────

function ManageProfiles({ ctx }: { ctx: StudentContextValue }) {
  const [open, setOpen] = useState(false);

  // The manage affordance is a small text link with a gear icon — not a big
  // button. A bored student has no reason to tap it; a teacher will find it.
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] w-fit items-center gap-2 text-[14px] text-ink-3 transition hover:text-ink"
      >
        <Cog className="size-4" aria-hidden />
        Manage profiles
      </button>

      {open ? (
        <div
          className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface px-6 py-6"
          aria-label="Manage profiles"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-[21px] font-semibold tracking-tight text-ink">
              Manage profiles
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-[8px] px-4 text-[14px] text-ink-2 transition hover:bg-canvas"
            >
              Close
            </button>
          </div>

          {/* Guest has no profiles to manage. */}
          {ctx.students.length === 0 ? (
            <p className="font-sans text-[17px] leading-relaxed text-ink-3">
              No profiles yet.
            </p>
          ) : (
            <PinGate aria-label="Manage profiles PIN">
              {(unlocked) =>
                unlocked ? (
                  <ul className="flex flex-col gap-3">
                    {ctx.students.map((s) => (
                      <li key={s.id}>
                        <ManageRow student={s} ctx={ctx} />
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            </PinGate>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ManageRow({
  student,
  ctx,
}: {
  student: StudentRow;
  ctx: StudentContextValue;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.display_name);
  const [classLabel, setClassLabel] = useState(student.class_label ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    setBusy(true);
    try {
      await ctx.renameStudent(
        student.id,
        trimmed,
        classLabel.trim() === "" ? null : classLabel.trim(),
      );
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await ctx.deleteStudent(student.id);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="flex flex-col gap-3 rounded-[8px] bg-canvas px-4 py-3"
      >
        <label className="flex flex-col gap-1 font-sans text-[14px] text-ink-2">
          Name
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 font-sans text-[14px] text-ink-2">
          Class
          <Input
            type="text"
            value={classLabel}
            onChange={(e) => setClassLabel(e.target.value)}
            placeholder="optional"
            className="min-h-[44px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-[17px] text-ink"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-brand px-5 text-[17px] text-white transition active:scale-95 hover:bg-brand-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(student.display_name);
              setClassLabel(student.class_label ?? "");
            }}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-[8px] px-4 text-[17px] text-ink-2 transition hover:bg-line disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-[8px] bg-canvas px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-[17px] font-medium text-ink">
          {student.display_name}
        </span>
        {student.class_label ? (
          <span className="font-sans text-[14px] text-ink-3">
            {student.class_label}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <>
            <span className="font-sans text-[14px] text-ink-3">Delete?</span>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] px-3 text-[14px] text-ink transition hover:bg-line disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 text-[14px] text-ink-3 transition hover:bg-line disabled:opacity-50"
            >
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] px-3 text-[14px] text-ink-2 transition hover:bg-line"
            >
              <Pencil className="size-4" aria-hidden />
              Rename
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-[8px] px-3 text-[14px] text-ink-3 transition hover:bg-line"
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
