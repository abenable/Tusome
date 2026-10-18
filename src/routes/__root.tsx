import { useState } from "react"
import { createRootRouteWithContext, Link, Outlet, useRouterState } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Home, LayoutDashboard } from "lucide-react"

import { StudentProvider, useStudent } from "@/lib/student-context"
import { ProfilePicker } from "@/components/ProfilePicker"
import { BrandMark } from "@/components/BrandMark"
import { TextSizeButton, UpdateNotice } from "@/components/SidebarTools"
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_ICONS,
  SUBJECT_LABELS,
} from "@/lib/subjects"

// The router context — the single thing every route loader receives. It
// holds the QueryClient so content packs are walked once and cached (see
// src/content/loader.ts `loadPacksCached`) instead of re-walking the
// filesystem on every navigation. `createRootRouteWithContext` propagates this
// type to every child route's `loader({ context })` / `Route.useRouteContext()`.
interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex max-w-[560px] flex-col items-start gap-4 pt-8">
      <h1 className="font-heading text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
        We couldn’t find that page
      </h1>
      <p className="font-sans text-[19px] leading-relaxed text-ink-2">
        It may have moved, or the topic isn’t installed on this computer.
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-[48px] items-center rounded-full bg-brand px-6 font-sans text-[18px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98]"
      >
        Back to home
      </Link>
    </div>
  )
}

