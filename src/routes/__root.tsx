import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { Settings } from "lucide-react"

import { StudentProvider, useStudent } from "@/lib/student-context"
import { ProfilePicker } from "@/components/ProfilePicker"

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
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
        Not found
      </h1>
      <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
        That page doesn’t exist.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-[44px] w-fit items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white hover:bg-[#0071e3]"
      >
        Back to subjects
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

function RootShell() {
  const { status, student, isGuest, returnToPicker } = useStudent()

  // Loading: a calm, minimal state (no spinner chrome that would violate
  // DESIGN.md — a quiet muted line is fine).
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
          Loading…
        </p>
      </div>
    )
  }

  // The gate: no subject routes resolve until a student or Guest is chosen.
  if (status === "needs-pick") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center gap-4 border-b border-hairline px-6 py-3">
          <span
            className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]"
            style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
          >
            CBCLab
          </span>
        </header>
        <main className="mx-auto max-w-[980px] px-6 py-10">
          <ProfilePicker />
        </main>
      </div>
    )
  }

  // status === "ready" — render the app shell with the header indicator.
  const indicator =
    isGuest || student === null ? "Guest" : student.display_name

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-4 border-b border-hairline px-6 py-3">
        <Link
          to="/"
          className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]"
          // ≥44px touch target
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        >
          CBCLab
        </Link>
        {/* Current student + "switch user" — subtle, right-aligned. */}
        <div className="ml-auto flex items-center gap-4">
          <Link
            to="/dashboard"
            className="inline-flex min-h-[44px] items-center text-[14px] text-[#333333] hover:text-[#0066cc]"
          >
            Dashboard
          </Link>
          {/* Admin entry — a deliberately subtle gear link, NOT a labelled
              pill CTA. The PIN is the real gate (PinGate on /settings); this
              just has to be findable by a teacher who knows it's there and not
              advertised to a wandering student. ≥44px touch target, but muted
              #666666 12px text + a small icon — matches W6's TeacherEntry
              subtlety principle. */}
          <Link
            to="/settings"
            aria-label="Admin settings"
            title="Admin settings"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[#666666] hover:text-[#0066cc]"
          >
            <Settings size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => {
              void returnToPicker()
            }}
            className="inline-flex min-h-[44px] items-center gap-1 text-[14px] text-[#333333] hover:text-[#1d1d1f]"
            aria-label={`Signed in as ${indicator}. Switch user.`}
            title="Switch user"
          >
            <span className="max-w-[160px] truncate">{indicator}</span>
            <span aria-hidden className="text-[#666666]">
              ⌄
            </span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[980px] px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
