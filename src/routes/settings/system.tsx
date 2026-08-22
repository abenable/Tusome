// System — `/settings/system`. App/content/build version info ("the first thing
// you ask for when reporting a problem by phone"), the admin PIN change form,
// and update controls (formerly /settings/updates, folded in here since
// "check for updates" and "what version am I on" are the same mental task):
// USB scan + opt-in online checks. Every check/apply still writes to the
// update_log table (doc 07's audit trail) via appendUpdateLog — there's just
// no card reading it back for display anymore.

import { useEffect, useRef, useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Lock, RefreshCw } from "lucide-react";

import { PACKS_QUERY_KEY } from "@/content/loader";
import { getSetting, hashPin, setSetting, verifyPin } from "@/db/index";
import {
  appendUpdateLog,
  checkOnlineAppUpdate,
  checkOnlineContentUpdate,
  type ApplyResult,
  type UpdateLogEvent,
} from "@/lib/updates";
import { SectionCard } from "@/components/admin/primitives";
import { PasswordField } from "@/components/PasswordField";

export const Route = createFileRoute("/settings/system")({
  component: SystemPage,
});

function SystemPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <AboutCard />
      <PinCard />
      <UpdatesSection />
    </div>
  );
}

function AboutCard(): JSX.Element {
  const [appVersion, setAppVersion] = useState<string>("…");
  const [manifestVersion, setManifestVersion] = useState<string>("…");
  const buildId = import.meta.env.BUILD_ID ?? "dev";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion("unknown");
      }
    })();
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const v = await invoke<string>("get_content_manifest_version");
        if (!cancelled) setManifestVersion(v);
      } catch {
        if (!cancelled) setManifestVersion("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard icon={Info} title="About this app" ariaLabel="App version info">
      <dl className="flex flex-col gap-4 font-sans text-ink">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">App version</dt>
          <dd className="text-[19px]">{appVersion}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">Content manifest version</dt>
          <dd className="text-[19px]">{manifestVersion}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">Build id</dt>
          <dd className="text-[19px]">{buildId}</dd>
        </div>
      </dl>
      <p className="font-sans text-[15px] leading-relaxed text-ink-3">
        Share these three values when reporting a problem.
      </p>
    </SectionCard>
  );
}