function RootComponent() {
  // <StudentProvider> is mounted high so every route can read the current
  // student. The picker is a gate: until a student (or Guest) is chosen, no
  // subject routes render.
  return (
    <StudentProvider>
      <RootShell />
    </StudentProvider>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────
//
// `collapsed` drives the same three things on every row: the label is dropped,
// the row centres its icon, and `title` becomes the only affordance left — so
// it is set exactly when the label is not rendered.

function Sidebar({
  collapsed,
  onToggle,
  indicator,
  onSwitchUser,
}: {
  collapsed: boolean
  onToggle: () => void
  indicator: string
  onSwitchUser: () => void
}) {
  // The active row gets a sun bar on its leading edge as well as the lighter
  // fill, so "where am I" survives a washed-out projector.
  const rowBase =
    "relative flex min-h-[44px] items-center gap-3 rounded-xl px-[10px] font-sans text-[17px] font-semibold text-side-text transition-colors hover:bg-white/5 hover:text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sun before:opacity-0 data-[status=active]:before:opacity-100"
  const align = collapsed ? "justify-center" : "justify-start"
  const activeRow = {
    className: "bg-white/10 text-white",
    "aria-current": "page" as const,
  }

  return (
    <div className="relative flex shrink-0">
      <aside
        className={`sticky top-0 flex max-h-screen flex-col self-start overflow-y-auto bg-side px-4 py-7 transition-[width] duration-200 ${
          collapsed ? "w-[84px]" : "w-[264px]"
        }`}
        style={{ minHeight: "100vh" }}
      >
        <Link
          to="/"
          className={`mb-7 flex rounded-xl px-[6px] ${align}`}
          title={collapsed ? "Tusome" : undefined}
          aria-label="Tusome home"
        >
          <BrandMark wordmark={!collapsed} tone="light" />
        </Link>

        <nav aria-label="Main" className="mb-7 flex flex-col gap-[2px]">
          <Link
            to="/"
            title={collapsed ? "Home" : undefined}
            className={`${rowBase} ${align}`}
            activeProps={activeRow}
            activeOptions={{ exact: true }}
          >
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Home size={15} className="text-white" aria-hidden />
            </span>
            {!collapsed && <span className="whitespace-nowrap">Home</span>}
          </Link>
          <Link
            to="/dashboard"
            title={collapsed ? "Dashboard" : undefined}
            className={`${rowBase} ${align}`}
            activeProps={activeRow}
          >
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white/10">
              <LayoutDashboard size={15} className="text-white" aria-hidden />
            </span>
            {!collapsed && <span className="whitespace-nowrap">Dashboard</span>}
          </Link>
        </nav>

        {!collapsed && (
          <div className="mb-2 px-3 font-sans text-[13px] font-bold uppercase tracking-[.09em] text-white/45">
            Subjects
          </div>
        )}
        <nav aria-label="Subjects" className="mb-auto flex flex-col gap-[2px]">
          {SUBJECTS.map((subject) => {
            const Icon = SUBJECT_ICONS[subject]
            return (
              <Link
                key={subject}
                to="/$subject"
                params={{ subject }}
                title={collapsed ? SUBJECT_LABELS[subject] : undefined}
                className={`${rowBase} ${align}`}
                activeProps={activeRow}
              >
                <span
                  className={`flex size-[26px] shrink-0 items-center justify-center rounded-lg ${SUBJECT_ACCENTS[subject].bg}`}
                >
                  <Icon size={14} className="text-white" aria-hidden />
                </span>
                {!collapsed && (
                  <span className="whitespace-nowrap">
                    {SUBJECT_LABELS[subject]}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="mx-[6px] my-[18px] h-px bg-white/10" />

        <UpdateNotice collapsed={collapsed} />
        <div className="mb-2">
          <TextSizeButton collapsed={collapsed} />
        </div>

        {/* Profile tile — the design's bottom card, doubling as the switch-user
            control the old header carried. */}
        <button
          type="button"
          onClick={onSwitchUser}
          aria-label={`Signed in as ${indicator}. Switch profile.`}
          title={collapsed ? `Switch profile (signed in as ${indicator})` : "Switch profile"}
          className={`flex items-center gap-[10px] rounded-tile bg-white/[.06] p-2 text-left transition-colors hover:bg-white/10 ${align}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun font-heading text-[15px] font-bold text-ink">
            {indicator.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-sans text-[15px] font-bold text-white">
                {indicator}
              </span>
              <span className="whitespace-nowrap font-sans text-[13px] text-white/60">
                Switch profile
              </span>
            </span>
          )}
        </button>
      </aside>

      {/* Collapse toggle — straddles the sidebar's right edge. Lives outside
          the aside's overflow context so the overhang is never clipped. 44px
          touch target (DESIGN.md a11y); flat chrome, no shadow (DESIGN.md). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-6 right-0 z-20 flex size-[44px] translate-x-1/2 items-center justify-center rounded-full border border-white/12 bg-side text-white/70 transition-colors hover:bg-side hover:text-sun"
      >
        {collapsed ? (
          <ChevronRight size={18} aria-hidden />
        ) : (
          <ChevronLeft size={18} aria-hidden />
        )}
      </button>
    </div>
  )
}

function RootShell() {
  const { status, dbError, student, isGuest, returnToPicker } = useStudent()
  // The pathname is read so the needs-pick gate can let /settings render through
  // the Outlet (a teacher reaches Admin from the picker, e.g. on a fresh install
  // to set the PIN). Called unconditionally — hooks can't sit behind the status
  // branches below.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // ponytail: collapse is per-session, starting collapsed on narrow windows
  // (1024x768 school machines) so content isn't squeezed. Persisting it costs a
  // getSetting round-trip before first paint; if a teacher asks for it to be
  // remembered, store `sidebar_collapsed` with the existing helpers.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100)

  // Loading: the mark and a quiet line, no spinner chrome.
  if (status === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas"
        role="status"
      >
        <span className="animate-pulse">
          <BrandMark size={56} wordmark={false} />
        </span>
        <p className="font-sans text-[17px] text-ink-3">Loading…</p>
      </div>
    )
  }

  if (status === "db-error") {
    // A lab computer whose server is off gets its own explanation and a way
    // to carry on alone (the lab's records stay safe on the server).
    const labDown = dbError?.includes("lab server") ?? false
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div role="alert" className="flex max-w-[520px] flex-col items-start gap-4">
          <BrandMark />
          <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            {labDown
              ? "Tusome can’t reach the lab server"
              : "Tusome couldn’t open its student records"}
          </h1>
          <p className="font-sans text-[18px] leading-relaxed text-ink-2">
            {labDown
              ? "Check that the lab server computer is switched on and Tusome is open on it, then try again."
              : "Try again. If it keeps happening, restart the computer, and if that doesn’t help, call support and read them the message below."}
          </p>
          {dbError ? (
            <code className="max-w-full overflow-x-auto rounded-tile border border-line bg-surface px-3 py-2 font-mono text-[14px] text-ink-2">
              {dbError}
            </code>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-6 font-sans text-[18px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98]"
          >
            Try again
          </button>
          {labDown ? (
            <button
              type="button"
              onClick={() => void switchToStandalone()}
              className="inline-flex min-h-[48px] items-center rounded-full border border-line bg-surface px-6 font-sans text-[17px] font-bold text-ink transition hover:bg-canvas"
            >
              Use this computer on its own
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  // The gate: no subject routes resolve until a student or Guest is chosen.
  // No sidebar here — there is nothing to navigate to yet. The one exception is
  // the admin section (any /settings/* route), which a teacher must reach from
  // the picker (e.g. on a fresh install to set the admin PIN). It renders
  // through the Outlet in the same minimal chrome; every other route stays
  // behind the picker.
  if (status === "needs-pick") {
    const onSettings = pathname === "/settings" || pathname.startsWith("/settings/")
    // Settings renders its own topbar (Back + centered brand mark), so skip
    // this header there to avoid a second logo stacked above it.
    return (
      <div className="min-h-screen bg-canvas font-sans text-ink">
        {onSettings ? null : (
          <header className="flex items-center px-6 py-5">
            <Link to="/" className="rounded-xl" aria-label="Tusome home">
              <BrandMark />
            </Link>
          </header>
        )}
        <main className="mx-auto max-w-[980px] px-6 py-10">
          {onSettings ? <Outlet /> : <ProfilePicker />}
        </main>
      </div>
    )
  }

  // status === "ready" — the app shell.
  const indicator = isGuest || student === null ? "Guest" : student.display_name

  // Admin keeps its own minimal chrome (topbar in settings.tsx) even when a
  // student is already picked — the student Sidebar has nothing to do with
  // the admin section and would just add width/height around it.
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/")
  if (onSettings) {
    return (
      <div className="min-h-screen bg-canvas font-sans text-ink">
        <main className="mx-auto max-w-[980px] px-6 py-10">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-ink">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        indicator={indicator}
        onSwitchUser={() => {
          void returnToPicker()
        }}
      />
      <main className="mx-auto min-w-0 max-w-[1080px] flex-1 px-8 pb-20 pt-12 lg:px-16">
        <Outlet />
      </main>
    </div>
  )
}

async function switchToStandalone() {
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("save_lab_config", { config: { mode: "standalone", code: "", server: "" } })
  const { relaunch } = await import("@tauri-apps/plugin-process")
  await relaunch()
}
