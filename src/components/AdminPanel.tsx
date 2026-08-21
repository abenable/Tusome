// AdminPanel (W7) — the PIN-gated admin surface shown on `/settings`.
//
// Sections (each a real <section> with a heading):
//   (a) Installed content packs — list each pack's id/version/topic count, and
//       surface skipped/invalid packs from the loader's `skipped` list (here
//       named `errors`). This is "surface skipped/invalid packs in the admin
//       screen's log, never a modal in front of a student".
//   (b) Profile management — list students, rename (display name + class label
//       inline) and delete (confirm), plus an "Export class results to CSV"
//       affordance reusing the W6 export path (src/lib/export-csv.ts).
//   (c) About — app version (getVersion), content manifest version (Rust
//       `get_content_manifest_version`), build id (import.meta.env.BUILD_ID).
//       "The first thing you ask for when a school reports a problem by phone."
//   (d) Update controls — a DISABLED "Updates — coming soon" placeholder. The
//       real updater/USB/signing logic is doc 07, out of scope for W7. Pure
//       placeholder; no @tauri-apps/plugin-updater import.
//   (e) PIN change — set/change the admin PIN (hashPin + setSetting). Separate
//       from PinGate's first-run bootstrap; here an already-unlocked admin can
//       rotate the PIN.
//
// DESIGN.md: 17px body, single Action Blue #0066cc for interactives, pill CTAs
// for primary actions, ≥44px touch targets, no shadows on chrome, no
// gradients, no second brand color. Reuses <PinGate> for the gate itself (the
// route wraps this panel in PinGate; this component assumes it's unlocked).

import { useEffect, useRef, useState, type JSX } from "react";
import { Link } from "@tanstack/react-router";

import type { PackT } from "@/content/schema";
import { getSetting, hashPin, setSetting, classResults } from "@/db/index";
import { useStudent } from "@/lib/student-context";
import { exportClassResultsCsv } from "@/lib/export-csv";
import { Input } from "@/components/ui/input";

export type AdminPanelProps = {
  packs: PackT[];
  errors: Array<{ path: string; error: string }>;
};

