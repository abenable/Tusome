// A small, reusable empty-state block. Used by the topic-list page (W3) and
// later by the dashboard (W5) and settings (W7) when there is nothing to show.
//
// Keeps to the DESIGN.md voice: a quiet headline (display-md cadence, 34px /
// 600 / tracking-tight) and a muted 17px body paragraph. Any interactive child
// (e.g. a CTA) is the caller's responsibility and must meet the 44px touch
// target — this component does not constrain its children's sizing.

import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  message: string;
  children?: ReactNode;
};

export function EmptyState({ title, message, children }: EmptyStateProps) {
  return (
    <section
      className="flex flex-col gap-4"
      // landmark + role so the empty state is findable by screen readers as a
      // distinct region, not just a loose stack of paragraphs.
      aria-label={title}
    >
      <h2 className="font-heading text-[38px] font-semibold leading-tight tracking-tight text-ink">
        {title}
      </h2>
      <p className="font-sans text-[19px] leading-relaxed text-ink-2">
        {message}
      </p>
      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
    </section>
  );
}
