// Placeholder card used by the admin sub-pages while they are being built out
// (P0 routing shell → each page's real content lands in a later phase).

import { type JSX } from "react";

export function ComingSoon({
  title,
  note,
}: {
  title: string;
  note?: string;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6">
      <h2 className="font-heading text-[22px] font-bold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <p className="font-sans text-[18px] leading-relaxed text-ink-3">
        {note ?? "This section is being built."}
      </p>
    </section>
  );
}
