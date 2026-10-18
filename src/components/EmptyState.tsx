// A small, reusable empty-state block. Used by the topic-list page (W3) and
// later by the dashboard (W5) and settings (W7) when there is nothing to show.
//
// A dashed card with an icon, a headline and one line of guidance. Any
// interactive child (e.g. a CTA) is the caller's responsibility and must meet
// the 44px touch target — this component does not constrain its children.

import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";

export type EmptyStateProps = {
  title: string;
  message: string;
  children?: ReactNode;
};

export function EmptyState({ title, message, children }: EmptyStateProps) {
  return (
    <section
      className="flex max-w-[640px] flex-col items-start gap-3 rounded-card border-2 border-dashed border-line px-8 py-10"
      // landmark + role so the empty state is findable by screen readers as a
      // distinct region, not just a loose stack of paragraphs.
      aria-label={title}
    >
      <span className="mb-1 flex size-12 items-center justify-center rounded-tile bg-sun-tint text-sun-ink">
        <PackageOpen size={24} aria-hidden />
      </span>
      <h2 className="font-heading text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h2>
      <p className="font-sans text-[18px] leading-relaxed text-ink-2">
        {message}
      </p>
      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
    </section>
  );
}
