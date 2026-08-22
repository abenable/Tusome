// Shared admin display primitives — SectionCard, MetricCard, ProgressBar,
// ProgressRing, Percent. Styled to DESIGN.md (white cards on canvas, 18px
// radius, hairline border, single brand accent, Manrope, no shadows on chrome).

import { type LucideIcon } from "lucide-react";
import { type JSX, type ReactNode } from "react";

/** A white card with an icon-chip header. The structural unit of every admin
 *  page. The optional `count` shows as a muted pill in the header row. */
export function SectionCard({
  icon: Icon,
  title,
  count,
  ariaLabel,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  ariaLabel: string;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface p-6 lg:p-7"
      aria-label={ariaLabel}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-ink-2">
          <Icon size={18} aria-hidden />
        </span>
        <h2 className="font-heading text-[22px] font-bold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {count !== undefined ? (
          <span className="inline-flex items-center rounded-full bg-canvas px-2.5 py-1 font-sans text-[14px] font-bold text-ink-3">
            {count}
          </span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A big-number metric tile for overview dashboards. */
export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-surface p-5">
      <span className="font-sans text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">
        {label}
      </span>
      <span className="font-heading text-[31px] font-extrabold leading-none tracking-tight text-ink">
        {value}
      </span>
      {sub ? <span className="font-sans text-[15px] text-ink-3">{sub}</span> : null}
    </div>
  );
}

/** Format a 0..1 fraction as a whole-number percent. */
export function Percent({ value }: { value: number }): JSX.Element {
  return <>{Math.round(value * 100)}%</>;
}

/** A linear progress bar (0..1). Flat, single-accent fill on a canvas track. */
export function ProgressBar({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}): JSX.Element {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      className={`inline-flex h-2 w-full overflow-hidden rounded-full bg-canvas ${className}`}
      aria-hidden
    >
      <span
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** A donut progress ring (0..1). Uses currentColor for the arc so the caller
 *  can tint it per subject via a text-* class. */
export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  className = "",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}): JSX.Element {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const offset = c * (1 - pct);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      ) : null}
    </span>
  );
}
