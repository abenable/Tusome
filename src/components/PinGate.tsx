// Reusable PIN gate — admin speed-bump only (07-updates-and-security.md).
//
// This is NOT student auth — student login now has its own per-account
// password (ProfilePicker + src/lib/student-context.tsx verifyPassword),
// separate from this single shared admin PIN. This gate guards admin-only
// surfaces (updates, export, wipe, the settings area). The threat model is a
// curious student on a shared machine, not an offline cracking rig — see the
// hashing note in src/db/index.ts (the same hashPin/verifyPin now backs both).
//
// API (render-prop): the children of <PinGate> is a function
// `(unlocked: boolean) => ReactNode`. When unlocked is false, PinGate renders
// its own PIN form (set-PIN on first run, verify-PIN thereafter). When
// unlocked is true, it renders the children. This keeps the gate self-
// contained and lets W6/W7 reuse it without wiring their own form.
//
//   <PinGate>{(unlocked) => unlocked ? <AdminPanel/> : null}</PinGate>
//
// Lockout: 3 failed tries → 30s cooldown. This is a speed-bump, NOT real
// security — a determined user can reload the page. The cooldown is meant to
// make shoulder-surfing guesses tedious, nothing more.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getSetting, hashPin, setSetting, verifyPin } from "@/db/index";
import { PasswordField } from "@/components/PasswordField";

const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 30_000;

export type PinGateProps = {
  /** Render-prop: receives `unlocked` and returns the gated content (or null). */
  children: (unlocked: boolean) => ReactNode;
  /** Optional accessible label for the gate region. */
  "aria-label"?: string;
};

export function PinGate({ children, ...rest }: PinGateProps) {
  // Phase of the gate:
  //   "loading"   — reading the settings table to see if a PIN exists.
  //   "set"       — no PIN configured yet; prompt to set one (enter + confirm).
  //   "verify"    — a PIN exists; prompt to enter it.
  //   "unlocked"  — passed the gate; render children.
  const [phase, setPhase] = useState<
    "loading" | "set" | "verify" | "unlocked"
  >("loading");
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick `now` once a second while a cooldown is active, so the countdown UI
  // updates. Stops ticking when there's no cooldown to avoid an idle timer.
  useEffect(() => {
    if (cooldownUntil === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  // On mount: check whether an admin PIN has been configured.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pin = await getSetting("admin_pin");
      if (cancelled) return;
      setStoredPin(pin);
      setPhase(pin === null ? "set" : "verify");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "unlocked") {
    return <>{children(true)}</>;
  }
  if (phase === "loading") {
    return null;
  }

  const onUnlocked = () => {
    setAttempts(0);
    setCooldownUntil(null);
    setPhase("unlocked");
  };

  const onFailed = () => {
    const next = attempts + 1;
    setAttempts(next);
    if (next >= MAX_ATTEMPTS) {
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setAttempts(0);
    }
  };

  if (phase === "set") {
    return (
      <SetPinForm
        onSet={async (pin) => {
          const hashed = await hashPin(pin);
          await setSetting("admin_pin", hashed);
          setStoredPin(hashed);
          onUnlocked();
        }}
        aria-label={rest["aria-label"]}
      />
    );
  }

  // phase === "verify"
  const cooling = cooldownUntil !== null && now < cooldownUntil;
  return (
    <VerifyPinForm
      storedPin={storedPin}
      cooling={cooling}
      cooldownRemainingMs={cooling ? (cooldownUntil ?? 0) - now : 0}
      onUnlock={onUnlocked}
      onFailed={onFailed}
      aria-label={rest["aria-label"]}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Set-PIN form (first-run bootstrap). Enter + confirm; mismatch shows an
// inline muted message (no second accent color — DESIGN.md).
// ──────────────────────────────────────────────────────────────────────────

function SetPinForm({
  onSet,
  "aria-label": ariaLabel,
}: {
  onSet: (pin: string) => Promise<void>;
  "aria-label"?: string;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("PINs don’t match. Try again.");
      setConfirm("");
      confirmRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSet(pin);
    } catch {
      setError("Could not save the PIN. Try again.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 text-center"
      aria-label={ariaLabel ?? "Set admin PIN"}
    >
      <p className="font-sans text-[19px] leading-relaxed text-ink">
        Set an admin PIN. A teacher uses this to manage profiles and updates.
      </p>
      <label className="flex flex-col items-center gap-1 font-sans text-[16px] text-ink-2">
        New PIN
        <PasswordField
          value={pin}
          onChange={setPin}
          autoComplete="new-password"
          inputMode="numeric"
          autoFocus
        />
      </label>
      <label className="flex flex-col items-center gap-1 font-sans text-[16px] text-ink-2">
        Confirm PIN
        <PasswordField
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          inputMode="numeric"
          inputRef={confirmRef}
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
        Set PIN
      </button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Verify-PIN form. Lockout after MAX_ATTEMPTS fails; countdown shown.
// ──────────────────────────────────────────────────────────────────────────

function VerifyPinForm({
  storedPin,
  cooling,
  cooldownRemainingMs,
  onUnlock,
  onFailed,
  "aria-label": ariaLabel,
}: {
  storedPin: string | null;
  cooling: boolean;
  cooldownRemainingMs: number;
  onUnlock: () => void;
  onFailed: () => void;
  "aria-label"?: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || cooling) return;
    setBusy(true);
    setError(null);
    try {
      const ok = storedPin !== null && (await verifyPin(pin, storedPin));
      if (ok) {
        onUnlock();
      } else {
        setError("That PIN isn’t right.");
        setPin("");
        onFailed();
      }
    } catch {
      setError("Could not check the PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const seconds = Math.max(0, Math.ceil(cooldownRemainingMs / 1000));

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 text-center"
      aria-label={ariaLabel ?? "Admin PIN"}
    >
      <label className="flex flex-col items-center gap-1 font-sans text-[16px] text-ink-2">
        Admin PIN
        <PasswordField
          value={pin}
          onChange={setPin}
          autoComplete="current-password"
          inputMode="numeric"
          autoFocus
          disabled={cooling}
        />
      </label>
      {error && !cooling ? (
        <p className="font-sans text-[16px] leading-relaxed text-ink-3">
          {error}
        </p>
      ) : null}
      {cooling ? (
        <p className="font-sans text-[16px] leading-relaxed text-ink-3">
          Too many tries. Try again in {seconds}s.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || cooling}
        className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] bg-brand px-6 text-[19px] text-white transition active:scale-95 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Unlock
      </button>
    </form>
  );
}
