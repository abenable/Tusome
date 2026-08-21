import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"

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
      <p className="font-sans text-[17px] leading-relaxed text-[#7a7a7a]">
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
      </header>
      <main className="mx-auto max-w-[980px] px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
