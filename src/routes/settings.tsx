// Admin layout route — `/settings`. The parent of the multi-page admin surface.
//
// This used to be a single leaf route rendering <AdminPanel>; it is now a
// layout that wraps its <Outlet/> in a single <PinGate> so every child admin
// page (Overview, Students, Subjects, System) inherits the gate. A single
// topbar (Back far left, brand mark centered) is always visible so the locked
// PIN state isn't a bare form; the AdminNav + page content render only once
// unlocked.
//
// Each child route loads its own data via the shared TanStack Query cache, so
// this layout carries no loader — it is just chrome + gate.

import { type JSX } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PinGate } from "@/components/PinGate";
import { BrandMark } from "@/components/BrandMark";
import { AdminNav } from "@/components/admin/AdminNav";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

function SettingsLayout(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {/* Topbar: Back pinned far left, brand mark truly centered on the bar
          (a 1fr/auto/1fr grid, not flex space-between, so the logo stays
          centered regardless of the Back button's width). */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <Link
          to="/"
          className="-ml-1 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-full px-1 font-sans text-[16px] font-bold text-ink-2 transition hover:text-ink"
        >
          <ArrowLeft size={18} aria-hidden />
          Back
        </Link>
        <Link to="/" className="rounded-xl" aria-label="Tusome home">
          <BrandMark />
        </Link>
        <span aria-hidden />
      </div>

      {/* PinGate renders its own PIN form while locked (it never calls the
          children until unlocked), so the nav + page content below appear only
          after the gate opens. */}
      <PinGate aria-label="Admin">
        {() => (
          <div className="flex flex-col gap-6">
            <AdminNav />
            <Outlet />
          </div>
        )}
      </PinGate>
    </div>
  );
}
