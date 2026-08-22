// Profile picker — the shared-machine login/sign-up flow.
//
// Superseded 00-decisions §4 ("no student passwords; a name picker IS the
// whole login") — see the note atop src/lib/student-context.tsx. Flow:
//
//   root (Login / Sign Up buttons, + Guest / Admin tiles)
//     -> class picker (pick an existing class, or add a new one)
//       -> profile cards for that class (+ a "Create account" tile)
//         -> tap a card            -> password prompt -> verify -> signed in
//         -> tap "Create account"  -> name + password  -> signed in
//
// Login and Sign Up land on the exact same class-picker -> profile-grid
// screens — the "mode" only changes the header copy, since a returning
// student who can't find their card should be able to create one right there
// without starting over, and a new student who spots their own name should be
// able to just sign in.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Settings, UserRound } from "lucide-react";

import { useStudent, type StudentContextValue } from "@/lib/student-context";
import { SUBJECTS, SUBJECT_ACCENTS } from "@/lib/subjects";
import { LEVEL_ORDER } from "@/lib/topics-group";
import type { StudentRow } from "@/db/index";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/PasswordField";

type Mode = "login" | "signup";

type Step =
  | { kind: "root" }
  | { kind: "class-picker"; mode: Mode }
  | { kind: "profiles"; mode: Mode; className: string }
  | { kind: "password"; mode: Mode; className: string; student: StudentRow }
  | { kind: "create"; mode: Mode; className: string };

