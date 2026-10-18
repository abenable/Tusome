// Two small sidebar controls: text size, and "Restart to update" when an app
// update has downloaded in the background (src-tauri/src/updates.rs,
// background_app_update).

import { useEffect, useState } from "react"
import { ArrowUpCircle, Type } from "lucide-react"

import { getSetting, setSetting } from "@/db/index"
import { installStagedAppUpdate, stagedAppUpdateVersion } from "@/lib/updates"

const SIZES = [1, 1.15, 1.3] as const

async function applyZoom(z: number) {
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview")
    await getCurrentWebview().setZoom(z)
  } catch {
    // Outside Tauri: leave the browser's own zoom alone.
  }
}

/** Restore this PC's text size on launch. */
export async function restoreTextSize(): Promise<void> {
  const z = Number(await getSetting("display_zoom").catch(() => null))
  if (SIZES.includes(z as (typeof SIZES)[number]) && z !== 1) await applyZoom(z)
}

const ROW =
  "flex min-h-[44px] items-center gap-3 rounded-xl px-[10px] font-sans text-[15px] font-semibold text-side-text transition-colors hover:bg-white/5 hover:text-white"

export function TextSizeButton({ collapsed }: { collapsed: boolean }) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    void getSetting("display_zoom")
      .then((v) => {
        const z = Number(v)
        if (SIZES.includes(z as (typeof SIZES)[number])) setZoom(z)
      })
      .catch(() => {})
  }, [])

  async function next() {
    const z = SIZES[(SIZES.indexOf(zoom as (typeof SIZES)[number]) + 1) % SIZES.length]
    setZoom(z)
    await applyZoom(z)
    await setSetting("display_zoom", String(z)).catch(() => {})
  }

  const label = `Text size ${Math.round(zoom * 100)}%`
  return (
    <button
      type="button"
      onClick={() => void next()}
      title={collapsed ? label : "Make text bigger or smaller"}
      aria-label={`${label}. Change text size.`}
      className={`${ROW} ${collapsed ? "justify-center" : ""}`}
    >
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Type size={15} className="text-white" aria-hidden />
      </span>
      {!collapsed && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}

export function UpdateNotice({ collapsed }: { collapsed: boolean }) {
  const [version, setVersion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void stagedAppUpdateVersion().then(setVersion).catch(() => {})
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen<string>("app-update-staged", (e) => setVersion(e.payload)))
      .then((u) => (unlisten = u))
      .catch(() => {})
    return () => unlisten?.()
  }, [])

  if (!version) return null

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void installStagedAppUpdate().catch(() => setBusy(false))
      }}
      title={collapsed ? `Restart to update to Tusome ${version}` : undefined}
      className={`mb-2 flex items-center gap-3 rounded-tile bg-sun p-2.5 text-left text-ink transition hover:bg-sun-hover active:scale-[0.98] disabled:opacity-60 ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <ArrowUpCircle size={20} aria-hidden className="shrink-0" />
      {!collapsed && (
        <span className="flex flex-col">
          <span className="font-sans text-[15px] font-bold">{busy ? "Updating…" : "Restart to update"}</span>
          <span className="font-sans text-[13px]">Tusome {version} is ready</span>
        </span>
      )}
    </button>
  )
}
