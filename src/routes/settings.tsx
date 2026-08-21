// Admin settings route — `/settings`. PIN-gated (W7).
//
// The route's loader reads packs + the loader's skipped/invalid list once via
// the shared TanStack Query cache (`loadPacksWithErrors`), so the AdminPanel
// can surface both the installed packs and any packs that failed validation
// — never as a student-facing modal. The component wraps everything in
// <PinGate> (reused from W2 — no new gate); PinGate shows its own PIN form
// while locked and renders the children once unlocked.
//
// Entry to this route is deliberately unobtrusive: a small muted gear link in
// the header (see src/routes/__root.tsx). The PIN is the real gate; the entry
// just shouldn't be a big CTA a bored student finds in a minute.

import { useEffect, type JSX } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { loadPacksWithErrors } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { PinGate } from "@/components/PinGate";
import { AdminPanel, setExportPacks } from "@/components/AdminPanel";

export const Route = createFileRoute("/settings")({
  loader: async ({
    context,
  }): Promise<{
    packs: PackT[];
    errors: Array<{ path: string; error: string }>;
  }> => {
    return loadPacksWithErrors(context.queryClient);
  },
  component: SettingsPage,
});

function SettingsPage(): JSX.Element {
  const { packs, errors } = Route.useLoaderData();

  // Hand the loaded packs to the AdminPanel's export handler (module slot, see
  // AdminPanel.setExportPacks). Re-applied whenever the loader data changes.
  useEffect(() => {
    setExportPacks(packs);
  }, [packs]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/"
        className="inline-flex min-h-[44px] w-fit items-center rounded-[8px] px-1 font-sans text-[14px] text-[#0066cc] hover:underline"
      >
        Back to subjects
      </Link>
      <PinGate aria-label="Admin">
        {(unlocked) =>
          unlocked ? (
            <AdminPanel packs={packs} errors={errors} />
          ) : (
            // PinGate renders its own PIN form; we add just a heading so the
            // locked state is clearly the admin screen, not a blank page.
            <header className="flex flex-col gap-2">
              <h1 className="font-heading text-[40px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
                Admin
              </h1>
              <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
                Enter the admin PIN to continue.
              </p>
            </header>
          )
        }
      </PinGate>
    </div>
  );
}