export function ProfilePicker() {
  const ctx = useStudent();
  const [step, setStep] = useState<Step>({ kind: "root" });

  return (
    <section
      className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-8 text-center"
      aria-label="Choose a profile"
    >
      {step.kind === "root" ? (
        <RootScreen
          onLogin={() => setStep({ kind: "class-picker", mode: "login" })}
          onSignUp={() => setStep({ kind: "class-picker", mode: "signup" })}
          onGuest={() => ctx.setStudent(null)}
        />
      ) : step.kind === "class-picker" ? (
        <ClassPicker
          mode={step.mode}
          onBack={() => setStep({ kind: "root" })}
          onPick={(className) =>
            setStep({ kind: "profiles", mode: step.mode, className })
          }
        />
      ) : step.kind === "profiles" ? (
        <ProfileGrid
          mode={step.mode}
          className={step.className}
          students={ctx.students.filter(
            (s) => (s.class_label ?? "") === step.className,
          )}
          onBack={() =>
            setStep({ kind: "class-picker", mode: step.mode })
          }
          onPick={(student) =>
            setStep({
              kind: "password",
              mode: step.mode,
              className: step.className,
              student,
            })
          }
          onCreate={() =>
            setStep({ kind: "create", mode: step.mode, className: step.className })
          }
        />
      ) : step.kind === "password" ? (
        <PasswordStep
          ctx={ctx}
          student={step.student}
          onBack={() =>
            setStep({ kind: "profiles", mode: step.mode, className: step.className })
          }
        />
      ) : (
        <CreateAccountStep
          ctx={ctx}
          className={step.className}
          onBack={() =>
            setStep({ kind: "profiles", mode: step.mode, className: step.className })
          }
        />
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Root — Login / Sign Up entry, + Guest / Admin tiles.
// ──────────────────────────────────────────────────────────────────────────

function RootScreen({
  onLogin,
  onSignUp,
  onGuest,
}: {
  onLogin: () => void;
  onSignUp: () => void;
  onGuest: () => void;
}) {
  return (
    <>
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-heading text-[38px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Who’s using CBCLab?
        </h1>
        <p className="font-sans text-[19px] leading-relaxed text-ink-2">
          Log in to an existing profile, or sign up for a new one.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex min-h-[52px] items-center rounded-full bg-brand px-8 font-sans text-[19px] font-bold text-white transition active:scale-95 hover:bg-brand-hover"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={onSignUp}
          className="inline-flex min-h-[52px] items-center rounded-full border-[1.5px] border-brand px-8 font-sans text-[19px] font-bold text-brand transition active:scale-95 hover:bg-brand/5"
        >
          Sign up
        </button>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <GuestTile onPick={onGuest} />
        <AdminTile />
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Class picker — every distinct class_label in use, + add a new one.
// ──────────────────────────────────────────────────────────────────────────

function ClassPicker({
  mode,
  onBack,
  onPick,
}: {
  mode: Mode;
  onBack: () => void;
  onPick: (className: string) => void;
}) {
  const [selected, setSelected] = useState<string>(LEVEL_ORDER[0]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onPick(selected);
  }

  return (
    <>
      <BackButton onClick={onBack} label="Back" />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {mode === "login" ? "Pick your class" : "Pick your class to sign up"}
        </h1>
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          Your profile is grouped by class.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="flex flex-col items-center gap-4"
        aria-label="Pick a class"
      >
        <label className="flex flex-col items-center gap-2 font-sans text-[16px] text-ink-2">
          Class
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Class"
            className="min-h-[48px] w-[220px] rounded-full border border-line bg-surface px-5 text-center font-sans text-[19px] font-semibold text-ink"
          >
            {LEVEL_ORDER.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-8 font-sans text-[18px] font-bold text-white transition active:scale-95 hover:bg-brand-hover"
        >
          Continue
        </button>
      </form>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Profile grid — every student in the chosen class, + Create account.
// ──────────────────────────────────────────────────────────────────────────

function ProfileGrid({
  mode,
  className,
  students,
  onBack,
  onPick,
  onCreate,
}: {
  mode: Mode;
  className: string;
  students: StudentRow[];
  onBack: () => void;
  onPick: (student: StudentRow) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <BackButton onClick={onBack} label="Change class" />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {className}
        </h1>
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          {mode === "login"
            ? "Tap your profile to log in."
            : "Don’t see yourself? Create an account below."}
        </p>
      </header>

      <ul
        className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        aria-label="Profiles in this class"
      >
        {students.map((s) => (
          <li key={s.id}>
            <ProfileCard student={s} onPick={() => onPick(s)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-line bg-transparent px-[18px] py-4 text-center transition active:scale-95 hover:bg-canvas"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-canvas text-ink-3"
              aria-hidden
            >
              <Plus className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col items-center">
              <span className="font-sans text-[18px] font-semibold text-brand">
                Create account
              </span>
              <span className="font-sans text-[15px] text-ink-3">
                New to {className}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </>
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

function ProfileCard({
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
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-line bg-surface px-[18px] py-4 text-center shadow-[0_1px_2px_rgba(0,0,0,.03)] transition active:scale-95 hover:bg-canvas"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-[17px] font-bold text-white ${accent.bg}`}
        aria-hidden
      >
        {student.display_name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="truncate font-sans text-[19px] font-bold text-ink">
          {student.display_name}
        </span>
        <span className="font-sans text-[15px] text-ink-3">
          Tap to log in
        </span>
      </span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Password step — for an existing profile card.
// ──────────────────────────────────────────────────────────────────────────

function PasswordStep({
  ctx,
  student,
  onBack,
}: {
  ctx: StudentContextValue;
  student: StudentRow;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await ctx.verifyPassword(student.id, password);
      if (!ok) {
        setError("That password isn’t right.");
        setPassword("");
        setBusy(false);
        return;
      }
      await ctx.setStudent(student.id);
    } catch (err) {
      console.error("[ProfilePicker] verifyPassword failed:", err);
      setError("Could not log in. Try again.");
      setBusy(false);
    }
  }

  const accent = avatarAccent(student.id);

  return (
    <>
      <BackButton onClick={onBack} label="Back" />
      <div className="flex flex-col items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-[17px] font-bold text-white ${accent.bg}`}
          aria-hidden
        >
          {student.display_name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="font-heading text-[27px] font-extrabold tracking-[-0.01em] text-ink">
          {student.display_name}
        </h1>
      </div>

      <form
        onSubmit={submit}
        className="flex w-full flex-col items-center gap-4 rounded-[18px] border border-line bg-surface px-6 py-5"
        aria-label={`Log in as ${student.display_name}`}
      >
        <label className="flex flex-col items-center gap-2 font-sans text-[16px] text-ink-2">
          Password
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            inputRef={inputRef}
          />
        </label>
        {error ? (
          <p className="font-sans text-[16px] leading-relaxed text-ink-3">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] bg-brand px-6 text-[19px] text-white transition active:scale-95 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Create account step — new profile under the chosen class.
// ──────────────────────────────────────────────────────────────────────────

function CreateAccountStep({
  ctx,
  className,
  onBack,
}: {
  ctx: StudentContextValue;
  className: string;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
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
      setError("Enter your name.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const row = await ctx.addStudent(trimmed, className, password);
      await ctx.setStudent(row.id);
    } catch (err) {
      console.error("[ProfilePicker] addStudent failed:", err);
      setError("Could not create the account. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <BackButton onClick={onBack} label="Back" />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Create your account
        </h1>
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          Under {className}
        </p>
      </header>

      <form
        onSubmit={submit}
        className="flex w-full flex-col items-center gap-4 rounded-[18px] border border-line bg-surface px-6 py-5"
        aria-label="Create a new profile"
      >
        <label className="flex flex-col items-center gap-2 font-sans text-[16px] text-ink-2">
          Your name
          <Input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aisha"
            className="min-h-[44px] w-[260px] rounded-full border border-line bg-surface px-4 font-sans text-[19px] text-ink"
          />
        </label>
        <label className="flex flex-col items-center gap-2 font-sans text-[16px] text-ink-2">
          Password
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
        </label>
        {error ? (
          <p className="font-sans text-[16px] leading-relaxed text-ink-3">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] bg-brand px-6 text-[19px] text-white transition active:scale-95 hover:bg-brand-hover disabled:opacity-50"
        >
          Create account &amp; continue
        </button>
      </form>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared bits: Back button, Guest tile, Admin tile.
// ──────────────────────────────────────────────────────────────────────────

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-[8px] px-1 font-sans text-[16px] font-semibold text-brand transition hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function GuestTile({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-line bg-transparent px-[18px] py-4 text-center transition active:scale-95 hover:bg-canvas"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-canvas text-ink-3"
        aria-hidden
      >
        <UserRound className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="font-sans text-[18px] font-semibold text-ink-2">
          Guest
        </span>
        <span className="font-sans text-[15px] text-ink-3">
          Practise without saving
        </span>
      </span>
    </button>
  );
}

/** Admin tile — a solid card like the student tiles, with the dark sidebar
 *  colour on its chip so it reads as a system entry, not another student. Goes
 *  to the PIN-gated /settings route. */
function AdminTile() {
  return (
    <Link
      to="/settings"
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-line bg-surface px-[18px] py-4 text-center shadow-[0_1px_2px_rgba(0,0,0,.03)] transition active:scale-95 hover:bg-canvas"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-side text-white"
        aria-hidden
      >
        <Settings className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="font-sans text-[18px] font-semibold text-ink">Admin</span>
        <span className="font-sans text-[15px] text-ink-3">
          PIN-protected settings
        </span>
      </span>
    </Link>
  );
}