function PinCard(): JSX.Element {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The stored hash, not just whether one exists — old-PIN verification needs
  // it. By the time this card is reachable, PinGate has already required a
  // PIN to unlock /settings, so `existingHash` is null only for the instant
  // before this effect resolves.
  const [existingHash, setExistingHash] = useState<string | null>(null);
  const newPinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getSetting("admin_pin");
      if (!cancelled) setExistingHash(existing);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSuccess(null);
    if (newPin.length < 4) {
      setError("New PIN must be at least 4 digits.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ok = existingHash !== null && (await verifyPin(oldPin, existingHash));
      if (!ok) {
        setError("That old PIN isn’t right.");
        setOldPin("");
        setBusy(false);
        return;
      }
      const hashed = await hashPin(newPin);
      await setSetting("admin_pin", hashed);
      setExistingHash(hashed);
      setOldPin("");
      setNewPin("");
      setSuccess("Admin PIN updated.");
    } catch {
      setError("Could not save the PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard icon={Lock} title="Admin PIN" ariaLabel="Change admin PIN">
      <p className="font-sans text-[18px] leading-relaxed text-ink-2">
        Enter your current PIN and a new one to replace it.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Change admin PIN">
        <label className="flex flex-col gap-1.5 font-sans text-[16px] text-ink-2">
          Old PIN
          <PasswordField
            value={oldPin}
            onChange={setOldPin}
            autoComplete="current-password"
            inputMode="numeric"
            widthClassName="max-w-[260px]"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-sans text-[16px] text-ink-2">
          New PIN
          <PasswordField
            value={newPin}
            onChange={setNewPin}
            autoComplete="new-password"
            inputMode="numeric"
            inputRef={newPinRef}
            widthClassName="max-w-[260px]"
          />
        </label>
        {error ? <p className="font-sans text-[16px] text-ink-3">{error}</p> : null}
        {success ? <p className="font-sans text-[16px] font-semibold text-brand">{success}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] w-fit items-center rounded-full bg-brand px-6 font-sans text-[18px] font-semibold text-white transition hover:bg-brand-hover active:scale-95 disabled:opacity-50"
        >
          Save PIN
        </button>
      </form>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Updates — was /settings/updates.
// ──────────────────────────────────────────────────────────────────────────

function UpdatesSection(): JSX.Element {
  const queryClient = useQueryClient();

  const [contentOnline, setContentOnline] = useState(false);
  const [appOnline, setAppOnline] = useState(false);
  const [togglesLoaded, setTogglesLoaded] = useState(false);
  const [manifestVersion, setManifestVersion] = useState<string>("…");
  const [usbBusy, setUsbBusy] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const load = async (key: string): Promise<boolean> => (await getSetting(key)) === "1";
      const [c, a] = await Promise.all([
        load("updates_content_online"),
        load("updates_app_online"),
      ]);
      if (cancelled) return;
      setContentOnline(c);
      setAppOnline(a);
      setTogglesLoaded(true);
    })();
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const v = await invoke<string>("get_content_manifest_version");
        if (!cancelled) setManifestVersion(v);
      } catch {
        if (!cancelled) setManifestVersion("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistToggle(key: string, value: boolean): Promise<void> {
    try {
      await setSetting(key, value ? "1" : "0");
    } catch {
      // swallow
    }
  }

  const anyOnlineOn = contentOnline || appOnline;

  async function handleUsbNow(): Promise<void> {
    if (usbBusy) return;
    setUsbBusy(true);
    setStatusMessage(null);
    const events: UpdateLogEvent[] = [];
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const r = await invoke<ApplyResult>("scan_and_apply_usb_updates");
      events.push(...r.events);
      if (r.applied.length > 0) {
        void queryClient.invalidateQueries({ queryKey: PACKS_QUERY_KEY });
        setStatusMessage(`Applied ${r.applied.length} pack(s) from USB.`);
      } else {
        setStatusMessage("USB scan complete — no new content found.");
      }
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "USB scan failed (no Tauri runtime?)";
      events.push({ channel: "usb", kind: "scan", outcome: "fail", detail });
      setStatusMessage(`USB scan failed: ${detail}`);
    }
    try {
      await appendUpdateLog(events);
    } catch {
      // ignore
    }
    setUsbBusy(false);
  }

  async function handleOnlineNow(): Promise<void> {
    if (onlineBusy) return;
    setOnlineBusy(true);
    setStatusMessage(null);
    const contentEvents = await checkOnlineContentUpdate({
      queryClient,
      enabled: contentOnline,
      wifiOnly: false,
    });
    const appEvents = await checkOnlineAppUpdate({ enabled: appOnline, wifiOnly: false });
    const all = [...contentEvents, ...appEvents];
    try {
      await appendUpdateLog(all);
    } catch {
      // ignore
    }
    const appliedAny = contentEvents.some((e) => e.outcome === "ok" && e.kind === "apply");
    setStatusMessage(appliedAny ? "Online check done — new content applied." : "Online check done.");
    setOnlineBusy(false);
  }

  return (
    <SectionCard icon={RefreshCw} title="Updates" ariaLabel="Update controls">
        <p className="font-sans text-[18px] leading-relaxed text-ink-2">
          Content updates arrive by USB. Online checks are off by default and only
          run when a teacher turns them on.
        </p>

        <div className="flex flex-col gap-3" role="group" aria-label="Update toggles">
          <ToggleRow
            checked={contentOnline}
            disabled={!togglesLoaded}
            label="Check for content updates online"
            description="Downloads new content packs from the release site when you press Check online now."
            onChange={(v) => {
              setContentOnline(v);
              void persistToggle("updates_content_online", v);
            }}
          />
          <ToggleRow
            checked={appOnline}
            disabled={!togglesLoaded}
            label="Check for app updates online"
            description="Stages a new app version for the next launch — never installs mid-lesson."
            onChange={(v) => {
              setAppOnline(v);
              void persistToggle("updates_app_online", v);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button
            type="button"
            onClick={handleUsbNow}
            disabled={usbBusy}
            className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-6 font-sans text-[18px] font-semibold text-white transition hover:bg-brand-hover active:scale-95 disabled:opacity-50"
          >
            {usbBusy ? "Checking USB…" : "Check USB now"}
          </button>
          <button
            type="button"
            onClick={handleOnlineNow}
            disabled={onlineBusy || !anyOnlineOn}
            className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-6 font-sans text-[18px] font-semibold text-white transition hover:bg-brand-hover active:scale-95 disabled:opacity-50"
          >
            {onlineBusy ? "Checking online…" : "Check online now"}
          </button>
          {statusMessage ? (
            <p className="font-sans text-[17px] leading-relaxed text-ink-2">{statusMessage}</p>
          ) : null}
        </div>

        <p className="font-sans text-[15px] text-ink-3">
          Content manifest version: {manifestVersion}
        </p>
    </SectionCard>
  );
}

// Native-checkbox toggle with a ≥44px hit area. Same component as the legacy
// panel — kept here so the page is self-contained.
function ToggleRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <label
      className={`flex items-start gap-3 rounded-[11px] border border-line bg-canvas px-4 py-3 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <span className="relative mt-0.5 inline-flex min-h-[44px] min-w-[44px] items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute h-[44px] w-[44px] cursor-pointer opacity-0"
          aria-label={label}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-flex h-[28px] w-[48px] items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-hover ${
            checked ? "border-brand bg-brand" : "border-line bg-surface"
          }`}
        >
          <span
            className={`ml-1 inline-block h-[20px] w-[20px] rounded-full bg-white transition ${
              checked ? "translate-x-[20px]" : "translate-x-0"
            }`}
          />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-sans text-[18px] font-semibold text-ink">{label}</span>
        <span className="font-sans text-[16px] leading-relaxed text-ink-3">{description}</span>
      </span>
    </label>
  );
}
