import { useEffect, useState } from "react"

// PhET HTML5 sim host. A PhET sim is a single self-contained HTML file (all
// JS inlined, images as data URIs — see scripts/fetch-phet-sims.sh). We resolve
// its path via the Rust `resolve_content_path` command (app-data → bundled →
// dev repo-root, same fallback order as the content loader) and hand the
// resulting URL to an <iframe> through Tauri's asset protocol
// (`convertFileSrc`). The sim runs in its own browsing context — the parent
// page's CSP does not govern it; only `frame-src`/`child-src` controls loading.
//
// Why an iframe and not inline DOM: PhET's compiled HTML is a complete
// document with its own scripts/styles. Re-hosting it as a fragment would
// require parsing + re-injecting ~3 MB of script; an iframe is the supported,
// isolated way to run a third-party document. It also keeps a misbehaving sim
// from polluting the app's DOM.
//
// License: CC BY 4.0 (PhET). Partnership license pending (docs/plan/07, P3).
// Prototype use only.

const TAURI =
  typeof globalThis !== "undefined" &&
  "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)

type State =
  | { kind: "loading" }
  | { kind: "ready"; src: string }
  | { kind: "missing" }
  | { kind: "non-tauri" }

export function PhETSim({ file }: { file: string }) {
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ kind: "loading" })
    // Dev (Vite, incl. `bun tauri dev`): serve the bundled HTML from the
    // repo's content/sims/ via the same-origin `/__sim/<file>` middleware in
    // vite.config.ts. Same-origin → CSP `frame-src 'self'` covers it.
    if (import.meta.env.DEV) {
      setState({ kind: "ready", src: `/__sim/${encodeURIComponent(file)}` })
      return
    }
    // Prod (built app): resolve the file under the content dir and serve it
    // to the iframe through Tauri's asset protocol.
    if (!TAURI) {
      setState({ kind: "non-tauri" })
      return
    }
    void (async () => {
      try {
        const { invoke, convertFileSrc } = await import("@tauri-apps/api/core")
        const rel = `sims/${file}`
        const abs = await invoke<string | null>("resolve_content_path", { rel })
        if (cancelled) return
        if (!abs) {
          setState({ kind: "missing" })
          return
        }
        setState({ kind: "ready", src: convertFileSrc(abs) })
      } catch (err) {
        // A rejected invoke used to leave "Loading simulation…" up forever.
        console.error("[PhETSim] resolve_content_path failed:", err)
        if (!cancelled) setState({ kind: "missing" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  if (state.kind === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-[420px] animate-pulse items-center justify-center rounded-card border border-line bg-surface font-sans text-[17px] text-ink-3"
      >
        Loading simulation…
      </div>
    )
  }
  if (state.kind === "non-tauri") {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-card border border-dashed border-line bg-surface px-6 text-center font-sans text-[17px] text-ink-3">
        This simulation runs inside the Tusome app.
      </div>
    )
  }
  if (state.kind === "missing") {
    return (
      <div
        role="alert"
        className="flex min-h-[420px] flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line bg-surface px-6 text-center font-sans"
      >
        <p className="text-[18px] font-bold text-ink">
          This simulation isn’t installed on this computer.
        </p>
        <p className="text-[16px] text-ink-3">
          Ask your teacher to update Tusome’s content.
        </p>
      </div>
    )
  }
  return (
    <iframe
      title="PhET simulation"
      src={state.src}
      className="h-[70vh] min-h-[420px] w-full rounded-card border border-line bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
    />
  )
}
