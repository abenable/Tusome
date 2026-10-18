// Online + USB update orchestration for the admin screen (doc 07, work unit U2).
//
// The Rust side (`tauri-shell` U1) owns the real work: scanning removable
// drives, verifying signatures, copying packs, talking to
// `tauri-plugin-updater`, and writing the audit log to SQLite. This module is
// the thin JS glue the `<UpdatesSection>` calls — it decides *whether* to
// attempt a network fetch (the "Wi-Fi only" gate), invokes the Rust commands,
// and never throws: per doc 07 "An update problem must never be a reason a
// lesson can't happen." Every failure path resolves to a list of
// `UpdateLogEvent`s that the caller appends to the audit log.
//
// State ownership (03-architecture.md): content packs are server-ish state in
// TanStack Query with `staleTime: Infinity`. After a successful content apply
// we invalidate `PACKS_QUERY_KEY` by hand so topics reload WITHOUT a restart
// (doc 07 §USB step 6 + §Online "Content updates apply in the background
// immediately"). The app-binary check stages but never relaunches — doc 07
// "defer `relaunch()` to app idle or next launch — never interrupt a running
// lesson."

import type { QueryClient } from "@tanstack/react-query";

import { PACKS_QUERY_KEY } from "@/content/loader";

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the Rust `#[serde(rename_all = "camelCase")]` shapes.
// ──────────────────────────────────────────────────────────────────────────

export type UpdateChannel = "usb" | "content-online" | "app-online";
export type UpdateKind = "scan" | "sig-verify" | "copy" | "check" | "apply";
export type UpdateOutcome = "ok" | "fail" | "skipped";

export interface UpdateLogEvent {
  channel: UpdateChannel;
  kind: UpdateKind;
  outcome: UpdateOutcome;
  detail: string;
}

export interface UpdateLogRow {
  id: number;
  ts: string;
  channel: UpdateChannel;
  kind: UpdateKind;
  outcome: UpdateOutcome;
  detail: string;
}

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  events: UpdateLogEvent[];
}

export interface AppUpdateResult {
  staged: boolean;
  currentVersion: string;
  targetVersion: string | null;
  events: UpdateLogEvent[];
}

// ──────────────────────────────────────────────────────────────────────────
// Tauri detection — same shape as the content loader's guard.
// ──────────────────────────────────────────────────────────────────────────

function isTauri(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}

/** Best-effort string from an unknown thrown value. */
function msg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// "Wi-Fi only" gate — PURE decision.
// ──────────────────────────────────────────────────────────────────────────
//
// `@tauri-apps/plugin-os` does NOT expose the connection type (metered vs
// unmetered). Per doc 07's explicit fallback ("if connection type can't be
// determined reliably, default to not downloading and say so in the log"):
// when `wifiOnly` is on, we never download — we skip and emit one log event
// whose `detail` says exactly why. When `wifiOnly` is off, the admin has
// accepted that any connection (including a hotspot) may be used, so we
// proceed.
export function shouldDownloadOverNetwork(wifiOnly: boolean): {
  download: boolean;
  reason: string;
} {
  if (wifiOnly) {
    return {
      download: false,
      reason:
        "Wi-Fi-only set; connection type undetectable; skipped download.",
    };
  }
  return { download: true, reason: "" };
}

// ──────────────────────────────────────────────────────────────────────────
// Online content update — Rust downloads, verifies and applies the bundle.
// ──────────────────────────────────────────────────────────────────────────
//
// The download happens in Rust (`download_and_apply_online_content`), not here:
// a webview fetch of a GitHub release asset is blocked by CORS, and it keeps
// the CSP free of remote origins. The bundle URL lives in updates.rs.
//
// Never throws. Never retries on failure (doc 07 "no retry storm"). On a
// successful apply, invalidates `PACKS_QUERY_KEY` so topics reload WITHOUT a
// restart. The `queryClient` is passed in (rather than read via a hook) so this
// stays a plain async function callable from the admin handler and from tests
// with a mock client.

export async function checkOnlineContentUpdate(opts: {
  queryClient: QueryClient;
  enabled: boolean;
  wifiOnly: boolean;
}): Promise<UpdateLogEvent[]> {
  // Off by default — no fetch, no invoke, no log. Avoids a retry storm on every
  // admin visit when the toggle is off (doc 07 "Fail silently. No connection
  // means no message, no retry storm").
  if (!opts.enabled) return [];

  const { download, reason } = shouldDownloadOverNetwork(opts.wifiOnly);
  if (!download) {
    return [
      {
        channel: "content-online",
        kind: "check",
        outcome: "skipped",
        detail: reason,
      },
    ];
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<ApplyResult>("download_and_apply_online_content");
    if (r.applied.length === 0) return r.events;
    // New topics appear without a restart (doc 07). Invalidate by hand — the
    // packs query is `staleTime: Infinity`, so it would otherwise keep serving
    // the pre-apply pack list.
    void opts.queryClient.invalidateQueries({ queryKey: PACKS_QUERY_KEY });
    // Rust reports per-step events but no overall success event — success is
    // a non-empty `applied`. Record it, so the log (and the admin's status
    // line) can say content actually arrived.
    return [
      ...r.events,
      {
        channel: "content-online",
        kind: "apply",
        outcome: "ok",
        detail: `applied ${r.applied.length} pack(s): ${r.applied.join(", ")}`,
      },
    ];
  } catch (err) {
    return [
      {
        channel: "content-online",
        kind: "check",
        outcome: "fail",
        detail: "online content check failed: " + msg(err),
      },
    ];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Online app-binary update — tauri-plugin-updater via the Rust command.
// ──────────────────────────────────────────────────────────────────────────
//
// The Rust side runs `check()` + `download()` only: the verified update waits in
// memory until a teacher presses "Restart and install" (installStagedAppUpdate
// below). Nothing here installs or relaunches — doc 07 "never interrupt a
// running lesson" (on Windows, installing quits the app). Never throws.

export async function checkOnlineAppUpdate(opts: {
  enabled: boolean;
  wifiOnly: boolean;
}): Promise<UpdateLogEvent[]> {
  if (!opts.enabled) return [];

  const { download, reason } = shouldDownloadOverNetwork(opts.wifiOnly);
  if (!download) {
    return [
      {
        channel: "app-online",
        kind: "check",
        outcome: "skipped",
        detail: reason,
      },
    ];
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<AppUpdateResult>("check_and_stage_app_update");
    // The Rust command already emits the outcome event on every path
    // ("no update available", "staged; …", or the failure). Don't synthesise
    // another: `staged: false` also covers a failed check/download, which an
    // "ok / no update available" line would contradict.
    return r.events;
  } catch (err) {
    return [
      {
        channel: "app-online",
        kind: "check",
        outcome: "fail",
        detail: "no network / check failed: " + msg(err),
      },
    ];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Audit log — thin invoke wrappers, guarded so tests run outside Tauri.
// ──────────────────────────────────────────────────────────────────────────

/** Version of a downloaded update waiting for "Restart and install", if any. */
export async function stagedAppUpdateVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("staged_app_update_version");
}

/**
 * Install the downloaded update and restart into it. Only ever called from the
 * admin "Restart and install" button: on Windows the installer closes the app
 * the moment this runs. Rejects if nothing is staged or the install fails.
 */
export async function installStagedAppUpdate(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("install_staged_app_update");
}

export async function appendUpdateLog(events: UpdateLogEvent[]): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("append_update_log", { events });
}

export async function getUpdateLog(limit = 200): Promise<UpdateLogRow[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateLogRow[]>("get_update_log", { limit });
}
