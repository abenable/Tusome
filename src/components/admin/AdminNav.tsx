// AdminNav — the in-section navbar for the multi-page admin surface. A
// horizontal row of pill links, one per admin page, with the active page as a
// filled brand pill and the rest as muted text pills. URL-driven (TanStack
// <Link>) rather than in-page tabs so each admin page is a real route:
// shareable, back-button friendly, and individually loadable.
//
// DESIGN.md: single Action Blue for the active/interactive state, pill grammar,
// Manrope, ≥44px touch targets. Sticky within the admin content column so it
// stays reachable while scrolling long tables.

import { Link, type LinkProps } from "@tanstack/react-router";

type Item = {
  to: LinkProps["to"];
  label: string;
  /** Exact match for the active state — used for the index route so e.g.
   *  /settings/students doesn't also light up "Overview". */
  exact?: boolean;
};

// Classes lives inside Students, Content inside Subjects, and Updates inside
// System — each folded into its parent page as a section rather than a
// separate top-level route (see the merge notes atop those three files).
const ITEMS: Item[] = [
  { to: "/settings", label: "Overview", exact: true },
  { to: "/settings/students", label: "Students" },
  { to: "/settings/subjects", label: "Subjects" },
  { to: "/settings/system", label: "System" },
];

export function AdminNav() {
  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-0 z-10 -mx-1 flex flex-wrap justify-center gap-1.5 bg-canvas/90 px-1 py-2 backdrop-blur"
    >
      {ITEMS.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          activeOptions={item.exact ? { exact: true } : undefined}
          className="inline-flex min-h-[40px] items-center rounded-full px-4 font-sans text-[17px] font-semibold text-ink-2 transition-colors hover:bg-canvas hover:text-ink"
          // activeProps swaps in the filled brand pill when this is the current
          // route (TanStack merges the className for the active state).
          activeProps={{
            className:
              "bg-brand text-white hover:bg-brand-hover hover:text-white",
          }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
