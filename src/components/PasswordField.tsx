// A password/PIN input with a show/hide toggle (eye icon). Shared by the
// student login/sign-up flow (ProfilePicker) and the admin PIN gate
// (PinGate) so both credential forms behave identically.

import { useState, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";

export function PasswordField({
  value,
  onChange,
  autoComplete,
  inputRef,
  inputMode,
  autoFocus,
  disabled,
  widthClassName = "w-[260px]",
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  inputRef?: Ref<HTMLInputElement>;
  inputMode?: "numeric" | "text";
  autoFocus?: boolean;
  disabled?: boolean;
  /** Override the field's width (default 260px, matches the sign-in/sign-up forms). */
  widthClassName?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${widthClassName}`}>
      <Input
        ref={inputRef}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-full border border-line bg-surface px-4 pr-12 font-sans text-[19px] text-ink disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        disabled={disabled}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition hover:bg-canvas hover:text-ink disabled:opacity-50"
      >
        {show ? (
          <EyeOff className="size-[18px]" aria-hidden />
        ) : (
          <Eye className="size-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
}