export function AdminPanel({ packs, errors }: AdminPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[40px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          Admin
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          Manage profiles, content, and the admin PIN.
        </p>
      </header>

      <InstalledPacksSection packs={packs} errors={errors} />
      <ProfileSection />
      <AboutSection />
      <UpdatesSection />
      <PinChangeSection />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (a) Installed content packs + skipped/invalid packs
// ──────────────────────────────────────────────────────────────────────────

function InstalledPacksSection({
  packs,
  errors,
}: {
  packs: PackT[];
  errors: Array<{ path: string; error: string }>;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4" aria-label="Installed content packs">
      <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
        Installed content packs
      </h2>

      {packs.length === 0 ? (
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          No content packs installed.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {packs.map((p) => (
            <li
              key={p.packId}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-[17px] text-[#1d1d1f]"
            >
              <span className="font-semibold">{p.packId}</span>
              <span className="text-[#666666]">v{p.version}</span>
              <span className="text-[#666666]">
                · {p.topics.length}{" "}
                {p.topics.length === 1 ? "topic" : "topics"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Skipped / invalid packs — the loader's `skipped` list, surfaced here
          (never as a student-facing modal). Each shows the path basename and
          the validation/parse error message. */}
      <div className="flex flex-col gap-2">
        <h3 className="font-sans text-[17px] font-semibold text-[#1d1d1f]">
          Validation log
        </h3>
        {errors.length === 0 ? (
          <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
            All installed packs validated.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {errors.map((e, i) => (
              <li
                key={`${e.path}-${i}`}
                className="flex flex-col gap-1 rounded-[8px] border border-hairline bg-card px-4 py-3"
              >
                <span className="font-sans text-[14px] font-semibold text-[#1d1d1f]">
                  {basename(e.path)}
                </span>
                <span className="font-sans text-[14px] leading-relaxed text-[#666666]">
                  {e.error}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Basename of a path — the last segment — so the log reads like a filename. */
function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// ──────────────────────────────────────────────────────────────────────────
// (b) Profile management — rename/delete students + export class results
// ──────────────────────────────────────────────────────────────────────────

function ProfileSection(): JSX.Element {
  const { students, renameStudent, deleteStudent, refreshStudents } =
    useStudent();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  async function handleExport() {
    // Reuse the W6 export path. The class grid is rebuilt here from
    // `classResults()` so the AdminPanel doesn't need the W6 component's
    // cached results Map; the export helper handles the empty/unavailable
    // cases.
    setExportStatus("Building…");
    try {
      const rows = await classResults();
      const m = new Map<string, number>();
      for (const r of rows) m.set(`${r.student_id}|${r.topic_id}`, r.best);
      // Topics across all installed packs — passed in by the route via packs;
      // we reach for them through the closure-free path below.
      const topics = PACKS_FOR_EXPORT.flatMap((p) => p.topics);
      const res = await exportClassResultsCsv(students, topics, m);
      setExportStatus(res.message);
    } catch (err) {
      setExportStatus(
        `Could not export: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Profile management">
      <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
        Profiles
      </h2>
      <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
        Rename or remove students on this shared machine. Deleting a student
        also deletes their progress and quiz attempts.
      </p>

      {students.length === 0 ? (
        <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
          No students yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {students.map((s) => (
            <StudentRowItem
              key={s.id}
              id={s.id}
              displayName={s.display_name}
              classLabel={s.class_label}
              onRename={renameStudent}
              onDelete={async () => {
                await deleteStudent(s.id);
                await refreshStudents();
              }}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white transition active:scale-95 hover:bg-[#0071e3]"
        >
          Export class results to CSV
        </button>
        <Link
          to="/dashboard"
          className="inline-flex min-h-[44px] items-center text-[17px] text-[#0066cc] hover:underline"
        >
          Open teacher dashboard
        </Link>
        {exportStatus ? (
          <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
            {exportStatus}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// PACKS_FOR_EXPORT is set by the route via setExportPacks before the panel's
// export handler runs. This keeps the export self-contained without threading
// packs through every ProfileSection render. It is module-level (not React
// state) because it's only read in the export click handler, never in render —
// a click is always preceded by a render with the latest packs, so the value
// is fresh by the time a human clicks.
let PACKS_FOR_EXPORT: PackT[] = [];

/** Called by the route with the loaded packs so the export handler can build
 *  the topic list. Kept minimal — a single module slot. */
export function setExportPacks(packs: PackT[]): void {
  PACKS_FOR_EXPORT = packs;
}

function StudentRowItem({
  id,
  displayName,
  classLabel,
  onRename,
  onDelete,
}: {
  id: number;
  displayName: string;
  classLabel: string | null;
  onRename: (
    id: number,
    displayName: string,
    classLabel?: string | null,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [label, setLabel] = useState(classLabel ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (busy) return;
    if (name.trim().length === 0) {
      setError("Name can’t be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // "" class label → null (clear it). Trim whitespace.
      await onRename(id, name.trim(), label.trim() === "" ? null : label.trim());
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the change.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } catch {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-[11px] border border-hairline bg-card px-4 py-3">
      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 font-sans text-[14px] text-[#333333]">
            Display name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-[44px] max-w-[320px] rounded-[8px] border border-[#e0e0e0] bg-[#ffffff] px-3 py-2 font-sans text-[17px] text-[#1d1d1f]"
            />
          </label>
          <label className="flex flex-col gap-1 font-sans text-[14px] text-[#333333]">
            Class label (optional)
            <Input
              value={label}
              placeholder="e.g. S2A"
              onChange={(e) => setLabel(e.target.value)}
              className="min-h-[44px] max-w-[320px] rounded-[8px] border border-[#e0e0e0] bg-[#ffffff] px-3 py-2 font-sans text-[17px] text-[#1d1d1f]"
            />
          </label>
          {error ? (
            <p className="font-sans text-[14px] leading-relaxed text-[#666666]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-5 text-[17px] text-white transition active:scale-95 hover:bg-[#0071e3] disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(displayName);
                setLabel(classLabel ?? "");
                setError(null);
                setEditing(false);
              }}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[17px] text-[#0066cc] hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-sans text-[17px] font-semibold text-[#1d1d1f]">
              {displayName}
            </span>
            {classLabel ? (
              <span className="font-sans text-[14px] text-[#666666]">
                {classLabel}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[17px] text-[#0066cc] hover:underline"
            >
              Rename
            </button>
            {confirmingDelete ? (
              <>
                <span className="inline-flex items-center font-sans text-[14px] text-[#666666]">
                  Delete this student?
                </span>
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[17px] text-[#0066cc] hover:underline disabled:opacity-50"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[17px] text-[#333333] hover:underline"
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[17px] text-[#333333] hover:text-[#0066cc]"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (c) About — app version, content manifest version, build id
// ──────────────────────────────────────────────────────────────────────────

function AboutSection(): JSX.Element {
  // App version via @tauri-apps/api/app (guarded — unknown outside Tauri).
  const [appVersion, setAppVersion] = useState<string>("…");
  // Content manifest version via the Rust command (guarded → "unknown").
  const [manifestVersion, setManifestVersion] = useState<string>("…");
  // Build id is a build-time define; always a real string.
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
    <section className="flex flex-col gap-4" aria-label="About this app">
      <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
        About
      </h2>
      <dl className="flex flex-col gap-2 font-sans text-[17px] text-[#1d1d1f]">
        <div className="flex flex-col gap-1">
          <dt className="text-[14px] text-[#666666]">App version</dt>
          <dd>{appVersion}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[14px] text-[#666666]">Content manifest version</dt>
          <dd>{manifestVersion}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[14px] text-[#666666]">Build id</dt>
          <dd>{buildId}</dd>
        </div>
      </dl>
      <p className="font-sans text-[14px] leading-relaxed text-[#666666]">
        Share these three values when reporting a problem.
      </p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (d) Update controls — DISABLED placeholder (scope decision 1)
// ──────────────────────────────────────────────────────────────────────────

function UpdatesSection(): JSX.Element {
  return (
    <section
      className="flex flex-col gap-4 rounded-[11px] border border-hairline bg-card px-5 py-5"
      aria-label="Updates"
    >
      <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
        Updates
      </h2>
      <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
        Coming soon. Content and app updates will arrive via USB and an optional
        online check.
      </p>
      <button
        type="button"
        disabled
        className="inline-flex min-h-[44px] w-fit cursor-not-allowed items-center rounded-[9999px] bg-[#d2d2d7] px-6 text-[17px] text-[#666666]"
      >
        Check for updates
      </button>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (e) PIN change — set/rotate the admin PIN
// ──────────────────────────────────────────────────────────────────────────

function PinChangeSection(): JSX.Element {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSuccess(null);
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
      const hashed = await hashPin(pin);
      await setSetting("admin_pin", hashed);
      setPin("");
      setConfirm("");
      setSuccess("Admin PIN updated.");
    } catch {
      setError("Could not save the PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // The current PIN (if any) is read only to surface whether a PIN exists;
  // this panel never verifies the old PIN because it's already behind <PinGate>.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getSetting("admin_pin");
      if (!cancelled) setHasPin(existing !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-4" aria-label="Change admin PIN">
      <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
        Admin PIN
      </h2>
      <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
        {hasPin === null
          ? "Loading…"
          : hasPin
            ? "Set a new admin PIN. This replaces the current one."
            : "Set an admin PIN so a teacher can manage profiles and updates."}
      </p>
      <form
        onSubmit={submit}
        className="flex flex-col gap-3"
        aria-label="Change admin PIN"
      >
        <label className="flex flex-col gap-1 font-sans text-[14px] text-[#333333]">
          New PIN
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="min-h-[44px] max-w-[240px] rounded-[8px] border border-[#e0e0e0] bg-[#ffffff] px-3 py-2 font-sans text-[17px] text-[#1d1d1f]"
          />
        </label>
        <label className="flex flex-col gap-1 font-sans text-[14px] text-[#333333]">
          Confirm PIN
          <Input
            ref={confirmRef}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="min-h-[44px] max-w-[240px] rounded-[8px] border border-[#e0e0e0] bg-[#ffffff] px-3 py-2 font-sans text-[17px] text-[#1d1d1f]"
          />
        </label>
        {error ? (
          <p className="font-sans text-[14px] leading-relaxed text-[#666666]">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="font-sans text-[14px] leading-relaxed text-[#0066cc]">
            {success}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white transition active:scale-95 hover:bg-[#0071e3] disabled:opacity-50"
        >
          Save PIN
        </button>
      </form>
    </section>
  );
}
