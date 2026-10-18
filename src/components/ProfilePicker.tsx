// Profile picker — the shared-machine login/sign-up flow.
//
// Superseded 00-decisions §4 ("no student passwords; a name picker IS the
// whole login") — see the note atop src/lib/student-context.tsx. Flow:
//
//   root (Login / Sign Up buttons, + Guest / Admin tiles)
//     -> class picker (one big button per level, S1..S4)
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
      className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-8 pt-4 text-center"
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
        <h1 className="font-heading text-[44px] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink">
          Who’s learning today?
        </h1>
        <p className="font-sans text-[19px] leading-relaxed text-ink-2">
          Log in to your profile, or sign up if you’re new.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex min-h-[56px] min-w-[150px] items-center justify-center rounded-full bg-sun px-8 font-sans text-[19px] font-bold text-ink transition hover:bg-sun-hover active:scale-[0.98]"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={onSignUp}
          className="inline-flex min-h-[56px] min-w-[150px] items-center justify-center rounded-full border-2 border-ink px-8 font-sans text-[19px] font-bold text-ink transition hover:bg-ink/5 active:scale-[0.98]"
        >
          Sign up
        </button>
      </div>

      <div className="mt-2 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
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
  return (
    <>
      <BackButton onClick={onBack} label="Back" />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {mode === "login" ? "Which class are you in?" : "Pick your class to sign up"}
        </h1>
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          Profiles are grouped by class.
        </p>
      </header>

      <div
        className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4"
        role="group"
        aria-label="Class"
      >
        {LEVEL_ORDER.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onPick(level)}
            className="flex min-h-[96px] items-center justify-center rounded-card border border-line bg-surface font-heading text-[32px] font-extrabold text-ink shadow-card transition hover:-translate-y-0.5 hover:border-ink-3 active:scale-[0.98]"
          >
            {level}
          </button>
        ))}
      </div>
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
        <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
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
            className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-transparent px-[18px] py-4 text-center transition hover:border-ink-3 hover:bg-surface active:scale-[0.98]"
          >
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sun text-ink"
              aria-hidden
            >
              <Plus className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col items-center">
              <span className="font-sans text-[18px] font-bold text-ink">
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
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-[18px] py-4 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full font-heading text-[18px] font-bold text-white ${accent.bg}`}
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
          className={`flex size-14 shrink-0 items-center justify-center rounded-full font-heading text-[24px] font-bold text-white ${accent.bg}`}
          aria-hidden
        >
          {student.display_name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="font-heading text-[30px] font-extrabold tracking-[-0.01em] text-ink">
          {student.display_name}
        </h1>
      </div>

      <form
        onSubmit={submit}
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-card border border-line bg-surface p-6 text-left shadow-card"
        aria-label={`Log in as ${student.display_name}`}
      >
        <label className="flex flex-col gap-2 font-sans text-[16px] font-bold text-ink-2">
          Password
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            inputRef={inputRef}
            widthClassName="w-full"
          />
        </label>
        {error ? (
          <p role="alert" className="font-sans text-[16px] font-bold leading-relaxed text-bad">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-brand px-6 font-sans text-[18px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
        <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Create your account
        </h1>
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          You’ll join {className}.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-card border border-line bg-surface p-6 text-left shadow-card"
        aria-label="Create a new profile"
      >
        <label className="flex flex-col gap-2 font-sans text-[16px] font-bold text-ink-2">
          Your name
          <Input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aisha"
            className="min-h-[44px] w-full rounded-full border border-line bg-surface px-4 font-sans text-[19px] font-normal text-ink"
          />
        </label>
        <label className="flex flex-col gap-2 font-sans text-[16px] font-bold text-ink-2">
          Password
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            widthClassName="w-full"
          />
        </label>
        {error ? (
          <p role="alert" className="font-sans text-[16px] font-bold leading-relaxed text-bad">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-brand px-6 font-sans text-[18px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50"
        >
          Create account
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
      className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-full px-2 font-sans text-[16px] font-bold text-ink-2 transition hover:text-ink"
    >
      <ArrowLeft className="size-[18px]" aria-hidden />
      {label}
    </button>
  );
}

function GuestTile({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-[18px] py-5 text-center transition hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98]"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-line-soft text-ink-2"
        aria-hidden
      >
        <UserRound className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="font-sans text-[18px] font-bold text-ink">
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
      className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-[18px] py-5 text-center transition hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98]"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-side text-white"
        aria-hidden
      >
        <Settings className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col items-center">
        <span className="font-sans text-[18px] font-bold text-ink">Teacher / admin</span>
        <span className="font-sans text-[15px] text-ink-3">
          PIN-protected settings
        </span>
      </span>
    </Link>
  );
}
