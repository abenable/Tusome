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
import { ArrowLeft, GraduationCap } from "lucide-react";

import { PinGate } from "@/components/PinGate";
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
          className="inline-flex min-h-[44px] w-fit items-center gap-1.5 font-sans text-[16px] font-semibold text-ink-3 transition hover:text-brand"
        >
          <ArrowLeft size={16} aria-hidden />
          Back
        </Link>
        <Link to="/" className="flex items-center gap-[10px]" title="CBCLab">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand text-white">
            <GraduationCap size={18} aria-hidden />
          </span>
          <span className="font-heading text-[20px] font-extrabold tracking-tight text-ink">
            CBCLab
          </span>
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
