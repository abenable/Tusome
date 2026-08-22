import { useState } from "react"
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import {
  Atom,
  ChevronLeft,
  ChevronRight,
  Dna,
  FlaskConical,
  Settings,
  Sigma,
  type LucideIcon,
} from "lucide-react"

import { StudentProvider, useStudent } from "@/lib/student-context"
import { ProfilePicker } from "@/components/ProfilePicker"
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_LABELS,
  type Subject,
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

// Subject icons. The design pulls these from unpkg.com/lucide-static as <img>
// tags, which can never load here — the app ships offline and the CSP is
// `default-src 'self'`. lucide-react is already a dependency and ships the
// identical glyphs as components, so this costs nothing and works offline.
const SUBJECT_ICONS: Record<Subject, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  mathematics: Sigma,
}

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-tight text-ink">
        Not found
      </h1>
      <p className="font-sans text-[17px] leading-relaxed text-ink-3">
        That page doesn’t exist.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-[44px] w-fit items-center rounded-full bg-brand px-6 text-[17px] font-bold text-white hover:bg-brand-hover"
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

/** The small dot the non-subject rows use (Home, Dashboard). */
function Dot() {
  return (
    <span
      aria-hidden
      className="size-[7px] shrink-0 rounded-full border-[1.5px] border-current"
    />
  )
}

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
  const rowBase =
    "flex min-h-[44px] items-center gap-3 rounded-xl px-3 font-sans text-[15px] font-semibold text-side-text transition-colors hover:bg-white/5 hover:text-white"
  const align = collapsed ? "justify-center" : "justify-start"
  const activeRow = {
    className: "bg-white/10 text-white",
    "aria-current": "page" as const,
  }

  return (
    <aside
      className={`sticky top-0 flex max-h-screen shrink-0 flex-col self-start overflow-y-auto bg-side px-4 py-7 transition-[width] duration-200 ${
        collapsed ? "w-[84px]" : "w-[264px]"
      }`}
      style={{ minHeight: "100vh" }}
    >
      {/* Wordmark */}
      <Link
        to="/"
        className="mb-7 flex items-center gap-[10px] px-[6px]"
        title={collapsed ? "CBCLab" : undefined}
      >
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand font-heading text-[14px] font-extrabold text-white">
          CB
        </span>
        {!collapsed && (
          <span className="whitespace-nowrap font-heading text-[18px] font-extrabold tracking-tight text-white">
            CBCLab
          </span>
        )}
      </Link>

      {/* Collapse toggle. Positioned on the sidebar's right edge exactly as
          designed, but as a real <button> with aria-expanded so it is
          keyboard-reachable and announced — the mock has no accessible state. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute right-[-13px] top-8 z-10 flex size-[26px] items-center justify-center rounded-full border border-white/20 bg-side text-white/80 shadow-[0_2px_6px_rgba(0,0,0,.3)] hover:text-white"
      >
        {collapsed ? (
          <ChevronRight size={14} aria-hidden />
        ) : (
          <ChevronLeft size={14} aria-hidden />
        )}
      </button>

      <nav aria-label="Main" className="mb-7 flex flex-col gap-[2px]">
        <Link
          to="/"
          title={collapsed ? "Home" : undefined}
          className={`${rowBase} ${align}`}
          activeProps={activeRow}
          activeOptions={{ exact: true }}
        >
          <Dot />
          {!collapsed && <span className="whitespace-nowrap">Home</span>}
        </Link>
        <Link
          to="/dashboard"
          title={collapsed ? "Dashboard" : undefined}
          className={`${rowBase} ${align}`}
          activeProps={activeRow}
        >
          <Dot />
          {!collapsed && <span className="whitespace-nowrap">Dashboard</span>}
        </Link>
      </nav>

      {!collapsed && (
        <div className="mb-2 px-3 font-sans text-[11px] font-bold uppercase tracking-[.09em] text-white/35">
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
              className={`${rowBase} ${align} px-[10px]`}
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

      {/* Admin stays deliberately understated — the PIN on /settings is the
          real gate; this only has to be findable by a teacher who knows it is
          there. Same principle as the header gear it replaces. */}
      <Link
        to="/settings"
        title={collapsed ? "Admin" : undefined}
        className={`mb-[14px] flex min-h-[40px] items-center gap-3 rounded-xl px-3 font-sans text-[14px] font-semibold text-side-text transition-colors hover:bg-white/5 hover:text-white ${align}`}
        activeProps={activeRow}
      >
        <Settings size={14} aria-hidden className="shrink-0" />
        {!collapsed && <span className="whitespace-nowrap">Admin</span>}
      </Link>

      {/* Profile tile — the design's bottom card, doubling as the switch-user
          control the old header carried. */}
      <button
        type="button"
        onClick={onSwitchUser}
        aria-label={`Signed in as ${indicator}. Switch profile.`}
        title={collapsed ? `${indicator} — switch profile` : "Switch profile"}
        className={`flex items-center gap-[10px] rounded-2xl bg-white/[.06] p-2 text-left transition-colors hover:bg-white/10 ${align}`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-[13px] font-bold text-white">
          {indicator.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-sans text-[13px] font-bold text-white">
              {indicator}
            </span>
            <span className="whitespace-nowrap font-sans text-[11px] text-white/50">
              Switch profile
            </span>
          </span>
        )}
      </button>
    </aside>
  )
}

function RootShell() {
  const { status, student, isGuest, returnToPicker } = useStudent()
  // ponytail: collapse is per-session. Persisting it costs a getSetting
  // round-trip before first paint; if a teacher on a 1024x768 machine asks for
  // it to be remembered, store `sidebar_collapsed` with the existing
  // getSetting/setSetting helpers.
  const [collapsed, setCollapsed] = useState(false)

  // Loading: a calm, minimal state (no spinner chrome — a quiet muted line).
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="font-sans text-[17px] leading-relaxed text-ink-3">
          Loading…
        </p>
      </div>
    )
  }

  // The gate: no subject routes resolve until a student or Guest is chosen.
  // No sidebar here — there is nothing to navigate to yet.
  if (status === "needs-pick") {
    return (
      <div className="min-h-screen bg-canvas font-sans text-ink">
        <header className="flex items-center gap-[10px] px-6 py-4">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand font-heading text-[14px] font-extrabold text-white">
            CB
          </span>
          <span className="font-heading text-[18px] font-extrabold tracking-tight text-ink">
            CBCLab
          </span>
        </header>
        <main className="mx-auto max-w-[980px] px-6 py-10">
          <ProfilePicker />
        </main>
      </div>
    )
  }

  // status === "ready" — the app shell.
  const indicator = isGuest || student === null ? "Guest" : student.display_name

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
